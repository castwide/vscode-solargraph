'use strict';

import * as path from 'path';

import { workspace, ExtensionContext, Hover, MarkdownString, ProviderResult } from 'vscode';
import * as vscode from 'vscode';
import * as solargraph from 'solargraph-utils';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind, Middleware, RequestType, MessageTransports, createClientSocketTransport, Disposable } from 'vscode-languageclient';
import SolargraphDocumentProvider from './SolargraphDocumentProvider';
import { makeLanguageClient } from './language-client';

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
	
	let solargraphDocumentProvider = new SolargraphDocumentProvider();

	let languageClient: LanguageClient;
	let disposableClient: Disposable;

	var startLanguageServer = function() {
		languageClient = makeLanguageClient(solargraphConfiguration);
		languageClient.onReady().then(() => {
			languageClient.onNotification('$/solargraph/restart', (params) => {
				console.log('I should restart!');
			});	
		});
		solargraphDocumentProvider.setLanguageClient(languageClient);
		disposableClient = languageClient.start();
		context.subscriptions.push(disposableClient);
	}

	// https://css-tricks.com/snippets/javascript/get-url-variables/
	var getQueryVariable = function (query, variable) {
		var vars = query.split("&");
		for (var i = 0; i < vars.length; i++) {
			var pair = vars[i].split("=");
			if (pair[0] == variable) { return pair[1]; }
		}
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

	// Open command (used internally for browsing documentation pages)
	var disposableOpen = vscode.commands.registerCommand('solargraph._openDocument', (uriString: string) => {
		var uri = vscode.Uri.parse(uriString);
		var label = (uri.path == '/search' ? 'Search for ' : '') + getQueryVariable(uri.query, "query");
		vscode.commands.executeCommand('vscode.previewHtml', uri, vscode.ViewColumn.Two, label);
	});
	context.subscriptions.push(disposableOpen);

	// Open URL command (used internally for browsing documentation pages)
	var disposableOpenUrl = vscode.commands.registerCommand('solargraph._openDocumentUrl', (uriString: string) => {
		var uri = vscode.Uri.parse(uriString);
		var label = (uri.path == '/search' ? 'Search for ' : '') + getQueryVariable(uri.query, "query");
		vscode.commands.executeCommand('vscode.previewHtml', uri, vscode.ViewColumn.Two, label);
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
				vscode.commands.executeCommand('solargraph._openDocument', uri);
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

	vscode.workspace.registerTextDocumentContentProvider('solargraph', solargraphDocumentProvider);
}

export function deactivate() {
	// TODO: Any cleanup necessary?
}
