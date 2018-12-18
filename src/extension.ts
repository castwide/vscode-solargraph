'use strict';

import { ExtensionContext } from 'vscode';
import * as vscode from 'vscode';
import * as solargraph from 'solargraph-utils';
import { LanguageClient, Disposable } from 'vscode-languageclient';
import { makeLanguageClient } from './language-client';
import SolargraphWebviewProvider from './SolargraphWebviewProvider';

export function activate(context: ExtensionContext) {

	let applyConfiguration = function(config:solargraph.Configuration) {
		let vsconfig = vscode.workspace.getConfiguration('solargraph');
		config.commandPath = vsconfig.commandPath || 'solargraph';
		config.useBundler  = vsconfig.useBundler || false;
		config.bundlerPath = vsconfig.bundlerPath || 'bundle';
		config.viewsPath   = vscode.extensions.getExtension('castwide.solargraph').extensionPath + '/views';
		config.withSnippets = vsconfig.withSnippets || false;
		config.workspace = vscode.workspace.rootPath || null;
	}
	let solargraphConfiguration = new solargraph.Configuration();
	applyConfiguration(solargraphConfiguration);
	
	let languageClient: LanguageClient;
	let disposableClient: Disposable;
	let webViewProvider: SolargraphWebviewProvider = new SolargraphWebviewProvider();

	var startLanguageServer = function () {
		languageClient = makeLanguageClient(solargraphConfiguration);
		languageClient.onReady().then(() => {
			languageClient.onNotification('$/solargraph/restart', (params) => {
				console.log('I should restart!');
			});
		});
		disposableClient = languageClient.start();
		webViewProvider.setLanguageClient(languageClient);
		context.subscriptions.push(disposableClient);
	}

	var restartLanguageServer = function (): Promise<void> {
		return new Promise((resolve) => {
			if (languageClient) {
				languageClient.stop().then(() => {
					disposableClient.dispose();
					startLanguageServer();
					resolve();
				});
			} else {
				startLanguageServer();
				resolve();
			}
		});
	}

	// Open URL command (used internally for browsing documentation pages)
	var disposableOpenUrl = vscode.commands.registerCommand('solargraph._openDocumentUrl', (uriString: string) => {
		var uri = vscode.Uri.parse(uriString);
		webViewProvider.open(uri);
	});
	context.subscriptions.push(disposableOpenUrl);


	// Restart command
	var disposableRestart = vscode.commands.registerCommand('solargraph.restart', () => {
		restartLanguageServer().then(() => {
			vscode.window.showInformationMessage('Solargraph server restarted.');
		});
	});
	context.subscriptions.push(disposableRestart);

	// Search command
	var disposableSearch = vscode.commands.registerCommand('solargraph.search', () => {
		vscode.window.showInputBox({prompt: 'Search Ruby documentation:'}).then(val => {
			if (val) {
				var uri = 'solargraph:/search?query=' + encodeURIComponent(val);
				webViewProvider.open(vscode.Uri.parse(uri));
			}
		});
	});
	context.subscriptions.push(disposableSearch);

	// Check gem version command
	var disposableCheckGemVersion = vscode.commands.registerCommand('solargraph.checkGemVersion', () => {
		languageClient.sendNotification('$/solargraph/checkGemVersion', { verbose: true });
	});
	context.subscriptions.push(disposableCheckGemVersion);
	
	// Build gem documentation command
	var disposableBuildGemDocs = vscode.commands.registerCommand('solargraph.buildGemDocs', () => {
		let prepareStatus = vscode.window.setStatusBarMessage('Building new gem documentation...');
		languageClient.sendRequest('$/solargraph/documentGems', { rebuild: false }).then((response) => {
			prepareStatus.dispose();
			if (response['status'] == 'ok') {
				vscode.window.setStatusBarMessage('Gem documentation complete.', 3000);
			} else {
				vscode.window.setStatusBarMessage('An error occurred building gem documentation.', 3000);
			}
		});
	});
	context.subscriptions.push(disposableBuildGemDocs);

	// Rebuild gems documentation command
	var disposableRebuildAllGemDocs = vscode.commands.registerCommand('solargraph.rebuildAllGemDocs', () => {
		let prepareStatus = vscode.window.setStatusBarMessage('Rebuilding all gem documentation...');
		languageClient.sendRequest('$/solargraph/documentGems', { rebuild: true }).then((response) => {
			prepareStatus.dispose();
			if (response['status'] == 'ok') {
				vscode.window.setStatusBarMessage('Gem documentation complete.', 3000);
			} else {
				vscode.window.setStatusBarMessage('An error occurred rebuilding gem documentation.', 3000);
			}
		});
	});
	context.subscriptions.push(disposableRebuildAllGemDocs);

	// Solargraph configuration command
	var disposableSolargraphConfig = vscode.commands.registerCommand('solargraph.config', () => {
		var child = solargraph.commands.solargraphCommand(['config'], solargraphConfiguration);
		child.on('exit', (code) => {
			if (code == 0) {
				vscode.window.showInformationMessage('Created default .solargraph.yml file.');
			} else {
				vscode.window.showErrorMessage('Error creating .solargraph.yml file.');
			}
		});
	});
	context.subscriptions.push(disposableSolargraphConfig);
	
	// Solargraph download core command
	var disposableSolargraphDownloadCore = vscode.commands.registerCommand('solargraph.downloadCore', () => {
		if (languageClient) {
			languageClient.sendNotification('$/solargraph/downloadCore');
		} else {
			vscode.window.showInformationMessage('Solargraph is still starting. Please try again in a moment.');
		}
	});
	context.subscriptions.push(disposableSolargraphDownloadCore);

	startLanguageServer();
	languageClient.onReady().then(() => {
		if (vscode.workspace.getConfiguration('solargraph').checkGemVersion) {
			languageClient.sendNotification('$/solargraph/checkGemVersion', { verbose: false });
		}
	});
}

export function deactivate() {
	// TODO: Any cleanup necessary?
}
