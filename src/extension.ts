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
		config.commandPath = vscode.workspace.getConfiguration('solargraph').commandPath || 'solargraph';
		config.useBundler = vscode.workspace.getConfiguration('solargraph').useBundler || false;
		config.viewsPath = vscode.extensions.getExtension('castwide.solargraph').extensionPath + '/views';
		config.withSnippets = vscode.workspace.getConfiguration('solargraph').withSnippets || false;
		config.workspace = vscode.workspace.rootPath || null;
	}
	let configuration = new solargraph.Configuration();
	applyConfiguration(configuration);
	socketProvider = new solargraph.SocketProvider(configuration);
	
	let solargraphDocumentProvider = new SolargraphDocumentProvider();

	let languageClient: LanguageClient;
	let disposableClient: Disposable;

	socketProvider.start().then(() => {
		languageClient = makeLanguageClient(socketProvider);
		disposableClient = languageClient.start();
		context.subscriptions.push(disposableClient);
	}).catch((err) => {
		console.log('Failed to start language server: ' + err);
	});

	// https://css-tricks.com/snippets/javascript/get-url-variables/
	var getQueryVariable = function(query, variable) {
		var vars = query.split("&");
		for (var i=0;i<vars.length;i++) {
			var pair = vars[i].split("=");
			if(pair[0] == variable){return pair[1];}
		}
		return(false);
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
		languageClient.stop().then(() => {
			disposableClient.dispose();
			socketProvider.restart().then(() => {
				languageClient = makeLanguageClient(socketProvider);
				disposableClient = languageClient.start();
				context.subscriptions.push(disposableClient);
				vscode.window.showInformationMessage('Solargraph server restarted.');
			});
		});
	});
	context.subscriptions.push(disposableRestart);

	vscode.workspace.registerTextDocumentContentProvider('solargraph', solargraphDocumentProvider);
}

export function deactivate() {
	socketProvider.stop();
}