import * as vscode from 'vscode';

export function getDocumentWorkspaceFolder(document: vscode.TextDocument): string {
	var folder = vscode.workspace.getWorkspaceFolder(document.uri);
	if (folder) {
		return folder.uri.fsPath;
	} else if (vscode.workspace.workspaceFolders.length > 0) {
		return vscode.workspace.workspaceFolders[0].uri.fsPath;
	} else {
		return null;
	}
}

export function getDocumentPageLink(path: string): string {
	var uri = 'solargraph:/document?' + path.replace('#', '%23');
	var href = encodeURI('command:solargraph._openDocument?' + JSON.stringify(uri));
	var link = "[" + path + '](' + href + ')';
	return link;
}
