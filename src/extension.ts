'use strict';
import * as vscode from 'vscode';
import * as path from 'path';
import * as child_process from 'child_process';
import * as request from 'request';
import * as fs from 'fs';

function solargraphCommand(args) {
	let cmd = [];
	if (process.platform === 'win32') cmd.push('cmd', '/c');
	if (vscode.workspace.getConfiguration('solargraph').useBundler) {
		// TODO: pathToBundler configuration
		cmd.push('bundle', 'exec', 'solargraph');
	} else {
		cmd.push(vscode.workspace.getConfiguration('solargraph').commandPath);
	}
	var env = {};
	if (vscode.workspace.rootPath) env['cwd'] = vscode.workspace.rootPath;
	return child_process.spawn(cmd.shift(), cmd.concat(args), env);
}

function yardCommand(args) {
	let cmd = [];
	if (process.platform === 'win32') cmd.push('cmd', '/c');
	if (vscode.workspace.getConfiguration('solargraph').useBundler) {
		cmd.push('bundle', 'exec', 'yard');
	} else {
		cmd.push('yard');
	}
	var env = {};
	if (vscode.workspace.rootPath) env['cwd'] = vscode.workspace.rootPath;
	return child_process.spawn(cmd.shift(), cmd.concat(args), env);
}

function gemCommand(args) {
	let cmd = [];
	if (process.platform === 'win32') cmd.push('cmd', '/c');
	if (vscode.workspace.getConfiguration('solargraph').useBundler) {
		cmd.push('bundle', 'exec', 'gem');
	} else {
		cmd.push('gem');
	}
	var env = {};
	if (vscode.workspace.rootPath) env['cwd'] = vscode.workspace.rootPath;
	return child_process.spawn(cmd.shift(), cmd.concat(args), env);
}

const completionProvider = {
    provideCompletionItems: function completionProvider(document: vscode.TextDocument, position: vscode.Position) {
        return new Promise((resolve, reject) => {
			console.log('Running the completion provider line ' + position.line + ', column ' + position.character);
			console.log('Workspace is ' + vscode.workspace.rootPath);
            const kinds = {
                "Class": vscode.CompletionItemKind.Class,
                "Keyword": vscode.CompletionItemKind.Keyword,
                "Module": vscode.CompletionItemKind.Module,
                "Method": vscode.CompletionItemKind.Method,
                "Variable": vscode.CompletionItemKind.Variable,
                "Snippet": vscode.CompletionItemKind.Snippet
            }
			// HACK: Tricking the type system to avoid an invalid error
			let SnippetString = vscode['SnippetString'];
			let child = solargraphCommand([
				'suggest',
				'--line=' + position.line,
				'--column=' + position.character,
				'--filename=' + document.fileName
			]);
			let errbuf = [], outbuf = [];
			child.stderr.on('data', (data) => {
				console.log(data.toString());
				errbuf.push(data);
			});
			child.stdout.on('data', (data) => outbuf.push(data));
			child.on('exit', () => {
				var data = outbuf.join('');
				if (data == "") {
					return resolve([]);
				} else {
					let result = JSON.parse(data);
					let items = [];
					if (result.status == "ok") {
						var range = document.getWordRangeAtPosition(position);
						if (range) {
							var repl = document.getText(range);
							if (range.start.character > 0) {
								if (repl.substr(0, 1) == ':') {
									var prevChar = document.getText(new vscode.Range(range.start.line, range.start.character - 1, range.start.line, range.start.character));
									if (prevChar == ':') {
										// Replacement range starts with a colon, but there's
										// a previous colon. That means we're in a namespace,
										// not a symbol. Get rid of the colon in the namespace
										// range.
										range = new vscode.Range(range.start.line, range.start.character + 1, range.end.line, range.end.character);
									}
								}
							}
						}
						result.suggestions.forEach((cd) => {
							var item = new vscode.CompletionItem(cd['label'], kinds[cd['kind']]);
							// Treat instance variables slightly differently
							if (cd['insert'].substring(0, 1) == '@') {
								item.insertText = cd['insert'].substring(1);
							} else {
								item.insertText = new SnippetString(cd['insert']);
							}
							if (range) {
								// HACK: Unrecognized property
								item['range'] = range;
							}
							item.detail = cd['detail'];
							item.documentation = cd['documentation'];
							items.push(item);
						});
						return resolve(items);
					} else {
						return resolve([]);
					}
				}
			});
			child.on('error', () => {
				if (errbuf.length) {
					console.log(errbuf.join("\n"));
				}
			});
			child.stdin.end(document.getText());
        });
    }
}

function updateCache(saved: vscode.TextDocument) {
	yardCommand([]);
	solargraphCommand(['serialize', vscode.workspace.rootPath]);
}

function checkGemVersion() {
	let child = gemCommand(['outdated']);
	let result = "\n";
	child.stdout.on('data', (data:Buffer) => {
		result += data.toString();
	});
	child.on('exit', () => {
		if (result.match(/[\s]solargraph[\s]/)) {
			vscode.window.showInformationMessage('A new version of the Solargraph gem is available. Run `gem update solargraph` or update your Gemfile to install it.');
		}
	});
}

export function activate(context: vscode.ExtensionContext) {
	const solargraphTest = solargraphCommand(['prepare']);
	solargraphTest.on('exit', () => {
		console.log('The Solargraph gem is installed and working.');
		checkGemVersion();
		context.subscriptions.push(vscode.languages.registerCompletionItemProvider('ruby', completionProvider, '.'));
		yardCommand(['gems']);
		if (vscode.workspace.rootPath) {
			yardCommand([]);
			solargraphCommand(['serialize', vscode.workspace.rootPath]);
			context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(updateCache));
		}
	});
	solargraphTest.on('error', () => {
		console.log('The Solargraph gem is not available.');
	});
    console.log('Solargraph extension activated.');
}

export function deactivate() {
    console.log('Deactivating extension');
}
