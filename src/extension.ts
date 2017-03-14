'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as path from 'path';
import * as child_process from 'child_process';
import * as request from 'request';
import * as fs from 'fs';

let solargraphProcess = null;

const completionProvider = {
    provideCompletionItems: function completionProvider(document: vscode.TextDocument, position: vscode.Position) {
        return new Promise((resolve, reject) => {
            const kinds = {
                "Class": vscode.CompletionItemKind.Class,
                "Keyword": vscode.CompletionItemKind.Keyword,
                "Module": vscode.CompletionItemKind.Module,
                "Method": vscode.CompletionItemKind.Method,
                "Variable": vscode.CompletionItemKind.Variable,
                "Snippet": vscode.CompletionItemKind.Snippet
            }
            /*var cmd = ['solargraph', 'suggest'];
            var cwd = path.dirname(document.fileName);
            var output = '';
            if (vscode.workspace.rootPath) {
                // TODO: Check for a gemfile
                //cmd.unshift('C:\\Ruby23-x64\\bin\\bundle.bat', 'exec');
                cmd.unshift('powershell', 'bundle', 'exec');
                cwd = vscode.workspace.rootPath;
            }
            console.log(cmd.join(' '));
            console.log('Workding dir: ' + cwd);
            var process = child_process.spawn(cmd.shift(), cmd, {cwd: cwd});
            process.stdout.on('data', (data) => {
                output += data;
            });
            process.stderr.on('data', (data) => {
                console.log('[stderr]' + data);
            });
            process.stdout.on('close', () => {
                console.log(' I received \'' + output + "'");
                var SnippetString = vscode['SnippetString'];
                var result = JSON.parse(output);
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
                        item.documentation = cd['detail'];
                        items.push(item);
                    });
                    return resolve(items);
                } else {
                    return resolve([]);
                }
            });
            var inpObject = {
                filename: document.fileName, text: document.getText(), position: document.offsetAt(position)
            };
            var inpString = JSON.stringify(inpObject);
            console.log('Sending ' + inpString);
            process.stdin.end(inpString);
            //process.send(inpString);
            //return resolve([]);*/
            console.log('Posting');
            request.post({ url: 'http://localhost:56527/suggest', form: { filename: document.fileName, text: document.getText(), index: document.offsetAt(position) }}, function(error, response, body) {
                // HACK: Tricking the type system to avoid an invalid error
                var SnippetString = vscode['SnippetString'];
                if (!error && response.statusCode == 200) {
                    if (body == "") {
                        return resolve([]);
                    } else {
                        //console.log(body);
                        let result = JSON.parse(body);
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
                                item.documentation = cd['detail'];
                                items.push(item);
                            });
                            return resolve(items);
                        } else {
                            return resolve([]);
                        }
                    }
                }
            });
        });
    }
}

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
    context.subscriptions.push(
        vscode.languages.registerCompletionItemProvider(
            'ruby', completionProvider, "."
        )
    );
    var cmd = ['solargraph', 'serve'];
    var cwd = null;
    var isWin = /^win/.test(process.platform);
    if (vscode.workspace.rootPath) {
        // TODO: Check for a gemfile
        // TODO: Only use powershell for Windows, obviously
        //cmd.unshift('C:\\Ruby23-x64\\bin\\bundle.bat', 'exec');
        cmd.unshift('bundle', 'exec');
        cwd = vscode.workspace.rootPath;
    }
    if (isWin) {
        cmd.unshift('powershell');
    }
    solargraphProcess = child_process.spawn(cmd.shift(), cmd, { cwd: cwd });
    solargraphProcess.stderr.on('data', (data) => {
        console.log('[stderr from Solargraph server] ' + data);
    });
    solargraphProcess.stdout.on('data', (data) => {
        console.log('[stdout from Solargraph server] ' + data);
        // TODO This is where we'll have some kind of mechanism for setting up the environment.
    });
    cmd = ['yard', 'gems'];
    if (vscode.workspace.rootPath) {
        cmd.unshift('bundle', 'exec');        
    }
    if (isWin) {
        cmd.unshift('powershell');
    }
    child_process.spawn(cmd.shift(), cmd, { cwd: cwd });
    console.log('Solargraph extension activated.');
}

// this method is called when your extension is deactivated
export function deactivate() {
    console.log('Deactivating extension');
    solargraphProcess.kill();
}
