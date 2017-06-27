import * as vscode from 'vscode';
import * as solargraph from 'solargraph-utils';
import * as request from 'request';
import * as cmd from './commands';
const h2p = require('html2plaintext');

export default class RubyCompletionItemProvider implements vscode.CompletionItemProvider {
	private server:solargraph.Server = null;

	constructor(server:solargraph.Server) {
		this.server = server;
	}

	public provideCompletionItems(document: vscode.TextDocument, position: vscode.Position):Promise<vscode.CompletionItem[]> {
		var that = this;
		return new Promise((resolve, reject) => {
			// TODO: In a future version, it might be possible to use separate
			// workspace configurations in subdirectories. For now, we always
			// use the workspace root.
			//var workspace = solargraph.nearestWorkspace(document.fileName, vscode.workspace.rootPath);
			var workspace = vscode.workspace.rootPath;
			console.log('Getting completion items using workspace ' + workspace);
			this.server.suggest(document.getText(), position.line, position.character, document.fileName, workspace, vscode.workspace.getConfiguration('solargraph').withSnippets).then(function(response) {
				if (response['status'] == 'ok') {
					return resolve(that.getCompletionItems(response, document, position));
				} else {
					console.warn('Solargraph server returned an error: ' + response['message']);
					return reject([]);
				}
			});
		});
	}

	private getCompletionItems(data, document:vscode.TextDocument, position: vscode.Position):Array<vscode.CompletionItem> {
		const kinds = {
			"Class": vscode.CompletionItemKind.Class,
			"Keyword": vscode.CompletionItemKind.Keyword,
			"Module": vscode.CompletionItemKind.Module,
			"Method": vscode.CompletionItemKind.Method,
			"Variable": vscode.CompletionItemKind.Variable,
			"Snippet": vscode.CompletionItemKind.Snippet,
			"Field": vscode.CompletionItemKind.Field,
			"Property": vscode.CompletionItemKind.Property
		}
		// HACK: Tricking the type system to avoid an invalid error
		let SnippetString = vscode['SnippetString'];
		let items:Array<vscode.CompletionItem> = [];
		if (data.status == "ok") {
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
			data.suggestions.forEach((cd) => {
				var item = new vscode.CompletionItem(cd['label'], kinds[cd['kind']]);
				// Treat instance variables slightly differently
				if (cd['insert'].substring(0, 1) == '@') {
					item.insertText = cd['insert'].substring(1);
					item.filterText = cd['insert'].substring(1);
					item.sortText = cd['insert'].substring(1);
					item.label = cd['insert'].substring(1);
				} else {
					if (cd['kind'] == 'Snippet') {
						item.insertText = new SnippetString(cd['insert']);
					} else {
						item.insertText = cd['insert'];
					}
				}
				if (range) {
					// HACK: Unrecognized property
					item['range'] = range;
				}
				if (cd['kind'] == 'Method' && cd['arguments'].length > 0) {
					item.detail = '(' + cd['arguments'].join(', ') + ') ' + (cd['return_type'] ? '=> ' + cd['return_type'] : '');
				} else {
					item.detail = (cd['return_type'] ? '=> ' + cd['return_type'] : '');
				}
				var documentation = '';
				if (cd['path']) {
					documentation += cd['path'] + "\n\n";
				}
				var doc = cd['documentation'];
				if (doc) {
					var pres = doc.match(/<pre>[\s\S]*?<\/pre>/gi);
					if (pres) {
						for (var j = 0; j < pres.length; j++) {
							doc = doc.replace(pres[j], pres[j].replace(/\n/g, "<br/>\n"));
						}
					}
					//c = c + htmlToText.fromString(doc) + "\n\n";
					documentation += h2p(doc);
					//documentation += doc;
				}
				item.documentation = documentation;
				items.push(item);
			});
		}
		return items;
	}
}
