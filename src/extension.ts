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
						var md = new MarkdownString(orig.value);
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
			viewsPath: vscode.extensions.getExtension('castwide.solargraph').extensionPath + '/views'
		}
	}

	// Create the language client and start the client.
	var languageClient = new LanguageClient('lspSample', 'Ruby Language Server', serverOptions, clientOptions);
	let disposable = languageClient.start();

	// Push the disposable to the context's subscriptions so that the
	// client can be deactivated on extension deactivation
	context.subscriptions.push(disposable);

	// Open command (used internally for browsing documentation pages)
	var disposableOpen = vscode.commands.registerCommand('solargraph._openDocument', (uriString: string) => {
		console.log('String is ' + uriString);
		var uri = vscode.Uri.parse(uriString);
		console.log('Getting ' + uri);
		var label = (uri.path == '/search' ? 'Search for ' : '') + uri.query;
		vscode.commands.executeCommand('vscode.previewHtml', uri, vscode.ViewColumn.Two, label);
	});
	context.subscriptions.push(disposableOpen);

	// Open command (used internally for browsing documentation pages)
	var disposableOpenUrl = vscode.commands.registerCommand('solargraph._openDocumentUrl', (uriString: string) => {
		console.log('String is ' + uriString);
		var uri = vscode.Uri.parse(uriString);
		console.log('Getting ' + uri);
		var label = (uri.path == '/search' ? 'Search for ' : '') + uri.query;
		console.log('Label: ' + label);
		vscode.commands.executeCommand('vscode.previewHtml', uri, vscode.ViewColumn.Two, label);
	});
	context.subscriptions.push(disposableOpenUrl);

	vscode.workspace.registerTextDocumentContentProvider('solargraph', solargraphDocumentProvider);
}
