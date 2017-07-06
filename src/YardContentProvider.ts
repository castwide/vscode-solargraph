'use strict';
import * as vscode from 'vscode';
import * as request from 'request';
import * as solargraph from 'solargraph-utils';

export default class YardContentProvider implements vscode.TextDocumentContentProvider {
	private server:solargraph.Server;
	private _onDidChange: vscode.EventEmitter<vscode.Uri>;
	private docs: {[uri: string]: string};

	constructor(server:solargraph.Server) {
		this.server = server;
		this._onDidChange = new vscode.EventEmitter<vscode.Uri>();
		this.docs = {};
	}

	provideTextDocumentContent(uri: vscode.Uri): string {
		if (!this.docs[uri.toString()]) {
			this.update(uri);
		}
		return this.docs[uri.toString()] || 'Loading...';
	}

	public update(uri: vscode.Uri) {
		var that = this;
		request.get({url: this.server.url + uri.path, form: {
			query: uri.query,
			workspace: vscode.workspace.rootPath
		}}, function(err, httpResponse, body) {
			that.docs[uri.toString()] = body;
			that._onDidChange.fire(uri);
		});
	}

	get onDidChange() {
		return this._onDidChange.event;
	}
}
