import * as vscode from 'vscode';
import * as solargraph from 'solargraph-utils';
import { CancellationToken } from 'vscode';
import * as helper from './helper';

export default class RubyDefinitionProvider implements vscode.DefinitionProvider {
	private server:solargraph.Server = null;

	constructor(server:solargraph.Server) {
		this.server = server;
	}

	provideDefinition(document: vscode.TextDocument, position: vscode.Position, token: CancellationToken): Promise<vscode.Definition> {
		return new Promise((resolve, reject) => {
			var workspace = helper.getDocumentWorkspaceFolder(document);
			// TODO: define() instead of hover() (they return different stuff)
			this.server.hover(document.getText(), position.line, position.character, document.fileName, workspace).then(function(data) {
				if (data['suggestions'].length > 0) {
					var result = [];
					data['suggestions'].forEach((s) => {
						if (s['location']) {
							var match = s['location'].match(/^(.*?):([0-9]*?):([0-9]*)$/);
							var uri = vscode.Uri.file(match[1]);
							if (uri) {
								var location = new vscode.Location(uri, new vscode.Position(parseInt(match[2]), parseInt(match[3])));
								result.push(location);
							}
						}
					});
					resolve(result);
				} else {
					reject();
				}
			});
		});
	}
}
