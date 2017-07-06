'use strict';
import * as vscode from 'vscode';
import * as cmd from './commands';
import YardContentProvider from './YardContentProvider';
import RubyCompletionItemProvider from './RubyCompletionItemProvider';
import RubySignatureHelpProvider from './RubySignatureHelpProvider';
import RubyHoverProvider from './RubyHoverProvider';
import * as solargraph from 'solargraph-utils';

const solargraphServer = new solargraph.Server();

function prepareWorkspace() {
	if (solargraphServer.isRunning() && vscode.workspace.rootPath) {
		var prepareStatus = vscode.window.setStatusBarMessage('Analyzing Ruby code in workspace ' + vscode.workspace.rootPath);
		solargraphServer.prepare(vscode.workspace.rootPath).then(function() {
			prepareStatus.dispose();
		}).catch(function() {
			prepareStatus.dispose();
			vscode.window.setStatusBarMessage('There was an error analyzing the Ruby code.', 3000);
		});
	}
}

function updateYard(saved: vscode.TextDocument) {
	prepareWorkspace();
}

function checkGemVersion() {
	let child = cmd.gemCommand(['outdated']);
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

function serverConfiguration() {
	return {
		commandPath: vscode.workspace.getConfiguration('solargraph').commandPath,
		useBundler: vscode.workspace.getConfiguration('solargraph').useBundler,
		views: vscode.extensions.getExtension('castwide.solargraph').extensionPath + '/views',
		workspace: vscode.workspace.rootPath
	};
}

export function activate(context: vscode.ExtensionContext) {
	var disposableSearch = vscode.commands.registerCommand('solargraph.search', () => {
		vscode.window.showInputBox({prompt: 'Search Ruby documentation:'}).then(val => {
			if (val) {
				let uri = new vscode.Uri().with({scheme: 'solargraph', path: '/search', query: val});
				vscode.commands.executeCommand('solargraph._openDocument', uri);
			}
		});
	});
	context.subscriptions.push(disposableSearch);

	var disposableRestart = vscode.commands.registerCommand('solargraph.restart', () => {
		solargraphServer.restart(serverConfiguration());
		vscode.window.showInformationMessage('Solargraph server restarted.');
	});
	context.subscriptions.push(disposableRestart);

	var disposableOpen = vscode.commands.registerCommand('solargraph._openDocument', (uriString: string) => {
		console.log('String is ' + uriString);
		var uri = vscode.Uri.parse(uriString);
		console.log('Getting ' + uri);
		var label = (uri.path == '/search' ? 'Search for ' : '') + uri.query;
		vscode.commands.executeCommand('vscode.previewHtml', uri, vscode.ViewColumn.Two, label);
	});
	context.subscriptions.push(disposableOpen);

	var solargraphTest = cmd.solargraphCommand(['help']);
	solargraphTest.on('exit', () => {
		console.log('The Solargraph gem is installed and working.');
		checkGemVersion();
		cmd.yardCommand(['gems']);
		solargraphServer.configure(serverConfiguration());
		solargraphServer.start().then(function() {
			prepareWorkspace();
		});
		context.subscriptions.push(vscode.languages.registerCompletionItemProvider('ruby', new RubyCompletionItemProvider(solargraphServer), '.', '@'));
		context.subscriptions.push(vscode.languages.registerSignatureHelpProvider('ruby', new RubySignatureHelpProvider(solargraphServer), '(', ')'));
		context.subscriptions.push(vscode.languages.registerHoverProvider('ruby', new RubyHoverProvider(solargraphServer)));
		vscode.workspace.registerTextDocumentContentProvider('solargraph', new YardContentProvider(solargraphServer));
		context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(updateYard));
	});
	solargraphTest.on('error', () => {
		console.log('The Solargraph gem is not available.');
		vscode.window.showInformationMessage('Solargraph gem not found. Run `gem install solargraph` or update your Gemfile to install it.');
	});

    console.log('Solargraph extension activated.');
}

export function deactivate() {
	if (solargraphServer.isRunning()) solargraphServer.stop();
}
