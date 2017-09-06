'use strict';
import * as vscode from 'vscode';
import YardContentProvider from './YardContentProvider';
import RubyCompletionItemProvider from './RubyCompletionItemProvider';
import RubySignatureHelpProvider from './RubySignatureHelpProvider';
import RubyHoverProvider from './RubyHoverProvider';
import * as solargraph from 'solargraph-utils';

const solargraphConfiguration = new solargraph.Configuration();
const solargraphServer = new solargraph.Server(solargraphConfiguration);

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

function updateConfiguration() {
	applyConfiguration(solargraphConfiguration);
	if (solargraphServer.isRunning()) {
		vscode.window.setStatusBarMessage('Restarting the Solargraph server', 3000);
		solargraphServer.restart();
	}
}

function checkGemVersion() {
	console.log('Checking gem version');
	solargraph.verifyGemIsCurrent(solargraphConfiguration).then(() => {
		console.log('Solargraph gem version is current');
	}).catch(() => {
		notifyGemUpdate();
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
	config.commandPath = vscode.workspace.getConfiguration('solargraph').commandPath || 'solargraph';
	config.useBundler = vscode.workspace.getConfiguration('solargraph').useBundler || false;
	config.viewsPath = vscode.extensions.getExtension('castwide.solargraph').extensionPath + '/views';
	config.withSnippets = vscode.workspace.getConfiguration('solargraph').withSnippets || false;
	config.workspace = vscode.workspace.rootPath || null;
}

function initializeAfterVerification(context: vscode.ExtensionContext) {
	solargraph.updateGemDocumentation(solargraphConfiguration);
	solargraphServer.start().then(function() {
		prepareWorkspace();
	});
	context.subscriptions.push(vscode.languages.registerCompletionItemProvider('ruby', new RubyCompletionItemProvider(solargraphServer), '.', '@'));
	context.subscriptions.push(vscode.languages.registerSignatureHelpProvider('ruby', new RubySignatureHelpProvider(solargraphServer), '(', ')'));
	context.subscriptions.push(vscode.languages.registerHoverProvider('ruby', new RubyHoverProvider(solargraphServer)));
	vscode.workspace.registerTextDocumentContentProvider('solargraph', new YardContentProvider(solargraphServer));
	context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(updateYard));
	context.subscriptions.push(vscode.workspace.onDidChangeConfiguration(updateConfiguration));
}

export function activate(context: vscode.ExtensionContext) {
	applyConfiguration(solargraphConfiguration);

	// Search command
	var disposableSearch = vscode.commands.registerCommand('solargraph.search', () => {
		vscode.window.showInputBox({prompt: 'Search Ruby documentation:'}).then(val => {
			if (val) {
				let uri = new vscode.Uri().with({scheme: 'solargraph', path: '/search', query: val});
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
		solargraph.verifyGemIsCurrent(solargraphConfiguration).then(() => {
			checkStatus.dispose();
			vscode.window.showInformationMessage('The Solargraph gem is up to date.');
		}).catch(() => {
			checkStatus.dispose();
			notifyGemUpdate();
		});
	});

	solargraph.verifyGemIsInstalled(solargraphConfiguration).then(() => {
		console.log('The Solargraph gem is installed and working.');
		if (vscode.workspace.getConfiguration('solargraph').checkGemVersion) {
			checkGemVersion();
		}
		initializeAfterVerification(context);
	}).catch(() => {
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
	});

    console.log('Solargraph extension activated.');
}

export function deactivate() {
	if (solargraphServer.isRunning()) solargraphServer.stop();
}
