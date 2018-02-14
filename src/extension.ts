'use strict';

import * as path from 'path';

import { workspace, ExtensionContext, Hover, MarkdownString, ProviderResult } from 'vscode';
import * as vscode from 'vscode';
import * as solargraph from 'solargraph-utils';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind, Middleware, RequestType, MessageTransports, StreamMessageReader, IPCMessageReader, createClientSocketTransport } from 'vscode-languageclient';
import * as format from './format';
import SolargraphDocumentProvider from './SolargraphDocumentProvider';
import * as child_process from 'child_process';
import * as net from 'net';

export function activate(context: ExtensionContext) {

	console.log('Activating Solargraph');

	let solargraphDocumentProvider = new SolargraphDocumentProvider();

	let middleware: Middleware = {
		provideHover: (document, position, token, next): Promise<Hover> => {
			return new Promise((resolve) => {
				var promise = next(document, position, token);
				// HACK: It's a promise, but TypeScript doesn't recognize it
				promise['then']((hover) => {
					var contents = [];
					hover.contents.forEach((orig) => {
						var str = '';
						var regexp = /\(solargraph\:(.*?)\)/g;
						var match;
						var adjusted: string = orig.value;
						while (match = regexp.exec(orig.value)) {
							var commandUri = "(command:solargraph._openDocumentUrl?" + encodeURI(JSON.stringify("solargraph:" + match[1])) + ")";
							adjusted = adjusted.replace(match[0], commandUri);
						}
						var md = new MarkdownString(adjusted);
						md.isTrusted = true;
						contents.push(md);
					});
					resolve(new vscode.Hover(contents));
				});
			});
		}
	}

	function applyConfiguration(config:solargraph.Configuration) {
		config.commandPath = vscode.workspace.getConfiguration('solargraph').commandPath || 'solargraph';
		config.useBundler = vscode.workspace.getConfiguration('solargraph').useBundler || false;
		config.viewsPath = vscode.extensions.getExtension('castwide.solargraph').extensionPath + '/views';
		config.withSnippets = vscode.workspace.getConfiguration('solargraph').withSnippets || false;
		config.workspace = vscode.workspace.rootPath || null;
	}
	
	// Options to control the language client
	let clientOptions: LanguageClientOptions = {
		// Register the server for plain text documents
		documentSelector: [{scheme: 'file', language: 'ruby'}]/*,
		synchronize: {
			// Synchronize the setting section 'lspSample' to the server
			//configurationSection: 'lspSample',
			// Notify the server about file changes to '.clientrc files contain in the workspace
			//fileEvents: workspace.createFileSystemWatcher('** /.clientrc')
		},
		middleware: middleware,
		initializationOptions: {
			viewsPath: vscode.extensions.getExtension('castwide.solargraph').extensionPath + '/views',
			useBundler: vscode.workspace.getConfiguration('solargraph').useBundler || false
		}*/
	}

	let configuration = new solargraph.Configuration();
	applyConfiguration(configuration);
	configuration.workspace = vscode.workspace.rootPath;
	let socketServer = new solargraph.LanguageServer(configuration);
	socketServer.start().then(() => {
		let serverOptions: ServerOptions = () => {
			return new Promise((resolve) => {
				let socket: net.Socket = net.createConnection(socketServer.port);
				resolve({
					reader: socket,
					writer: socket
				});
			});
		};
		// Create the language client and start the client.
		var languageClient = new LanguageClient('Ruby Language Server', serverOptions, clientOptions);
		languageClient.onReady().then(() => {
			console.log('Solargraph server is running on port ' + socketServer.port);
		});
		let disposable = languageClient.start();
		// Push the disposable to the context's subscriptions so that the
		// client can be deactivated on extension deactivation
		context.subscriptions.push(disposable);
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

	vscode.workspace.registerTextDocumentContentProvider('solargraph', solargraphDocumentProvider);
}
