'use strict';
import * as vscode from 'vscode';
import * as path from 'path';
import * as child_process from 'child_process';
import * as request from 'request';
import * as fs from 'fs';
import YardContentProvider from './YardContentProvider'

var solargraphServer:child_process.ChildProcess = null;
var solargraphPort:string = null;
var solargraphPid:number = null;

function solargraphCommand(args) {
	let cmd = [];
	if (vscode.workspace.getConfiguration('solargraph').useBundler) {
		// TODO: pathToBundler configuration
		cmd.push('bundle', 'exec', 'solargraph');
	} else {
		cmd.push(vscode.workspace.getConfiguration('solargraph').commandPath);
	}
	var env = { shell: true };
	if (vscode.workspace.rootPath) env['cwd'] = vscode.workspace.rootPath;
	return child_process.spawn(cmd.shift(), cmd.concat(args), env);
}

function yardCommand(args) {
	let cmd = [];
	if (vscode.workspace.getConfiguration('solargraph').useBundler) {
		cmd.push('bundle', 'exec');
	}
	cmd.push('yard');
	var env = { shell: true };
	if (vscode.workspace.rootPath) env['cwd'] = vscode.workspace.rootPath;
	return child_process.spawn(cmd.shift(), cmd.concat(args), env);
}

function gemCommand(args) {
	let cmd = [];
	if (vscode.workspace.getConfiguration('solargraph').useBundler) {
		cmd.push('bundle', 'exec');
	}
	cmd.push('gem');
	var env = { shell: true };
	if (vscode.workspace.rootPath) env['cwd'] = vscode.workspace.rootPath;
	return child_process.spawn(cmd.shift(), cmd.concat(args), env);
}

function getCompletionItems(data, document:vscode.TextDocument, position: vscode.Position):Array<vscode.CompletionItem> {
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
			}
			if (cd['kind'] == 'Snippet') {
				item.insertText = new SnippetString(cd['insert']);
			} else {
				item.insertText = cd['insert'];
			}
			if (range) {
				// HACK: Unrecognized property
				item['range'] = range;
			}
			item.detail = cd['detail'];
			item.documentation = cd['documentation'];
			items.push(item);
		});
	}
	return items;
}

const completionProvider = {
    provideCompletionItems: function completionProvider(document: vscode.TextDocument, position: vscode.Position) {
        return new Promise((resolve, reject) => {
			if (solargraphServer && solargraphPort) {
				request.post({url:'http://localhost:' + solargraphPort + '/suggest', form: {
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
							return resolve(getCompletionItems(JSON.parse(body), document, position));
						} else {
							// TODO: Handle error
						}
					}
				});
			} else {
				let child = solargraphCommand([
					'suggest',
					'--line=' + position.line,
					'--column=' + position.character,
					'--filename=' + document.fileName
				]);
				let errbuf = [], outbuf = [];
				child.stderr.on('data', (data) => {
					console.log(data.toString());
					errbuf.push(data);
				});
				child.stdout.on('data', (data) => outbuf.push(data));
				child.on('exit', () => {
					var data = outbuf.join('');
					if (data == "") {
						return resolve([]);
					} else {
						let result = JSON.parse(data);
						return resolve(getCompletionItems(result, document, position));
					}
				});
				child.on('error', () => {
					if (errbuf.length) {
						console.log(errbuf.join("\n"));
					}
				});
				child.stdin.end(document.getText());
			}
        });
    }
}

function updateYard(saved: vscode.TextDocument) {
	if (vscode.workspace.getConfiguration("solargraph").useServer) {
		request.post({url:'http://localhost:' + solargraphPort + '/prepare', form: {
			workspace: vscode.workspace.rootPath
		}});
	} else {
		// Keep the yardoc up to date when a server isn't running
		yardCommand([]);
	}
}

function checkGemVersion() {
	let child = gemCommand(['outdated']);
	let result = "\n";
	child.stdout.on('data', (data:Buffer) => {
		result += data.toString();
	});
	child.on('exit', () => {
		if (result.match(/[\s]solargraph[\s]/)) {
			vscode.window.showInformationMessage('A new version of the Solargraph gem is available. Run `gem update solargraph` or update your Gemfile to install it.');
		}
	});
}

function startServer() {
	console.log('Starting the server');
	solargraphServer = solargraphCommand([
		'server',
		'--port', vscode.workspace.getConfiguration("solargraph").serverPort,
		'--views', vscode.extensions.getExtension('castwide.solargraph').extensionPath + '/views'
	]);
	solargraphServer.stderr.on('data', (data) => {
		var out = data.toString();
		console.log(out);
		if (!solargraphPort) {
			var match = out.match(/port=([0-9]*)/);
			if (match) {
				solargraphPort = match[1];
				vscode.workspace.registerTextDocumentContentProvider('solargraph', new YardContentProvider(solargraphPort));
			}
			match = out.match(/pid=([0-9]*)/);
			if (match) {
				solargraphPid = parseInt(match[1]);
			}
		}
	});
	solargraphServer.on('exit', () => {
		solargraphPort = null;
	});
}

export function activate(context: vscode.ExtensionContext) {
	var disposableSearch = vscode.commands.registerCommand('solargraph.search', () => {
		vscode.window.showInputBox({prompt: 'Search Ruby documentation:'}).then(val => {
			let uri = new vscode.Uri().with({scheme: 'solargraph', path: '/search', query: val});
			vscode.commands.executeCommand('solargraph._openDocument', uri);
		});
	});
	context.subscriptions.push(disposableSearch);

	var disposableOpen = vscode.commands.registerCommand('solargraph._openDocument', (uriString: string) => {
		var uri = vscode.Uri.parse(uriString);
		var label = (uri.path == '/search' ? 'Search for ' : '') + uri.query;
		vscode.commands.executeCommand('vscode.previewHtml', uri, vscode.ViewColumn.Two, label);
	});
	context.subscriptions.push(disposableOpen);

	const solargraphTest = solargraphCommand(['prepare']);
	solargraphTest.on('exit', () => {
		console.log('The Solargraph gem is installed and working.');
		checkGemVersion();
		context.subscriptions.push(vscode.languages.registerCompletionItemProvider('ruby', completionProvider, '.', '@'));
		yardCommand(['gems']);
		if (vscode.workspace.getConfiguration("solargraph").useServer) {
			startServer();
		} else {
			yardCommand([]); // Update the yardoc
		}
		context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(updateYard));
	});
	solargraphTest.on('error', () => {
		console.log('The Solargraph gem is not available.');
		vscode.window.showInformationMessage('Solargraph gem not found. Run `gem install solargraph` or update your Gemfile to install it.');
	});

    console.log('Solargraph extension activated.');
}

export function deactivate() {
	if (solargraphPid) process.kill(solargraphPid);
}
