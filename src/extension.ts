'use strict';

import * as vscode from 'vscode';
import * as solargraph from 'solargraph-utils';
import { LanguageClient, Disposable } from 'vscode-languageclient';
import { makeLanguageClient } from './language-client';
import SolargraphWebviewProvider from './SolargraphWebviewProvider';
import * as isRelative from 'is-relative';

let languageClient: LanguageClient;

export function activate(context: vscode.ExtensionContext) {
	let haveWorkspace = function () {
		return (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0])
	}
	let firstWorkspace = function () {
		return haveWorkspace() ? vscode.workspace.workspaceFolders[0].uri.fsPath : null;
	}

	let applyConfiguration = function (config: solargraph.Configuration) {
		let vsconfig = vscode.workspace.getConfiguration('solargraph');
		if (!vsconfig.commandPath) {
			// Default -- will be searched for in the shell environment since it is a relative path
			config.commandPath = 'solargraph';
		} else if (isRelative(vsconfig.commandPath) && haveWorkspace()) {
			// For portability, try to make any other relative path absolute with respect to the
			// root of the vscode project, rather than letting solargraph-utils try to resolve it
			// from whatever random directory VS Code chooses as its current working directory
			// (often not even inside the project).  This makes it so that you can specify, 
			// e.g. "bin/solargraph" to use a version of solargraph shipped within the project.
			config.commandPath = vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, vsconfig.commandPath).fsPath;
		} else {
			// Either already an absolute path, or it is a relative path but we don't have a
			// workspace to join it with to make it absolute.
			config.commandPath = vsconfig.commandPath;
		}

		config.useBundler = vsconfig.useBundler || false;
		config.bundlerPath = vsconfig.bundlerPath || 'bundle';
		config.viewsPath = vscode.extensions.getExtension('castwide.solargraph').extensionPath + '/views';
		config.withSnippets = vsconfig.withSnippets || false;
		config.workspace = firstWorkspace();
	}
	let solargraphConfiguration = new solargraph.Configuration();
	applyConfiguration(solargraphConfiguration);

	let disposableClient: Disposable;
	let webViewProvider: SolargraphWebviewProvider = new SolargraphWebviewProvider();

	var startLanguageServer = function () {
		languageClient = makeLanguageClient(solargraphConfiguration);
		languageClient.onReady().then(() => {
			languageClient.onNotification('$/solargraph/restart', (params) => {
				restartLanguageServer();
			});
		}).catch((err) => {
			console.log('Error starting Solargraph socket provider', err);
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
			} else {
				vscode.window.showErrorMessage("Failed to start Solargraph: " + err);
			}
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
		var hashed = uriString.replace('#', '%23');
		var uri = vscode.Uri.parse(hashed);
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
		vscode.window.showInputBox({ prompt: 'Search Ruby documentation:' }).then(val => {
			if (val) {
				var uri = 'solargraph:/search?query=' + encodeURIComponent(val);
				webViewProvider.open(vscode.Uri.parse(uri));
			}
		});
	});
	context.subscriptions.push(disposableSearch);

	// Environment command
	var disposableEnv = vscode.commands.registerCommand('solargraph.environment', () => {
		var uri = vscode.Uri.parse('solargraph:/environment');
		webViewProvider.open(uri);
	});
	context.subscriptions.push(disposableEnv);

	// Check gem version command
	var disposableCheckGemVersion = vscode.commands.registerCommand('solargraph.checkGemVersion', () => {
		languageClient.sendNotification('$/solargraph/checkGemVersion', { verbose: true });
	});
	context.subscriptions.push(disposableCheckGemVersion);

	var doBuildGemDocs = function (rebuild: Boolean) {
		let message = (rebuild ? 'Rebuilding all gem documentation...' : 'Building new gem documentation');
		let prepareStatus = vscode.window.setStatusBarMessage(message);
		try {
			languageClient.sendRequest('$/solargraph/documentGems', { rebuild: rebuild }).then((response) => {
				prepareStatus.dispose();
				if (response['status'] == 'ok') {
					vscode.window.setStatusBarMessage('Gem documentation complete.', 3000);
				} else {
					vscode.window.setStatusBarMessage('An error occurred building gem documentation.', 3000);
				}
			});
		} catch (err) {
			prepareStatus.dispose();
			vscode.window.showErrorMessage('The language server is still initializing. Please try again shortly. (Error: ' + err.message + ')')
		}
	};

	// Build gem documentation command
	var disposableBuildGemDocs = vscode.commands.registerCommand('solargraph.buildGemDocs', () => {
		doBuildGemDocs(false);
	});
	context.subscriptions.push(disposableBuildGemDocs);

	// Rebuild gems documentation command
	var disposableRebuildAllGemDocs = vscode.commands.registerCommand('solargraph.rebuildAllGemDocs', () => {
		doBuildGemDocs(true);
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
	if (languageClient) {
		languageClient.stop();
	}
}
