import * as vscode from 'vscode';
import SolargraphServer from './SolargraphServer';
import * as request from 'request';

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
                            console.log(data);
                            var data = JSON.parse(body);
                            if (data.suggestions.length > 0) {
                                var c:string = '';
                                var lastLabel = null;
                                for (var i = 0; i < data.suggestions.length; i++) {
                                    var s = data.suggestions[i];
                                    if (s.label != lastLabel) {
                                        c = c + s.label + "\n\n";
                                    }
                                    c = c + s.documentation + "\n\n";
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
