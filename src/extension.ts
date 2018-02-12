/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import * as path from 'path';

import { workspace, ExtensionContext, Hover, MarkdownString, ProviderResult } from 'vscode';
import * as vscode from 'vscode';
import * as solargraph from 'solargraph-utils';
import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind, Middleware, RequestType } from 'vscode-languageclient';
import * as format from './format';
import { HoverRequest } from 'vscode-languageserver/lib/main';
import SolargraphDocumentProvider from './SolargraphDocumentProvider';

export function activate(context: ExtensionContext) {

	// The server is implemented in node
	let serverModule = context.asAbsolutePath(path.join('node_modules', 'solargraph-utils', 'out', 'LanguageServer.js'));
	// The debug options for the server
	let debugOptions = { execArgv: ["--nolazy", "--debug=6009"] };

	let solargraphDocumentProvider = new SolargraphDocumentProvider();

	// If the extension is launched in debug mode then the debug server options are used
	// Otherwise the run options are used
	let serverOptions: ServerOptions = {
		run : { module: serverModule, transport: TransportKind.ipc },
		debug: { module: serverModule, transport: TransportKind.ipc, options: debugOptions }
	}

	var getDocumentPageLink = function(path: string): string {
		var uri = 'solargraph:/document?' + path.replace('#', '%23');
		var href = encodeURI('command:solargraph._openDocument?' + JSON.stringify(uri));
		var link = "[" + path + '](' + href + ')';
		return link;
	}
	
	var middleware: Middleware = {
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

	// Options to control the language client
	let clientOptions: LanguageClientOptions = {
		// Register the server for plain text documents
		documentSelector: [{scheme: 'file', language: 'ruby'}],
		synchronize: {
			// Synchronize the setting section 'lspSample' to the server
			//configurationSection: 'lspSample',
			// Notify the server about file changes to '.clientrc files contain in the workspace
			//fileEvents: workspace.createFileSystemWatcher('**/.clientrc')
		},
		middleware: middleware,
		initializationOptions: {
			viewsPath: vscode.extensions.getExtension('castwide.solargraph').extensionPath + '/views',
			useBundler: vscode.workspace.getConfiguration('solargraph').useBundler || false
		}
	}

	// Create the language client and start the client.
	var languageClient = new LanguageClient('lspSample', 'Ruby Language Server', serverOptions, clientOptions);
	languageClient.onReady().then(() => {
		languageClient.onNotification("$/solargraphInfo", (server) => {
			// Set the server URL in the document provider so links work
			solargraphDocumentProvider.setServerUrl(server.url);
		});
	});
	let disposable = languageClient.start();
	// Push the disposable to the context's subscriptions so that the
	// client can be deactivated on extension deactivation
	context.subscriptions.push(disposable);

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
