import * as vscode from 'vscode';
import SolargraphServer from './SolargraphServer';
import * as request from 'request';
import * as cmd from './commands';
const h2p = require('html2plaintext');

export default class RubyCompletionItemProvider implements vscode.CompletionItemProvider {
	private server:SolargraphServer = null;

	constructor(server:SolargraphServer) {
		this.server = server;
	}

	public provideCompletionItems(document: vscode.TextDocument, position: vscode.Position):Promise<vscode.CompletionItem[]> {
		var that = this;
		return new Promise((resolve, reject) => {
			if (this.server.isRunning()) {
				request.post({url:'http://localhost:' + this.server.getPort() + '/suggest', form: {
					text: document.getText(),
					filename: document.fileName,
					line: position.line,
					column: position.character,
					workspace: vscode.workspace.rootPath,
					with_snippets: vscode.workspace.getConfiguration('solargraph').withSnippets ? 1 : null}
				}, function(err,httpResponse,body) {
					if (err) {
						console.log(err);
					} else {
						if (httpResponse.statusCode == 200) {
							return resolve(that.getCompletionItems(JSON.parse(body), document, position));
						} else {
							// TODO: Handle error
						}
					}
				});
			} else {
				return reject();
			}
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
