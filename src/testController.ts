'use strict';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { LanguageClient } from 'vscode-languageclient/node';
import { rubySpawn } from 'ruby-spawn';

const EXCLUDED_GLOB = '{**/spec/fixtures/**,**/spec/support/**,**/spec_helper.rb,**/rails_helper.rb}';
const RUN_RSPEC_COMMAND = 'solargraph.runRspec';

/** Arguments of the `solargraph.runRspec` command, provided by solargraph-rspec code lenses */
export interface RspecCommand {
  command: string;       // e.g. "bundle exec rspec /abs/spec/foo_spec.rb:12"
  executable?: string[]; // e.g. ["bundle", "exec", "rspec"]
  target?: string;       // e.g. "/abs/spec/foo_spec.rb:12"
}
interface CodeActionResult {
  command?: { command: string; arguments?: RspecCommand[] };
}

/* eslint-disable @typescript-eslint/naming-convention -- field names of the rspec JSON formatter */
/** An example in the output of `rspec --format json` */
interface RspecExample {
  id: string;               // e.g. "./spec/foo_spec.rb[1:2:1]"
  description: string;
  full_description: string;
  status?: 'passed' | 'failed' | 'pending';
  file_path: string;
  line_number: number;
  run_time?: number;
  exception?: { class: string; message: string; backtrace?: string[] };
}
/* eslint-enable @typescript-eslint/naming-convention */
interface RspecReport {
  examples: RspecExample[];
  messages?: string[];
}

type ItemKind = 'dir' | 'file' | 'example';

/** The spec file of an example, relative to the rspec working directory, e.g. "./spec/foo_spec.rb" */
function specFileOf(example: RspecExample): string {
  return example.id.replace(/\[[\d:]+\]$/, '');
}

