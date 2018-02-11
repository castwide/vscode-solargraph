'use strict';
import * as vscode from 'vscode';
import * as request from 'request';

export default class SolargraphDocumentProvider implements vscode.TextDocumentContentProvider {
	private _onDidChange: vscode.EventEmitter<vscode.Uri>;
	private docs: {[uri: string]: string};

	constructor() {
		this._onDidChange = new vscode.EventEmitter<vscode.Uri>();
		this.docs = {};
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
		if (!this.docs[uri.toString()]) {
			this.update(uri);
		}
		return this.docs[uri.toString()] || 'Loading...';
	}

	public update(uri: vscode.Uri) {
		var that = this;
		var converted = uri.toString(true).replace(/^solargraph:/, "http://localhost:");
		request.get({
			url: converted
		}, function(err, httpResponse, body) {
			that.docs[uri.toString()] = body;
			that._onDidChange.fire(uri);
		});
	}

	get onDidChange() {
		return this._onDidChange.event;
	}
}
