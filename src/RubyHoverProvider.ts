import * as vscode from 'vscode';
import SolargraphServer from './SolargraphServer';
import * as request from 'request';
const h2p = require('html2plaintext');

export default class RubyHoverProvider implements vscode.HoverProvider {
	private server: SolargraphServer;

	constructor(server: SolargraphServer) {
		this.server = server;
	}

	public provideHover(document:vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Promise<vscode.Hover> {
		return new Promise((resolve, reject) => {
			if (this.server.isRunning()) {
				request.post({url:'http://localhost:' + this.server.getPort() + '/hover', form: {
					text: document.getText(),
					filename: document.fileName,
					line: position.line,
					column: position.character,
					workspace: vscode.workspace.rootPath}
				}, function(err,httpResponse,body) {
					if (err) {
						console.log(err);
					} else {
						if (httpResponse.statusCode == 200) {
							var data = JSON.parse(body);
							if (data.suggestions.length > 0) {
								var c:string = '';
								var lastLabel = null;
								for (var i = 0; i < data.suggestions.length; i++) {
									var s = data.suggestions[i];
									c = c + s.label
									if (s.arguments.length > 0) {
										c = c + ' (' + s.arguments.join(', ') + ')';
									}
									var uri = 'solargraph:/document?' + s.path.replace('#', '%23');
									var href = encodeURI('command:solargraph._openDocument?' + JSON.stringify(uri));
									var link = "\n\n[" + s.path + '](' + href + ')';
									c = c + link;
									c = c + "\n\n";
									var doc = s.documentation;
									if (doc) {
										var pres = doc.match(/<pre>[\s\S]*?<\/pre>/gi);
										if (pres) {
											for (var j = 0; j < pres.length; j++) {
												doc = doc.replace(pres[j], pres[j].replace(/\n/g, "<br/>\n"));
											}
										}
										c = c + h2p(doc) + "\n\n";
									}
									lastLabel = s.label;
								}
								var hover = new vscode.Hover(c);
								return resolve(hover);
							} else {
								return reject();
							}
						} else {
							// TODO: Handle error
							return reject();
						}
					}
				});
			}
		});
	}
}
