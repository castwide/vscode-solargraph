'use strict';
import * as vscode from 'vscode';
import * as path from 'path';
import * as child_process from 'child_process';
import * as request from 'request';
import * as fs from 'fs';
import * as cmd from './commands';
import YardContentProvider from './YardContentProvider';
import RubyCompletionItemProvider from './RubyCompletionItemProvider';
import RubySignatureHelpProvider from './RubySignatureHelpProvider';
import RubyHoverProvider from './RubyHoverProvider';
import SolargraphServer from './SolargraphServer';

const solargraphServer = new SolargraphServer();

function updateYard(saved: vscode.TextDocument) {
	if (solargraphServer.isRunning()) {
		request.post({url:'http://localhost:' + solargraphServer.getPort() + '/prepare', form: {
			workspace: vscode.workspace.rootPath
		}});
	} else {
		// Keep the yardoc up to date when a server isn't running
		cmd.yardCommand([]);
	}
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

export function activate(context: vscode.ExtensionContext) {
	var disposableSearch = vscode.commands.registerCommand('solargraph.search', () => {
		vscode.window.showInputBox({prompt: 'Search Ruby documentation:'}).then(val => {
			let uri = new vscode.Uri().with({scheme: 'solargraph', path: '/search', query: val});
			vscode.commands.executeCommand('solargraph._openDocument', uri);
		});
	});
	context.subscriptions.push(disposableSearch);

	var disposableOpen = vscode.commands.registerCommand('solargraph._openDocument', (uriString: string) => {
		var uri = vscode.Uri.parse(uriString);
		var label = (uri.path == '/search' ? 'Search for ' : '') + uri.query;
		vscode.commands.executeCommand('vscode.previewHtml', uri, vscode.ViewColumn.Two, label);
	});
	context.subscriptions.push(disposableOpen);

	const solargraphTest = cmd.solargraphCommand(['prepare']);
	solargraphTest.on('exit', () => {
		console.log('The Solargraph gem is installed and working.');
		checkGemVersion();
		cmd.yardCommand(['gems']);
		if (vscode.workspace.getConfiguration("solargraph").useServer) {
			solargraphServer.start();
		} else {
			cmd.yardCommand([]); // Update the yardoc
		}
		context.subscriptions.push(vscode.languages.registerCompletionItemProvider('ruby', new RubyCompletionItemProvider(solargraphServer), '.', '@'));
		context.subscriptions.push(vscode.languages.registerSignatureHelpProvider('ruby', new RubySignatureHelpProvider(solargraphServer), '(', ')'));
		context.subscriptions.push(vscode.languages.registerHoverProvider('ruby', new RubyHoverProvider(solargraphServer)));
		context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(updateYard));
	});
	solargraphTest.on('error', () => {
		console.log('The Solargraph gem is not available.');
		vscode.window.showInformationMessage('Solargraph gem not found. Run `gem install solargraph` or update your Gemfile to install it.');
	});

    console.log('Solargraph extension activated.');
}

export function deactivate() {
	//if (solargraphServer.isRunning()) solargraphServer.stop();
}