export class SolargraphTestController {
  private controller: vscode.TestController;
  private fileItems = new Map<string, vscode.TestItem>();
  private kinds = new WeakMap<vscode.TestItem, ItemKind>();
  // rspec example id (e.g. "./spec/foo_spec.rb[1:2]") of each example item
  private exampleIds = new WeakMap<vscode.TestItem, string>();
  // One terminal per workspace folder for code lens clicks, keyed by folder URI string
  private terminals = new Map<string, vscode.Terminal>();
  private clientReady = false;

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly getClient: () => LanguageClient | undefined,
  ) {
    this.controller = vscode.tests.createTestController('solargraphRspec', 'RSpec');
    context.subscriptions.push(this.controller);

    this.controller.createRunProfile('Run', vscode.TestRunProfileKind.Run,
      (request, token) => this.runHandler(request, token), true);

    this.controller.resolveHandler = async (item) => {
      if (!item) {
        await this.discoverAllSpecs();
      } else if (this.kinds.get(item) === 'file') {
        await this.discoverExamples(item);
      }
    };
    context.subscriptions.push(
      vscode.window.onDidCloseTerminal(t => {
        this.terminals.forEach((term, key) => {
          if (term === t) {this.terminals.delete(key);}
        });
      }),
      // Refresh examples of files the user has already expanded
      vscode.workspace.onDidSaveTextDocument(doc => {
        const item = this.fileItems.get(doc.uri.toString());
        if (item && item.children.size > 0) {this.discoverExamples(item);}
      })
    );

    this.discoverAllSpecs();
    this.setupFileWatcher();
  }

  public markClientReady(): void { this.clientReady = true; }

  /** Called by the `solargraph.runRspec` command, i.e. when clicking a code lens */
  public async runRspecCommand(cmd: string, workspaceFolder?: vscode.WorkspaceFolder): Promise<void> {
    const terminal = this.getOrCreateTerminal(workspaceFolder);
    terminal.show(true);
    terminal.sendText(cmd);
  }

  /** Called by the `solargraph.testRspec` command, i.e. the code lens running a target in the Test Explorer */
  public async runRspecTarget(args: RspecCommand): Promise<void> {
    // e.g. "/abs/spec/foo_spec.rb:12", or the bare path for the whole file
    const match = args.target?.match(/^(.+?)(?::(\d+))?$/);
    if (!match || !args.executable) {
      vscode.window.showWarningMessage('Update solargraph-rspec to run code lenses in the Test Explorer.');
      return;
    }
    const fileItem = this.addSpecFile(vscode.Uri.file(match[1]));
    if (!fileItem) {return;}

    try {
      const include = match[2]
        ? await this.itemsAtLine(fileItem, Number(match[2]) - 1, args as Required<RspecCommand>)
        : [fileItem];
      if (include.length > 0) {await this.runHandler(new vscode.TestRunRequest(include));}
    } catch (err: any) {
      vscode.window.showErrorMessage(`RSpec: ${err?.message ?? String(err)}`);
    }
  }

  /** The examples rspec runs for `file:line`, e.g. every example of the describe block on that line */
  private async itemsAtLine(fileItem: vscode.TestItem, line: number, rspec: Required<RspecCommand>)
    : Promise<vscode.TestItem[]> {
    let exact: vscode.TestItem | undefined;
    fileItem.children.forEach(child => { if (child.range?.start.line === line) {exact = child;} });
    if (exact) {return [exact];}

    const folder = vscode.workspace.getWorkspaceFolder(fileItem.uri!);
    if (!folder) {return [];}
    fileItem.busy = true;
    try {
      const { report } = await this.spawnRspec(folder, rspec.executable, [rspec.target, '--dry-run']);
      return (report?.examples ?? [])
        .filter(example => this.fileItemFor(folder, example) === fileItem)
        .map(example => this.findOrCreateExampleItem(fileItem, example));
    } finally {
      fileItem.busy = false;
    }
  }

  // --- Discovery -----------------------------------------------------------

  private async discoverAllSpecs(): Promise<void> {
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      const files = await vscode.workspace.findFiles(
        new vscode.RelativePattern(folder, '**/*_spec.rb'), EXCLUDED_GLOB);
      files.forEach(f => this.addSpecFile(f));
    }
  }

  private setupFileWatcher(): void {
    const watcher = vscode.workspace.createFileSystemWatcher('**/*_spec.rb');
    watcher.onDidCreate(uri => this.addSpecFile(uri));
    watcher.onDidDelete(uri => this.removeSpecFile(uri));
    this.context.subscriptions.push(watcher);
  }

  private addSpecFile(uri: vscode.Uri): vscode.TestItem | undefined {
    const key = uri.toString();
    const existing = this.fileItems.get(key);
    if (existing || this.isExcluded(uri)) {return existing;}

    const item = this.controller.createTestItem(key, path.basename(uri.fsPath), uri);
    item.canResolveChildren = true;
    this.kinds.set(item, 'file');

    this.getOrCreateDirItem(uri).children.add(item);
    this.fileItems.set(key, item);
    return item;
  }

  private removeSpecFile(uri: vscode.Uri): void {
    const key = uri.toString();
    const item = this.fileItems.get(key);
    if (!item) {return;}
    this.fileItems.delete(key);
    // Remove the file, then any folders it leaves empty
    let current: vscode.TestItem | undefined = item;
    while (current) {
      const parent: vscode.TestItem | undefined = current.parent;
      (parent ? parent.children : this.controller.items).delete(current.id);
      if (!parent || parent.children.size > 0) {break;}
      current = parent;
    }
  }

  /** Lists a file's examples without running them, via `rspec --dry-run` */
  private async discoverExamples(fileItem: vscode.TestItem): Promise<void> {
    const folder = fileItem.uri && vscode.workspace.getWorkspaceFolder(fileItem.uri);
    if (!folder) {return;}

    fileItem.busy = true;
    try {
      const rspec = await this.rspecCommandFor(fileItem.uri!);
      if (!rspec) {return;}
      const { report } = await this.spawnRspec(folder, rspec.executable, [rspec.target, '--dry-run']);
      if (!report) {return;}

      const items = report.examples
        .filter(example => this.fileItemFor(folder, example) === fileItem)
        .map(example => this.createExampleItem(fileItem, example));
      fileItem.children.replace(items);
      fileItem.error = undefined;
    } catch (err: any) {
      fileItem.error = err?.message ?? String(err);
    } finally {
      fileItem.busy = false;
    }
  }

  private getOrCreateDirItem(fileUri: vscode.Uri): vscode.TestItem {
    const folder = vscode.workspace.getWorkspaceFolder(fileUri);
    if (!folder) {return this.getOrCreateRootItem();}

    // Mirror the folder structure, e.g. spec > models > user_spec.rb, so any folder (spec itself included) runs in one go
    const segments = path.relative(folder.uri.fsPath, path.dirname(fileUri.fsPath)).split(path.sep).filter(Boolean);
    let collection = this.controller.items;
    let dirItem: vscode.TestItem | undefined;
    let dirUri = folder.uri;
    for (const segment of segments) {
      dirUri = vscode.Uri.joinPath(dirUri, segment);
      let child = collection.get(dirUri.toString());
      if (!child) {
        child = this.controller.createTestItem(dirUri.toString(), segment, dirUri);
        this.kinds.set(child, 'dir');
        collection.add(child);
      }
      dirItem = child;
      collection = child.children;
    }
    return dirItem ?? this.getOrCreateRootItem();
  }

  private getOrCreateRootItem(): vscode.TestItem {
    let root = this.controller.items.get('root');
    if (!root) {
      root = this.controller.createTestItem('root', 'spec');
      this.kinds.set(root, 'dir');
      this.controller.items.add(root);
    }
    return root;
  }

  private isExcluded(uri: vscode.Uri): boolean {
    const p = uri.fsPath;
    return p.includes('/spec/fixtures/') || p.includes('/spec/support/') ||
           p.endsWith('spec_helper.rb') || p.endsWith('rails_helper.rb');
  }

  // --- Running -------------------------------------------------------------

  /** Without a token (runs started from a code lens), the run's own token cancels it from the Test Results view */
  private async runHandler(request: vscode.TestRunRequest, profileToken?: vscode.CancellationToken): Promise<void> {
    const run = this.controller.createTestRun(request);
    const token = profileToken ?? run.token;

    try {
      if (!this.clientReady || !this.getClient()) {
        run.appendOutput('Solargraph is still starting. Try again in a moment.\r\n');
        return;
      }

      // Runnable items (folders, files and examples) grouped by workspace folder
      const groups = new Map<vscode.WorkspaceFolder, vscode.TestItem[]>();
      const excluded = new Set(request.exclude ?? []);
      const topLevel: vscode.TestItem[] = [];
      this.controller.items.forEach(item => { topLevel.push(item); });
      const roots = request.include ?? topLevel;
      for (const item of this.runnableItems(roots, excluded)) {
        const folder = item.uri && vscode.workspace.getWorkspaceFolder(item.uri);
        if (!folder) {continue;}
        groups.set(folder, [...(groups.get(folder) ?? []), item]);
      }

      for (const [folder, items] of groups) {
        if (token.isCancellationRequested) {break;}
        await this.runGroup(run, folder, items, token);
      }
    } catch (err: any) {
      run.appendOutput(`Error: ${err?.message ?? String(err)}\r\n`);
    } finally {
      run.end();
    }
  }

  /** Folders run as a whole (rspec takes directories) unless something inside them is excluded */
  private runnableItems(items: readonly vscode.TestItem[], excluded: Set<vscode.TestItem>): vscode.TestItem[] {
    const result: vscode.TestItem[] = [];
    for (const item of items) {
      if (excluded.has(item)) {continue;}
      if (this.kinds.get(item) === 'dir' && item.uri && !this.containsAny(item, excluded)) {
        result.push(item);
      } else if (this.kinds.get(item) === 'dir') {
        const children: vscode.TestItem[] = [];
        item.children.forEach(child => { children.push(child); });
        result.push(...this.runnableItems(children, excluded));
      } else {
        result.push(item);
      }
    }
    return result;
  }

  private async runGroup(run: vscode.TestRun, folder: vscode.WorkspaceFolder, items: vscode.TestItem[],
                         token: vscode.CancellationToken): Promise<void> {
    // The server decides how rspec is invoked (e.g. through Bundler); ask it once per folder
    const fileUri = items.map(item => this.firstFileUri(item)).find(uri => uri);
    const rspec = fileUri && await this.rspecCommandFor(fileUri);
    if (!rspec) {
      const message = new vscode.TestMessage(
        'Solargraph returned no RSpec command. Make sure the solargraph-rspec plugin is enabled and up to date.');
      items.forEach(item => run.errored(item, message));
      return;
    }

    const targets = items.map(item => this.kinds.get(item) === 'example'
      ? this.exampleIds.get(item)!
      : path.relative(folder.uri.fsPath, item.uri!.fsPath));
    items.forEach(item => this.forEachLeaf(item, leaf => run.started(leaf)));

    const { report, exitCode } = await this.spawnRspec(folder, rspec.executable, targets, run, token);
    if (token.isCancellationRequested) {
      items.forEach(item => this.forEachLeaf(item, leaf => run.skipped(leaf)));
      return;
    }

    const reported = new Set<vscode.TestItem>();
    for (const example of report?.examples ?? []) {
      const fileItem = this.fileItemFor(folder, example);
      if (!fileItem) {continue;}
      const exampleItem = this.findOrCreateExampleItem(fileItem, example);
      this.reportResult(run, exampleItem, example);
      reported.add(exampleItem);
      reported.add(fileItem);
    }

    // e.g. a syntax error in a spec file: rspec fails before running any examples
    if (exitCode !== 0) {
      const detail = report?.messages?.join('\n') || `rspec exited with code ${exitCode}. See the output for details.`;
      items.filter(item => !reported.has(item))
        .forEach(item => run.errored(item, new vscode.TestMessage(detail)));
    }
  }

  private reportResult(run: vscode.TestRun, item: vscode.TestItem, example: RspecExample): void {
    const duration = example.run_time !== undefined ? example.run_time * 1000 : undefined;
    switch (example.status) {
      case 'passed':
        run.passed(item, duration);
        break;
      case 'pending':
        run.skipped(item);
        break;
      case 'failed': {
        const exception = example.exception;
        const message = new vscode.TestMessage(exception
          ? `${exception.class}:\n${exception.message}`
          : 'Failed');
        message.location = this.failureLocation(item, exception?.backtrace);
        run.failed(item, message, duration);
        break;
      }
    }
  }

  /** The first backtrace frame in the example's own file, falling back to the example itself */
  private failureLocation(item: vscode.TestItem, backtrace?: string[]): vscode.Location | undefined {
    if (!item.uri) {return undefined;}
    const folder = vscode.workspace.getWorkspaceFolder(item.uri);
    for (const frame of backtrace ?? []) {
      // e.g. "./spec/foo_spec.rb:12:in `block (2 levels) in <top (required)>'"
      const match = frame.match(/^(.+?):(\d+)(?::in |$)/);
      if (!match) {continue;}
      const framePath = folder ? path.resolve(folder.uri.fsPath, match[1]) : match[1];
      if (framePath === item.uri.fsPath) {
        return new vscode.Location(item.uri, new vscode.Position(Number(match[2]) - 1, 0));
      }
    }
    return item.range ? new vscode.Location(item.uri, item.range) : undefined;
  }

  // --- Helpers -------------------------------------------------------------

  /** Asks the server for the command running a whole file, via the file-level code lens on its first line */
  private async rspecCommandFor(uri: vscode.Uri): Promise<Required<RspecCommand> | undefined> {
    const client = this.getClient();
    if (!client) {return undefined;}
    const actions = await client.sendRequest<CodeActionResult[] | null>('textDocument/codeAction', {
      textDocument: { uri: uri.toString() },
      range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } },
      context: { diagnostics: [] }
    });
    const args = actions?.find(a => a.command?.command === RUN_RSPEC_COMMAND)?.command?.arguments?.[0];
    if (!args?.executable || !args.target) {return undefined;}
    return args as Required<RspecCommand>;
  }

  /**
   * Runs rspec with a JSON report, streaming its console output to the test run.
   * Resolves once rspec exits.
   */
  private spawnRspec(folder: vscode.WorkspaceFolder, executable: string[], args: string[],
                     run?: vscode.TestRun, token?: vscode.CancellationToken)
    : Promise<{ report?: RspecReport; exitCode: number | null }> {
    const reportPath = path.join(os.tmpdir(), `solargraph-rspec-${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
    const [command, ...commandArgs] = executable;
    const fullArgs = [...commandArgs, ...args, '--format', 'progress', '--format', 'json', '--out', reportPath];
    run?.appendOutput(`$ ${executable.concat(args).join(' ')}\r\n`);

    return new Promise((resolve, reject) => {
      // Detached so cancelling kills the whole process group, not only the login shell wrapping rspec
      const child = rubySpawn(command, fullArgs, { cwd: folder.uri.fsPath, detached: true });
      const cancellation = token?.onCancellationRequested(() => {
        try { process.kill(-child.pid!, 'SIGTERM'); } catch { child.kill(); }
      });
      const forward = (data: Buffer) => run?.appendOutput(data.toString().replace(/\r?\n/g, '\r\n'));
      let stderr = '';
      child.stdout?.on('data', forward);
      child.stderr?.on('data', (data: Buffer) => { stderr += data.toString(); forward(data); });
      child.on('error', err => { cancellation?.dispose(); reject(err); });
      child.on('close', exitCode => {
        cancellation?.dispose();
        let report: RspecReport | undefined;
        try {
          report = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
        } catch {
          if (!run && exitCode !== 0) {
            reject(new Error(stderr.trim() || `rspec exited with code ${exitCode}`));
            return;
          }
        } finally {
          fs.rm(reportPath, { force: true }, () => undefined);
        }
        resolve({ report, exitCode });
      });
    });
  }

  /** The spec file an example belongs to. Shared examples report the shared file as file_path, so use the id. */
  private fileItemFor(folder: vscode.WorkspaceFolder, example: RspecExample): vscode.TestItem | undefined {
    return this.fileItems.get(vscode.Uri.file(path.resolve(folder.uri.fsPath, specFileOf(example))).toString());
  }

  private findOrCreateExampleItem(fileItem: vscode.TestItem, example: RspecExample): vscode.TestItem {
    const existing = fileItem.children.get(this.exampleItemId(fileItem, example));
    if (existing) {return existing;}
    const item = this.createExampleItem(fileItem, example);
    fileItem.children.add(item);
    return item;
  }

  private createExampleItem(fileItem: vscode.TestItem, example: RspecExample): vscode.TestItem {
    const item = this.controller.createTestItem(
      this.exampleItemId(fileItem, example), example.description || example.full_description, fileItem.uri);
    const context = example.description && example.full_description.endsWith(example.description)
      ? example.full_description.slice(0, -example.description.length).trim()
      : '';
    if (context) {item.description = context;}
    // Examples from shared groups point at the shared file, which is not this item's file
    if (path.normalize(example.file_path) === path.normalize(specFileOf(example))) {
      item.range = new vscode.Range(example.line_number - 1, 0, example.line_number - 1, 0);
    }
    this.kinds.set(item, 'example');
    this.exampleIds.set(item, example.id);
    return item;
  }

  private exampleItemId(fileItem: vscode.TestItem, example: RspecExample): string {
    return `${fileItem.id}#${example.id}`;
  }

  private containsAny(item: vscode.TestItem, items: Set<vscode.TestItem>): boolean {
    let found = false;
    item.children.forEach(child => { found = found || items.has(child) || this.containsAny(child, items); });
    return found;
  }

  /** A spec file at or under the item; the server resolves the rspec command per file */
  private firstFileUri(item: vscode.TestItem): vscode.Uri | undefined {
    if (this.kinds.get(item) !== 'dir') {return item.uri;}
    let uri: vscode.Uri | undefined;
    item.children.forEach(child => { uri = uri ?? this.firstFileUri(child); });
    return uri;
  }

  private forEachLeaf(item: vscode.TestItem, fn: (leaf: vscode.TestItem) => void): void {
    if (item.children.size === 0) {
      fn(item);
    } else {
      item.children.forEach(child => this.forEachLeaf(child, fn));
    }
  }

  private getOrCreateTerminal(folder?: vscode.WorkspaceFolder): vscode.Terminal {
    const key = folder?.uri.toString() ?? 'default';
    const existing = this.terminals.get(key);
    if (existing) {return existing;}

    const name = folder ? `${folder.name}: rspec` : 'rspec';
    const terminal = vscode.window.createTerminal({ name, cwd: folder?.uri });
    this.terminals.set(key, terminal);
    return terminal;
  }
}
