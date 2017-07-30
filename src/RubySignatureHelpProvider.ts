import * as vscode from 'vscode';
import * as solargraph from 'solargraph-utils';
import * as request from 'request';
import * as format from './format';

export default class RubySignatureHelpProvider implements vscode.SignatureHelpProvider {
    private server:solargraph.Server;

    constructor(server:solargraph.Server) {
        this.server = server;
    }

    public provideSignatureHelp(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Promise<vscode.SignatureHelp> {
        return new Promise<vscode.SignatureHelp>((resolve, reject) => {
            this.server.signify(document.getText(), position.line, position.character, document.fileName, vscode.workspace.rootPath).then(function(data) {
                var help = new vscode.SignatureHelp();
                data['suggestions'].forEach((s) => {
                    var doc = s.documentation;
                    if (s.params && s.params.length > 0) {
                        doc += "<p>Params:<br/>";
                        for (var j = 0; j < s.params.length; j++) {
                            doc += "- " + s.params[j] + "<br/>";
                        }
                        doc += "</p>";
                    }
                    var info = new vscode.SignatureInformation(s.label + '(' + s.arguments.join(', ') + ')', format.htmlToPlainText(doc));
                    help.signatures.push(info);
                });
                if (help.signatures.length > 0) {
                    help.activeSignature = 0;
                }
                return resolve(help);
            });
        });
    }
}
