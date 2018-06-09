'use strict';

import * as path from 'path';

import { workspace, ExtensionContext, Hover, MarkdownString, ProviderResult } from 'vscode';
import * as vscode from 'vscode';
import * as solargraph from 'solargraph-utils';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind, Middleware, RequestType, MessageTransports, createClientSocketTransport, Disposable } from 'vscode-languageclient';
import SolargraphDocumentProvider from './SolargraphDocumentProvider';
import { makeLanguageClient } from './language-client';

let socketProvider: solargraph.SocketProvider;

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
	socketProvider = new solargraph.SocketProvider(solargraphConfiguration);
	
	let solargraphDocumentProvider = new SolargraphDocumentProvider();

	let languageClient: LanguageClient;
	let disposableClient: Disposable;

	var startLanguageServer = function() {
		socketProvider.start().then(() => {
			languageClient = makeLanguageClient(socketProvider);
			solargraphDocumentProvider.setLanguageClient(languageClient);
			disposableClient = languageClient.start();
			context.subscriptions.push(disposableClient);
			if (vscode.workspace.getConfiguration('solargraph').checkGemVersion) {
				checkGemVersion();
			}
		}).catch((err) => {
			console.log('Failed to start language server: ' + JSON.stringify(err));
			if (err.toString().includes('ENOENT') || err.toString().includes('command not found')) {
				vscode.window.showErrorMessage('Solargraph gem not found. Run `gem install solargraph` or update your Gemfile.', 'Install Now').then((item) => {
					if (item == 'Install Now') {
						solargraph.installGem(solargraphConfiguration).then(() => {
							vscode.window.showInformationMessage('Successfully installed the Solargraph gem.')
							startLanguageServer();
						}).catch(() => {
							vscode.window.showErrorMessage('Failed to install the Solargraph gem.')
						});
					}
				});
			} else if (err.toString().includes('Could not find command "socket"')) {
				vscode.window.showErrorMessage('The Solargraph gem is out of date. Run `gem update solargraph` or update your Gemfile.');
			} else {
				vscode.window.showErrorMessage("Failed to start Solargraph: " + err);
			}
		});	
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
					socketProvider.restart().then(() => {
						languageClient = makeLanguageClient(socketProvider);
						solargraphDocumentProvider.setLanguageClient(languageClient);
						disposableClient = languageClient.start();
						context.subscriptions.push(disposableClient);
						resolve();
					});
				});
			} else {
				startLanguageServer();
				resolve();
			}
		});
	}

	function checkGemVersion() {
		console.log('Checking gem version');
		solargraph.verifyGemIsCurrent(solargraphConfiguration).then((result) => {
			if (result) {
				console.log('Solargraph gem version is current');
			} else {
				notifyGemUpdate();	
			}
		}).catch(() => {
			console.log('An error occurred checking the Solargraph gem version.');
		});
	}
	
	function notifyGemUpdate() {
		if (vscode.workspace.getConfiguration('solargraph').useBundler && vscode.workspace.rootPath) {
			vscode.window.showInformationMessage('A new version of the Solargraph gem is available. Update your Gemfile to install it.');
		} else {
			vscode.window.showInformationMessage('A new version of the Solargraph gem is available. Run `gem update solargraph` to install it.', 'Update Now').then((item) => {
				if (item == 'Update Now') {
					solargraph.updateGem(solargraphConfiguration).then(() => {
						restartLanguageServer().then(() => {
							vscode.window.showInformationMessage('Successfully updated the Solargraph gem.');
						});
					}).catch(() => {
						vscode.window.showErrorMessage('Failed to update the Solargraph gem.');
					});
				}
			});
		}
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
		// languageClient.sendNotification('$/solargraph/checkGemVersion', { verbose: true });
		solargraph.verifyGemIsCurrent(solargraphConfiguration).then((result) => {
			if (result) {
				vscode.window.showInformationMessage('The Solargraph gem is up to date.');
			} else {
				notifyGemUpdate();	
			}
		}).catch(() => {
			console.log('An error occurred checking the Solargraph gem version.');
		});
	});
	context.subscriptions.push(disposableSearch);
	
	// Build gem documentation command
	var disposableBuildGemDocs = vscode.commands.registerCommand('solargraph.buildGemDocs', () => {
		languageClient.sendNotification('$/solargraph/documentGems', { rebuild: false });
	});
	context.subscriptions.push(disposableBuildGemDocs);

	// Rebuild gems documentation command
	var disposableRebuildAllGemDocs = vscode.commands.registerCommand('solargraph.rebuildAllGemDocs', () => {
		languageClient.sendNotification('$/solargraph/documentGems', { rebuild: true });
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
		var child = solargraph.commands.solargraphCommand(['download-core'], solargraphConfiguration);
		child.on('exit', (code) => {
			if (code == 0) {
				vscode.window.showInformationMessage('Core documentation downloaded.');
			} else {
				vscode.window.showErrorMessage('Error downloading core documentation.');
			}
		});
		// TODO: LSP version of downloadCore
		// if (languageClient) {
		// 	languageClient.sendNotification('$/solargraph/downloadCore');
		// } else {
		// 	vscode.window.showInformationMessage('Solargraph is still starting. Please try again in a moment.');
		// }
	});
	context.subscriptions.push(disposableSolargraphDownloadCore);

	startLanguageServer();

	vscode.workspace.registerTextDocumentContentProvider('solargraph', solargraphDocumentProvider);
}

export function deactivate() {
	socketProvider.stop();
}
