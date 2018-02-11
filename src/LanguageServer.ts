'use strict';

import { IConnection, createConnection, IPCMessageReader, IPCMessageWriter, TextDocuments, InitializeResult, TextDocumentPositionParams, CompletionItem, CompletionItemKind, MarkedString } from 'vscode-languageserver';
import * as solargraph from 'solargraph-utils';
import { uriToFilePath } from 'vscode-languageserver/lib/files';
import * as format from './format';
//import * as helper from './helper';

let solargraphServer = new solargraph.Server(new solargraph.Configuration());

let connection: IConnection = createConnection(new IPCMessageReader(process), new IPCMessageWriter(process));

let documents: TextDocuments = new TextDocuments();
documents.listen(connection);

let workspaceRoot: string;

connection.onInitialize((params): InitializeResult => {
	workspaceRoot = params.rootPath;
	return {
		capabilities: {
			textDocumentSync: documents.syncKind,
			completionProvider: {
				resolveProvider: true,
				triggerCharacters: ['.']
			}
		}
	}
});

documents.onDidChangeContent((change) => {
	// TODO: Handle a changed document (change.document)
});

connection.onDidChangeConfiguration((change) => {
	// TODO: Handle a configuration change
});

var formatDocumentation = function(doc: string): MarkedString {
	var md = MarkedString.fromPlainText(doc);
	//md.isTrusted = true;
	return md;		
}

var setDocumentation = function(item: CompletionItem, cd: any) {
	var docLink = '';
	if (cd['path']) {
		//docLink = "\n\n" + helper.getDocumentPageLink(cd.path) + "\n\n";
		docLink = "\n\n" + cd.path + "\n\n";
	}
	var doc = docLink + format.htmlToPlainText(cd['documentation']);
	if (cd['params'] && cd['params'].length > 0) {
		doc += "\nParams:\n";
		for (var j = 0; j < cd['params'].length; j++) {
			doc += "- " + cd['params'][j] + "\n";
		}
	}
	var md = formatDocumentation(doc);
	item.documentation = md.toString();
}

connection.onCompletion((textDocumentPosition: TextDocumentPositionParams): Promise<CompletionItem[]> => {
	let doc = documents.get(textDocumentPosition.textDocument.uri);
	let filename = uriToFilePath(doc.uri);
	return new Promise((resolve) => {
		solargraphServer.suggest(doc.getText(), textDocumentPosition.position.line, textDocumentPosition.position.character, filename, workspaceRoot).then((results) => {
			var items = [];
			results['suggestions'].forEach((sugg) => {
				var item = CompletionItem.create(sugg.label);
				item.kind = CompletionItemKind[sugg.kind];
				if (sugg.documentation) {
					item.documentation = sugg.documentation;
				} else if (sugg.has_doc) {
					item.documentation = 'Loading...';
				} else {
					item.documentation = "\n" + sugg.path;
				}
				if (sugg['kind'] == 'Method' && sugg['arguments'].length > 0) {
					item.detail = '(' + sugg['arguments'].join(', ') + ') ' + (sugg['return_type'] ? '=> ' + sugg['return_type'] : '');
				} else {
					item.detail = (sugg['return_type'] ? '=> ' + sugg['return_type'] : '');
				}
				item.data = {};
				item.data.path = sugg['path'];
				item.data.textDocument = doc;
				items.push(item);
			});
			resolve(items);
		}).catch((err) => {
			console.log('Error: ' + JSON.stringify(err));
		});
	});
});

var formatMultipleSuggestions = function(cds: any[]) {
	var doc = '';
	var docLink = '';
	cds.forEach((cd) => {
		if (!docLink && cd.path) {
			//docLink = "\n\n" + helper.getDocumentPageLink(cd.path) + "\n\n";
			docLink = "\n\n" + cd.path + "\n\n";
		}
		doc += "\n" + format.htmlToPlainText(cd.documentation);
	});
	return formatDocumentation(docLink + doc);
}

connection.onCompletionResolve((item: CompletionItem): Promise<CompletionItem> => {
	return new Promise((resolve, reject) => {
		if (item.documentation && item.documentation != 'Loading...') {
			resolve(item);
		} else if (item.documentation == 'Loading...') {
			console.log('Getting stuff from ' + workspaceRoot + ' for ' + item.data['path']);
			solargraphServer.resolve(item.data.path, workspaceRoot).then((result:any) => {
				if (result.suggestions.length > 0) {
					var tmp = formatMultipleSuggestions(result.suggestions);
					if (tmp.toString() != '') {
						item.documentation = tmp.toString();
					}
				} else {
					item.documentation = '';
				}
				resolve(item);
			}).catch((result) => {
				reject(result);
			});
		} else {
			resolve(item);
		}
	});
});

connection.onExit(() => {
	solargraphServer.stop();
});

connection.listen();
solargraphServer.start().then(() => {
	solargraphServer.prepare(workspaceRoot);
});
