import { LanguageClient, LanguageClientOptions, ServerOptions, TransportKind, Middleware, RequestType, MessageTransports, createClientSocketTransport, Disposable } from 'vscode-languageclient';
import * as net from 'net';
import { Hover, MarkdownString } from 'vscode';
import * as solargraph from 'solargraph-utils';

export function makeLanguageClient(socketProvider: solargraph.SocketProvider): LanguageClient {
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
					resolve(new Hover(contents));
				});
			});
		}
	}

	// Options to control the language client
	let clientOptions: LanguageClientOptions = {
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

	let serverOptions: ServerOptions = () => {
		return new Promise((resolve) => {
			let socket: net.Socket = net.createConnection(socketProvider.port);
			resolve({
				reader: socket,
				writer: socket
			});
		});
	};

	return new LanguageClient('Ruby Language Server', serverOptions, clientOptions);
}
