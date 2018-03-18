'use strict';
import * as vscode from 'vscode';
import * as request from 'request';
import { LanguageClient } from 'vscode-languageclient';

export default class SolargraphDocumentProvider implements vscode.TextDocumentContentProvider {
	private _onDidChange: vscode.EventEmitter<vscode.Uri>;
	private docs: {[uri: string]: string};
	private serverUrl: string;
	private languageClient: LanguageClient;

	constructor() {
		this._onDidChange = new vscode.EventEmitter<vscode.Uri>();
		this.docs = {};
	}

	public setLanguageClient(languageClient) {
		this.languageClient = languageClient;
	}

	public setServerUrl(url: string) {
		this.serverUrl = url;
	}

	public updateAll() {
		Object.keys(this.docs).forEach((uriString) => {
			this.update(vscode.Uri.parse(uriString));
		});
	}

	public remove(uri: vscode.Uri) {
		delete this.docs[uri.toString()];
	}

	provideTextDocumentContent(uri: vscode.Uri): string {
		console.log('I need to get the stuff for ' + uri);
		if (!this.docs[uri.toString()]) {
			this.update(uri);
		}
		return this.docs[uri.toString()] || 'Loading...';
	}

	public update(uri: vscode.Uri) {
		var that = this;
		/*var converted = uri.toString(true).replace(/^solargraph:/, this.serverUrl) + "&workspace=" + encodeURI(vscode.workspace.rootPath);
		console.log('Loading: ' + converted);
		request.get({
			url: converted
		}, function(err, httpResponse, body) {
			that.docs[uri.toString()] = body;
			that._onDidChange.fire(uri);
		});*/
		this.languageClient.sendRequest('$/solargraph/document', { query: 'String' }).then((result: any) => {
			this.docs[uri.toString()] = result.content;
			this._onDidChange.fire(uri);
		});
	}

	get onDidChange() {
		return this._onDidChange.event;
	}
}
