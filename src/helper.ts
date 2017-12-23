import * as vscode from 'vscode';

export function getDocumentWorkspaceFolder(document: vscode.TextDocument): string {
	var folder = vscode.workspace.getWorkspaceFolder(document.uri);
	if (folder) {
		return folder.uri.fsPath;
	} else {
		return vscode.workspace.rootPath;
	}
}

export function getDocumentPageLink(path: string): string {
	var uri = 'solargraph:/document?' + path.replace('#', '%23');
	var href = encodeURI('command:solargraph._openDocument?' + JSON.stringify(uri));
	var link = "[" + path + '](' + href + ')';
	return link;
}
