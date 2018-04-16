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
		}).catch((err) => {
			console.log('Failed to start language server: ' + err);
		});	
	}

	var checkGemVersion = function() {
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
		solargraph.verifyGemIsCurrent(solargraphConfiguration).then((result) => {
			if (result) {
				vscode.window.showInformationMessage('Solargraph gem is up to date.');
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
		var disposableStatus = vscode.window.setStatusBarMessage('Building new YARD documentation...')
		var cmd = solargraph.commands.yardCommand(['gems'], solargraphConfiguration);
		cmd.on('exit', (code) => {
			disposableStatus.dispose();
			if (code == 0) {
				vscode.window.setStatusBarMessage('YARD documentation complete.', 3000);
			} else {
				vscode.window.setStatusBarMessage('An error occurred during build.', 3000);
			}
		});
		cmd.on('error', (err) => {
			disposableStatus.dispose();
			vscode.window.setStatusBarMessage('Unable to build documentation.', 3000);
		});
	});
	context.subscriptions.push(disposableBuildGemDocs);

	// Rebuild gems documentation command
	var disposableRebuildAllGemDocs = vscode.commands.registerCommand('solargraph.rebuildAllGemDocs', () => {
		var disposableStatus = vscode.window.setStatusBarMessage('Rebuilding all YARD documentation...')
		var cmd = solargraph.commands.yardCommand(['gems', '--rebuild'], solargraphConfiguration);
		cmd.on('exit', (code) => {
			disposableStatus.dispose();
			if (code == 0) {
				vscode.window.setStatusBarMessage('YARD documentation rebuild complete.', 3000);
			} else {
				vscode.window.setStatusBarMessage('An error occurred during rebuild.', 3000);
			}
		});
		cmd.on('error', (err) => {
			disposableStatus.dispose();
			vscode.window.setStatusBarMessage('Unable to rebuild documentation.', 3000);
		});
	});
	context.subscriptions.push(disposableRebuildAllGemDocs);

	solargraph.verifyGemIsInstalled(solargraphConfiguration).then((result) => {
		if (result) {
			console.log('The Solargraph gem is installed and working.');
			if (vscode.workspace.getConfiguration('solargraph').checkGemVersion) {
				checkGemVersion();
			}
			startLanguageServer();
		} else {
			console.log('The Solargraph gem is not available.');
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
		}
	});

	vscode.workspace.registerTextDocumentContentProvider('solargraph', solargraphDocumentProvider);
}

export function deactivate() {
	socketProvider.stop();
}
