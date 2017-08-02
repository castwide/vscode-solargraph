import * as vscode from 'vscode';
import * as solargraph from 'solargraph-utils';
import * as format from './format';

export default class RubyHoverProvider implements vscode.HoverProvider {
	private server:solargraph.Server;

	constructor(server:solargraph.Server) {
		this.server = server;
	}

	public provideHover(document:vscode.TextDocument, position: vscode.Position, token: vscode.CancellationToken): Promise<vscode.Hover> {
		return new Promise((resolve, reject) => {
			this.server.hover(document.getText(), position.line, position.character, document.fileName, vscode.workspace.rootPath).then(function(data) {
				if (data['suggestions'].length > 0) {
					var c:string = '';
					var lastLabel = null;
					for (var i = 0; i < data['suggestions'].length; i++) {
						var s = data['suggestions'][i];
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
							c = c + format.htmlToPlainText(doc) + "\n\n";
						}
						lastLabel = s.label;
					}
					var hover = new vscode.Hover(c);
					return resolve(hover);
				} else {
					return reject();
				}
			});
		});
	}
}
