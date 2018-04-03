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

	/**
	 * If the rebornix.Ruby extension is installed, check if Solargraph is the
	 * selected method for code completion.
	 */
	function isCodeCompletionEnabled() {
		var rubyExt = vscode.extensions.getExtension('rebornix.Ruby');
		if (rubyExt && rubyExt.isActive) {
			var codeCompletion = vscode.workspace.getConfiguration('ruby').get('codeCompletion');
			if (codeCompletion && codeCompletion != 'solargraph') {
				return false;
			}
			return (false);
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
	context.subscriptions.push(disposableRestart);

	vscode.workspace.registerTextDocumentContentProvider('solargraph', solargraphDocumentProvider);
}

export function deactivate() {
	socketProvider.stop();
}
