'use strict';
import * as vscode from 'vscode';
import * as path from 'path';
import * as child_process from 'child_process';
import * as request from 'request';
import * as fs from 'fs';

function solargraphCommand(args) {
	let cmd = [];
	if (process.platform === 'win32') cmd.push('cmd', '/c');
	if (vscode.workspace.getConfiguration('ruby').solargraph.useBundler) {
		// TODO: pathToBundler configuration
		cmd.push('bundle', 'exec');
	}
	cmd.push(vscode.workspace.getConfiguration('ruby').solargraph.commandPath);
	return child_process.spawn(cmd.shift(), cmd.concat(args));
}

function yardCommand(args) {
	let cmd = [];
	if (process.platform === 'win32') cmd.push('cmd', '/c');
	if (vscode.workspace.getConfiguration('ruby').solargraph.useBundler) {
		// TODO: pathToBundler configuration
		cmd.push('bundle', 'exec');
	}
	cmd.push('yard');
	return child_process.spawn(cmd.shift(), cmd.concat(args));
}

const completionProvider = {
    provideCompletionItems: function completionProvider(document, position) {
        return new Promise((resolve, reject) => {
            const kinds = {
                "Class": vscode.CompletionItemKind.Class,
                "Keyword": vscode.CompletionItemKind.Keyword,
                "Module": vscode.CompletionItemKind.Module,
                "Method": vscode.CompletionItemKind.Method,
                "Variable": vscode.CompletionItemKind.Variable,
                "Snippet": vscode.CompletionItemKind.Snippet
            }
			// HACK: Tricking the type system to avoid an invalid error
			let SnippetString = vscode['SnippetString'];
			let child = solargraphCommand([
				'suggest',
				'--line=' + position.line,
				'--column=' + position.character,
				'--filename=' + document.fileName
			]);
			let errbuf = [], outbuf = [];
			child.stderr.on('data', (data) => errbuf.push(data));
			child.stdout.on('data', (data) => outbuf.push(data));
			child.on('exit', () => {
				var data = outbuf.join('');
				if (data == "") {
					return resolve([]);
				} else {
					let result = JSON.parse(data);
					let items = [];
					if (result.status == "ok") {
						var range = document.getWordRangeAtPosition(position);
						if (range) {
							var repl = document.getText(range);
							if (range.start.character > 0) {
								if (repl.substr(0, 1) == ':') {
									var prevChar = document.getText(new vscode.Range(range.start.line, range.start.character - 1, range.start.line, range.start.character));
									if (prevChar == ':') {
										// Replacement range starts with a colon, but there's
										// a previous colon. That means we're in a namespace,
										// not a symbol. Get rid of the colon in the namespace
										// range.
										range = new vscode.Range(range.start.line, range.start.character + 1, range.end.line, range.end.character);
									}
								}
							}
						}
						result.suggestions.forEach((cd) => {
							var item = new vscode.CompletionItem(cd['label'], kinds[cd['kind']]);
							// Treat instance variables slightly differently
							if (cd['insert'].substring(0, 1) == '@') {
								item.insertText = cd['insert'].substring(1);
							} else {
								item.insertText = new SnippetString(cd['insert']);
							}
							if (range) {
								// HACK: Unrecognized property
								item['range'] = range;
							}
							item.detail = cd['kind'];
							item.documentation = cd['documentation'];
							items.push(item);
						});
						return resolve(items);
					} else {
						return resolve([]);
					}
				}
			});
			child.on('error', () => {
				if (errbuf.length) {
					console.log(errbuf.join("\n"));
				}
			});
			child.stdin.end(document.getText());
        });
    }
}

export function activate(context: vscode.ExtensionContext) {
	const solargraphTest = solargraphCommand(['prepare']);
	solargraphTest.on('exit', () => {
		context.subscriptions.push(vscode.languages.registerCompletionItemProvider('ruby', completionProvider, '.'));
		yardCommand(['gems']);
	});
	solargraphTest.on('error', () => 0);

    console.log('Solargraph extension activated.');
}

export function deactivate() {
    console.log('Deactivating extension');
}
