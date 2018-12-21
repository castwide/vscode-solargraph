import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient';

export default class SolargraphWebviewProvider {
	private languageClient: LanguageClient;
	private views: { [uriString: string]: vscode.WebviewPanel };

	constructor() {
		this.views = {};
	}

	private parseQuery(query: string): any {
		var result = {};
		var parts = query.split('&');
		parts.forEach((part) => {
			var frag = part.split('=');
			result[frag[0]] = frag[1];
		})
		return result;
	}

	public open(uri: vscode.Uri): void {
		var uriString = uri.toString();
		var method = '$/solargraph' + uri.path;
		var query = this.parseQuery(uri.query);
		if (!this.views[uriString]) {
			this.views[uriString] = vscode.window.createWebviewPanel('solargraph', uriString, vscode.ViewColumn.Two, {enableCommandUris: true});
			this.views[uriString].onDidDispose(() => {
				delete this.views[uriString];
			});
			this.views[uriString].webview.html = 'Loading...'
		}
		this.languageClient.sendRequest(method, query).then((result: any) => {
			if (this.views[uriString]) {
				var converted = this.convertDocumentation(result.content);
				this.views[uriString].webview.html = converted;
			}
		});
	}

	public setLanguageClient(lc: LanguageClient) {
		this.languageClient = lc;
	}

	private convertDocumentation(text: string): string {
		var regexp = /\"solargraph\:(.*?)\"/g;
		var match;
		var adjusted: string = text;
		while (match = regexp.exec(text)) {
			var commandUri = "\"command:solargraph._openDocumentUrl?" + encodeURI(JSON.stringify("solargraph:" + match[1])) + "\"";
			adjusted = adjusted.replace(match[0], commandUri);
		}
		return adjusted;
	};
}
