import { LanguageClient, LanguageClientOptions, ServerOptions, Middleware } from 'vscode-languageclient/node';
import * as net from 'net';
import { Hover, MarkdownString } from 'vscode';
import * as solargraph from 'solargraph-utils';
import * as vscode from 'vscode';

export function makeLanguageClient(configuration: solargraph.Configuration): LanguageClient {
	let convertDocumentation = function (text: string):MarkdownString {
		var regexp = /\(solargraph\:(.*?)\)/g;
		var match;
		var adjusted: string = text;
		while (match = regexp.exec(text)) {
			var commandUri = "(command:solargraph._openDocumentUrl?" + encodeURI(JSON.stringify("solargraph:" + match[1])) + ")";
			adjusted = adjusted.replace(match[0], commandUri);
		}
		adjusted = adjusted.replace('<', '&lt;');
		adjusted = adjusted.replace('>', '&gt;');
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
				promise['then']((item: vscode.CompletionItem) => {
					// HACK: Documentation can either be String or MarkupContent
					if (item.documentation) {
						if (item.documentation['value'] || item.documentation['value'] === '') {
							item.documentation = convertDocumentation(item.documentation['value']);
						} else {
							item.documentation = convertDocumentation(item.documentation.toString());
						}
					}
					resolve(item);
				});
			});
		}
	}

	// Options to control the language client
	let clientOptions: LanguageClientOptions = {
		documentSelector: [{scheme: 'file', language: 'ruby'}, {scheme: 'file', pattern: '**/Gemfile'}],
		synchronize: {
			// Synchronize the setting section 'solargraph' to the server
			configurationSection: 'solargraph',
			// Notify the server about changes to relevant files in the workspace
			fileEvents: vscode.workspace.createFileSystemWatcher('{**/*.rb,**/*.gemspec,**/Gemfile}')
		},
		middleware: middleware,
		initializationOptions: Object.assign({
			enablePages: true,
			viewsPath: vscode.extensions.getExtension('castwide.solargraph').extensionPath + '/views'
		}, vscode.workspace.getConfiguration('solargraph'))
	}

	var selectClient = function(): ServerOptions {
		var transport = vscode.workspace.getConfiguration('solargraph').transport;
		if (transport == 'stdio') {
			return () => {
				return new Promise((resolve) => {
					let child = solargraph.commands.solargraphCommand(['stdio'], configuration);
					child.stderr.on('data', (data: Buffer) => {
						console.log(data.toString());
					});
					child.on('exit', (code, signal) => {
						console.log('Solargraph exited with code', code, signal);
					});
					resolve(child);
				});
			}
		} else if (transport == 'socket') {
			return () => {
				return new Promise((resolve, reject) => {
					let socketProvider: solargraph.SocketProvider = new solargraph.SocketProvider(configuration);
					socketProvider.start().then(() => {
						let socket: net.Socket = net.createConnection(socketProvider.port);
						resolve({
							reader: socket,
							writer: socket
						});
					}).catch((err) => {
						reject(err);
					});
				});
			};
		} else {
			return () => {
				return new Promise((resolve) => {
					let socket: net.Socket = net.createConnection({ host: vscode.workspace.getConfiguration('solargraph').externalServer.host, port: vscode.workspace.getConfiguration('solargraph').externalServer.port });
					resolve({
						reader: socket,
						writer: socket
					});
				});
			}
		}
	}

	let serverOptions: ServerOptions = selectClient();

	let client = new LanguageClient('Ruby Language Server', serverOptions, clientOptions);
	client.onReady().then(() => {
		if (vscode.workspace.getConfiguration('solargraph').checkGemVersion) {
			client.sendNotification('$/solargraph/checkGemVersion', { verbose: false });
		}
	});
	return client;
}
