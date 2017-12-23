import * as vscode from 'vscode';
import * as solargraph from 'solargraph-utils';
import * as format from './format';
import * as helper from './helper';

export default class RubyHoverProvider implements vscode.HoverProvider {
	private server:solargraph.Server;

	constructor(server:solargraph.Server) {
		this.server = server;
	}

	public provideHover(document:vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Promise<vscode.Hover> {
		return new Promise((resolve, reject) => {
			var workspace = helper.getDocumentWorkspaceFolder(document);
			this.server.hover(document.getText(), position.line, position.character, document.fileName, workspace).then(function(data) {
				if (data['suggestions'].length > 0) {
					var c:string = '';
					var usedPaths: string[] = []
					for (var i = 0; i < data['suggestions'].length; i++) {
						var s = data['suggestions'][i];
						if (usedPaths.indexOf(s.path) == -1) {
							usedPaths.push(s.path);
							c = c + "\n\n" + helper.getDocumentPageLink(s.path);
						}
						c = c + "\n\n";
						var doc = s.documentation;
						if (doc) {
							c = c + format.htmlToPlainText(doc) + "\n\n";
						}
					}
					var md = new vscode.MarkdownString(c);
					md.isTrusted = true;
					var hover = new vscode.Hover(md);
					resolve(hover);
				} else {
					reject();
				}
			});
		});
	}
}
