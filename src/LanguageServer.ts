'use strict';

import { IConnection, createConnection, IPCMessageReader, IPCMessageWriter, TextDocuments, InitializeResult, TextDocumentPositionParams, CompletionItem, CompletionItemKind } from 'vscode-languageserver';
import * as solargraph from 'solargraph-utils';
import { uriToFilePath } from 'vscode-languageserver/lib/files';

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
				resolveProvider: true
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

connection.onCompletion((textDocumentPosition: TextDocumentPositionParams): Promise<CompletionItem[]> => {
	let doc = documents.get(textDocumentPosition.textDocument.uri);
	let filename = uriToFilePath(doc.uri);
	return new Promise((resolve) => {
		solargraphServer.suggest(doc.getText(), textDocumentPosition.position.line, textDocumentPosition.position.character, filename, null).then((results) => {
			var items = [];
			results['suggestions'].forEach((sugg) => {
				var item = {
					label: sugg.label,
					kind: CompletionItemKind[sugg.kind]
				}
				items.push(item);
			});
			resolve(items);
		}).catch((err) => {
			console.log('Error: ' + JSON.stringify(err));
		});
	});
});

connection.onCompletionResolve((item: CompletionItem): Promise<CompletionItem> => {
	return new Promise((resolve) => {
		resolve(item);
	})
});

connection.onExit(() => {
	solargraphServer.stop();
});

connection.listen();
solargraphServer.start().then(() => {
	solargraphServer.prepare(workspaceRoot);
});
