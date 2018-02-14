'use strict';
import * as vscode from 'vscode';
import YardContentProvider from './YardContentProvider';
import RubyCompletionItemProvider from './RubyCompletionItemProvider';
import RubySignatureHelpProvider from './RubySignatureHelpProvider';
import RubyHoverProvider from './RubyHoverProvider';
import RubyDefinitionProvider from './RubyDefinitionProvider';
import * as solargraph from 'solargraph-utils';

const solargraphConfiguration = new solargraph.Configuration();
const solargraphServer = new solargraph.Server(solargraphConfiguration);
const solargraphContentProvider = new YardContentProvider(solargraphServer);

function prepareWorkspace() {
	if (solargraphServer.isRunning()) {
		vscode.workspace.workspaceFolders.forEach((folder: vscode.WorkspaceFolder) => {
			var prepareStatus = vscode.window.setStatusBarMessage('Analyzing Ruby code in workspace ' + folder.uri.fsPath);
			solargraphServer.prepare(folder.uri.fsPath).then(function() {
				prepareStatus.dispose();
			}).catch(function() {
				prepareStatus.dispose();
				vscode.window.setStatusBarMessage('There was an error analyzing the Ruby code in ' + folder.uri.fsPath + '.', 3000);
			});
		});
	}
}

function updateFile(saved: vscode.TextDocument) {
	solargraphServer.update(saved.fileName, vscode.workspace.getWorkspaceFolder(saved.uri).uri.fsPath).then(() => {
		solargraphContentProvider.updateAll();
	});
}

function closeDocument(closed: vscode.TextDocument) {
	if (closed.uri.scheme == 'solargraph') {
		solargraphContentProvider.remove(closed.uri);
	}
}

function updateConfiguration() {
	applyConfiguration(solargraphConfiguration);
	if (solargraphServer.isRunning()) {
		vscode.window.setStatusBarMessage('Restarting the Solargraph server', 3000);
		solargraphServer.restart();
	}
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
	vscode.window.showInformationMessage('A new version of the Solargraph gem is available. Run `gem update solargraph` or update your Gemfile to install it.', 'Update Now').then((item) => {
		if (item == 'Update Now') {
			solargraph.updateGem(solargraphConfiguration).then(() => {
				vscode.window.showInformationMessage('Successfully updated the Solargraph gem.');
				if (solargraphServer.isRunning()) {
					solargraphServer.restart();
				}
			}).catch(() => {
				vscode.window.showErrorMessage('Failed to update the Solargraph gem.');
			});
		}
	});
}

function applyConfiguration(config:solargraph.Configuration) {
	let vsconfig = vscode.workspace.getConfiguration('solargraph');
	config.commandPath = vsconfig.commandPath || 'solargraph';
	config.useBundler  = vsconfig.useBundler || false;
	config.bundlerPath = vsconfig.bundlerPath || 'bundle';
	config.viewsPath   = vscode.extensions.getExtension('castwide.solargraph').extensionPath + '/views';
	config.withSnippets = vsconfig.withSnippets || false;
	config.workspace = vscode.workspace.rootPath || null;
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
	}
	return true;
}

/**
 * If the rebornix.Ruby extension is installed, check if Solargraph is the
 * selected method for intellisense.
 */
function isIntellisenseEnabled() {
	var rubyExt = vscode.extensions.getExtension('rebornix.Ruby');
	if (rubyExt && rubyExt.isActive) {
		var intellisense = vscode.workspace.getConfiguration('ruby').get('intellisense');
		if (intellisense && intellisense != 'solargraph') {
			return false;
		}
	}
	return true;
}

function initializeAfterVerification(context: vscode.ExtensionContext) {
	solargraph.updateGemDocumentation(solargraphConfiguration);
	solargraphServer.start().then(function() {
		prepareWorkspace();
	});
	
	if (isCodeCompletionEnabled()) {
		context.subscriptions.push(vscode.languages.registerCompletionItemProvider(['ruby', 'erb'], new RubyCompletionItemProvider(solargraphServer), '.', '@', '$'));
	}
	if (isIntellisenseEnabled()) {
		context.subscriptions.push(vscode.languages.registerSignatureHelpProvider(['ruby', 'erb'], new RubySignatureHelpProvider(solargraphServer), '(', ')'));
		context.subscriptions.push(vscode.languages.registerHoverProvider(['ruby', 'erb'], new RubyHoverProvider(solargraphServer)));
		context.subscriptions.push(vscode.languages.registerDefinitionProvider(['ruby', 'erb'], new RubyDefinitionProvider(solargraphServer)));
	}
	vscode.workspace.registerTextDocumentContentProvider('solargraph', solargraphContentProvider);
	context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(updateFile));
	context.subscriptions.push(vscode.workspace.onDidCloseTextDocument(closeDocument));
	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(updateConfiguration));
}

