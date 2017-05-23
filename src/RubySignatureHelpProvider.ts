import * as vscode from 'vscode';

export default class RubySignatureHelpProvider implements vscode.SignatureHelpProvider {
    public provideSignatureHelp(document: vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Promise<vscode.SignatureHelp> {
        return new Promise<vscode.SignatureHelp>((resolve, reject) => {
            console.log('Character is ' + document.getText().substr(document.offsetAt(position) - 1, 1));
            if (document.getText().substr(document.offsetAt(position) - 1, 1) == '(') {
                var help = new vscode.SignatureHelp();
                var info = new vscode.SignatureInformation('*args');
                help.signatures.push(info);
                help.activeSignature = 0;
                resolve(help);
            } else {
                reject();
            }
        });
    }
}
