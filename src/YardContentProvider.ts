'use strict';
import * as vscode from 'vscode';
import * as request from 'request';

export default class YardContentProvider implements vscode.TextDocumentContentProvider {
    private port: string;
    private _onDidChange: vscode.EventEmitter<vscode.Uri>;
    private docs: {[uri: string]: string};

    constructor(port:string) {
        this.port = port;
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
        request.get({url:'http://localhost:' + this.port + uri.path, form: {
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
