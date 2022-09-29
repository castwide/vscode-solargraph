import { LanguageClient, LanguageClientOptions, ServerOptions, Middleware } from 'vscode-languageclient/node';
import * as net from 'net';
import { Hover, MarkdownString } from 'vscode';
import * as solargraph from 'solargraph-utils';
import * as vscode from 'vscode';

export function makeLanguageClient(configuration: solargraph.Configuration): LanguageClient {
    let convertDocumentation = function (text: string): MarkdownString {
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
    };

    let middleware: Middleware = {
        provideHover: (document, position, token, next): Promise<Hover> => {
            return new Promise((resolve) => {
                let promise = next(document, position, token);
                // @ts-ignore HACK: It's a promise, but TypeScript doesn't recognize it
                promise['then']((hover: Hover) => {
                    let contents: MarkdownString[] = [];
                    if (hover) {
                        hover.contents.forEach((orig) => {
                            // @ts-ignore for some reason I can't determine
                            contents.push(convertDocumentation(orig.value));
                        });
                    }
                    resolve(new Hover(contents));
                });
            });
        },

        resolveCompletionItem: (item, token, next) => {
            return new Promise((resolve) => {
                let promise = next(item, token);
                // @ts-ignore HACK: It's a promise, but TypeScript doesn't recognize it
                promise['then']((item: any) => {
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
    };

	// Options to control the language client
    let clientOptions: LanguageClientOptions = {
        documentSelector: [{ scheme: 'file', language: 'ruby' }, { scheme: 'file', pattern: '**/Gemfile' }],
        synchronize: {
            // Synchronize the setting section 'solargraph' to the server
            configurationSection: 'solargraph',
            // Notify the server about changes to relevant files in the workspace
            fileEvents: vscode.workspace.createFileSystemWatcher('{**/*.rb,**/*.gemspec,**/Gemfile}')
        },
        middleware: middleware,
        initializationOptions: Object.assign({
            enablePages: true,
            viewsPath: vscode.extensions.getExtension('castwide.solargraph')!.extensionPath + '/views'
        }, vscode.workspace.getConfiguration('solargraph'))
    };

	var selectClient = function(): ServerOptions {
		var transport = vscode.workspace.getConfiguration('solargraph').transport;
		if (transport == 'stdio') {
			return () => {
				return new Promise((resolve) => {
                    let child = solargraph.commands.solargraphCommand(['stdio'], configuration);
					child.stderr!.on('data', (data: Buffer) => {
						console.log(data.toString());
					});
					child.on('exit', (code, signal) => {
						console.log('Solargraph exited with code', code, signal);
					});
					resolve(child);
				});
			};
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
			var getSocket = function(): Promise<net.Socket> {
				return new Promise((resolve, reject) => {
					let socket: net.Socket = net.createConnection({ host: vscode.workspace.getConfiguration('solargraph').externalServer.host, port: parseInt(vscode.workspace.getConfiguration('solargraph').externalServer.port) });
					let errorHandler = function(err: Error) {
						reject(err);
					};
					socket.addListener('connect', () => {
						socket.removeListener('error', errorHandler);
						resolve(socket);
					});
					socket.addListener('error', errorHandler);
				});
			};
			var getSocketOrNotifyUser = function(): Promise<net.Socket> {
				return new Promise((resolve, reject) => {
					getSocket().then((socket) => {
						resolve(socket);
					}).catch((err) => {
						vscode.window.showWarningMessage('Failed to connect to the external language client: ' + err.message, 'Try again').then((item) => {
							if(item === 'Try again') {
								resolve(getSocketOrNotifyUser());
							} else {
								reject(err);
							}
						});
					});
				});
			};
			return () => {
				return new Promise((resolve, reject) => {
					getSocketOrNotifyUser().then((socket) => {
						resolve({
							reader: socket,
							writer: socket
						});
					}).catch((err) => {
						reject(err);
					});
				});
			};
		}
	};

	let serverOptions: ServerOptions = selectClient();

	let client = new LanguageClient('Ruby Language Server', serverOptions, clientOptions);
	client.onReady().then(() => {
		if (vscode.workspace.getConfiguration('solargraph').checkGemVersion) {
			client.sendNotification('$/solargraph/checkGemVersion', { verbose: false });
		}
	});
	return client;
}