export function activate(context: vscode.ExtensionContext) {
	applyConfiguration(solargraphConfiguration);

	// Search command
	var disposableSearch = vscode.commands.registerCommand('solargraph.search', () => {
		vscode.window.showInputBox({prompt: 'Search Ruby documentation:'}).then(val => {
			if (val) {
				var uri = 'solargraph:/search?' + encodeURIComponent(val);
				vscode.commands.executeCommand('solargraph._openDocument', uri);
			}
		});
	});
	context.subscriptions.push(disposableSearch);

	// Restart command
	var disposableRestart = vscode.commands.registerCommand('solargraph.restart', () => {
		solargraphServer.restart().then(() => {
			vscode.window.showInformationMessage('Solargraph server restarted.');
			prepareWorkspace();
		});
	});
	context.subscriptions.push(disposableRestart);

	// Config command
	var disposableConfig = vscode.commands.registerCommand('solargraph.config', () => {
		solargraph.writeConfigFile(solargraphConfiguration).then(() => {
			vscode.window.showInformationMessage('Created default .solargraph.yml file.');
		}).catch(() => {
			vscode.window.showErrorMessage('Error creating .solargraph.yml.');
		});
	});
	context.subscriptions.push(disposableRestart);

	// Open command (used internally for browsing documentation pages)
	var disposableOpen = vscode.commands.registerCommand('solargraph._openDocument', (uriString: string) => {
		console.log('String is ' + uriString);
		var uri = vscode.Uri.parse(uriString);
		console.log('Getting ' + uri);
		var label = (uri.path == '/search' ? 'Search for ' : '') + uri.query;
		vscode.commands.executeCommand('vscode.previewHtml', uri, vscode.ViewColumn.Two, label);
	});
	context.subscriptions.push(disposableOpen);

	// Check gem version command
	var disposableCheckGem = vscode.commands.registerCommand('solargraph.checkGemVersion', () => {
		var checkStatus = vscode.window.setStatusBarMessage('Checking for Solargraph gem updates');
		solargraph.verifyGemIsCurrent(solargraphConfiguration).then((result) => {
			checkStatus.dispose();
			if (result) {
				vscode.window.showInformationMessage('The Solargraph gem is up to date.');
			} else {
				notifyGemUpdate();
			}
		}).catch(() => {
			checkStatus.dispose();
			console.log('There was an error checking the Solargraph gem version.');
		});
	});

	// Download core command
	var disposableDownloadCore = vscode.commands.registerCommand('solargraph.downloadCore', () => {
		var cmd = solargraph.commands.solargraphCommand(['download-core'], solargraphConfiguration);
		cmd.on('exit', (code) => {
			if (code == 0) {
				vscode.window.showInformationMessage('Current documentation downloaded.');
				solargraphServer.restart();
			} else {
				vscode.window.showErrorMessage('An error occurred downloading current documentation.');
			}
		});
	});

	solargraph.verifyGemIsInstalled(solargraphConfiguration).then((result) => {
		if (result) {
			console.log('The Solargraph gem is installed and working.');
			if (vscode.workspace.getConfiguration('solargraph').checkGemVersion) {
				checkGemVersion();
			}
			initializeAfterVerification(context);
		} else {
			console.log('The Solargraph gem is not available.');
			vscode.window.showErrorMessage('Solargraph gem not found. Run `gem install solargraph` or update your Gemfile.', 'Install Now').then((item) => {
				if (item == 'Install Now') {
					solargraph.installGem(solargraphConfiguration).then(() => {
						vscode.window.showInformationMessage('Successfully installed the Solargraph gem.')
						initializeAfterVerification(context);					
					}).catch(() => {
						vscode.window.showErrorMessage('Failed to install the Solargraph gem.')
					});
				}
			});
		}
	});

    console.log('Solargraph extension activated.');
}

export function deactivate() {
	if (solargraphServer.isRunning()) solargraphServer.stop();
}
