import * as vscode from 'vscode';
import SolargraphServer from 'solargraph-utils';
import * as request from 'request';

export default class RubySignatureHelpProvider implements vscode.SignatureHelpProvider {
    private server: SolargraphServer;

    constructor(server: SolargraphServer) {
        this.server = server;
    }

    public provideSignatureHelp(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Promise<vscode.SignatureHelp> {
        return new Promise<vscode.SignatureHelp>((resolve, reject) => {
            if (this.server.isRunning()) {
				request.post({url:'http://localhost:' + this.server.getPort() + '/signify', form: {
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
                            var help = new vscode.SignatureHelp();
                            data.suggestions.forEach((s) => {
                                var info = new vscode.SignatureInformation(s.label + '(' + s.arguments.join(', ') + ')', s.documentation);
                                help.signatures.push(info);
                            });
                            if (help.signatures.length > 0) {
                                help.activeSignature = 0;
                            }
                            return resolve(help);
						} else {
							// TODO: Handle error
						}
					}
				});
            }
        });
    }
}
