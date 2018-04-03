import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind, Middleware, RequestType, MessageTransports, createClientSocketTransport, Disposable, ErrorHandler } from 'vscode-languageclient';
import * as net from 'net';
import { Hover, MarkdownString } from 'vscode';
import * as solargraph from 'solargraph-utils';
import * as vscode from 'vscode';

export function makeLanguageClient(socketProvider: solargraph.SocketProvider): LanguageClient {
	let convertDocumentation = function (text: string) {
		var regexp = /\(solargraph\:(.*?)\)/g;
		var match;
		var adjusted: string = text;
		while (match = regexp.exec(text)) {
			var commandUri = "(command:solargraph._openDocumentUrl?" + encodeURI(JSON.stringify("solargraph:" + match[1])) + ")";
			adjusted = adjusted.replace(match[0], commandUri);
		}
		var md = new MarkdownString(adjusted);
		md.isTrusted = true;
		return md;
	}

	let middleware: Middleware = {
		provideHover: (document, position, token, next): Promise<Hover> => {
			return new Promise((resolve) => {
				var promise = next(document, position, token);
				// HACK: It's a promise, but TypeScript doesn't recognize it
				promise['then']((hover) => {
					var contents = [];
					hover.contents.forEach((orig) => {
						contents.push(convertDocumentation(orig.value));
					});
					resolve(new Hover(contents));
				});
			});
		},
		resolveCompletionItem: (item, token, next) => {
			return new Promise((resolve) => {
				var promise = next(item, token);
				// HACK: It's a promise, but TypeScript doesn't recognize it
				promise['then']((item) => {
					if (item.documentation) {
						item.documentation = convertDocumentation(item.documentation);
					}
					resolve(item);
				});
			});
		}
	}

	// Options to control the language client
	let clientOptions: LanguageClientOptions = {
		documentSelector: [{scheme: 'file', language: 'ruby'}],
		synchronize: {
			// Synchronize the setting section 'solargraph' to the server
			configurationSection: 'solargraph',
			// Notify the server about file changes to any file in the workspace
			fileEvents: vscode.workspace.createFileSystemWatcher('**/*')
		},
		middleware: middleware,
		initializationOptions: {
			enablePages: true,
			viewsPath: vscode.extensions.getExtension('castwide.solargraph').extensionPath + '/views'
		}
	}

	let serverOptions: ServerOptions = () => {
		return new Promise((resolve) => {
			let socket: net.Socket = net.createConnection(socketProvider.port);
			resolve({
				reader: socket,
				writer: socket
			});
		});
	};

	let client = new LanguageClient('Ruby Language Server', serverOptions, clientOptions);
	let prepareStatus = vscode.window.setStatusBarMessage('Starting the Solargraph language server...');
	client.onReady().then(() => {
		prepareStatus.dispose();
		vscode.window.setStatusBarMessage('Solargraph is ready.', 3000);
	}).catch(() => {
		prepareStatus.dispose();
		vscode.window.setStatusBarMessage('Solargraph failed to initialize.', 3000);
	});

	return client;
}
