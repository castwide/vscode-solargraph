import * as vscode from 'vscode';
import { LanguageClient } from 'vscode-languageclient';
import { timingSafeEqual } from 'crypto';

export default class SolargraphWebviewProvider implements vscode.TextDocumentContentProvider {
	private _onDidChange: vscode.EventEmitter<vscode.Uri>;
	private languageClient: LanguageClient;
	private views: { [uriString: string]: vscode.WebviewPanel };

	constructor() {
		this._onDidChange = new vscode.EventEmitter<vscode.Uri>();
		this.views = {};
	}

	public provideTextDocumentContent(uri: vscode.Uri): string {
		console.log('Trying to provide ' + uri.toString());
		return this.open(uri);
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

	private open(uri: vscode.Uri): string {
		var uriString = uri.toString();
		var method = '$/solargraph' + uri.path;
		var query = this.parseQuery(uri.query);
		if (!this.views[uriString]) {
			this.views[uriString] = vscode.window.createWebviewPanel('solargraph', uriString, vscode.ViewColumn.Two, {enableCommandUris: true});
			this.views[uriString].webview.onDidReceiveMessage(message => {
				console.log('Received ' + message);
			});
			this.views[uriString].onDidDispose(() => {
				delete this.views[uriString];
			});
			this.views[uriString].webview.html = 'Loading...'
		}
		this.languageClient.sendRequest(method, { query: query.query }).then((result: any) => {
			if (this.views[uriString]) {
				console.log(result.content);
				var converted = this.convertDocumentation(result.content);
				console.log(converted);
				this.views[uriString].webview.html = converted;
				this._onDidChange.fire(uri);
			}
		});
		return this.views[uriString].webview.html;
	}

	get onDidChange() {
		return this._onDidChange.event;
	}

	public setLanguageClient(lc: LanguageClient) {
		this.languageClient = lc;
	}
}
