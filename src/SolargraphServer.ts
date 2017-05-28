import * as child_process from 'child_process';
import * as vscode from 'vscode';
import * as cmd from './commands';
import * as request from 'request';

export default class SolargraphServer {
    private child:child_process.ChildProcess = null;
    private port:string = null;
    private pid:number = null;

    public SolargraphServer() {
    }

    public isRunning():Boolean {
        return (this.port != null && this.pid != null);
    }

    public getPort():string {
        return this.port;
    }

    public start(callback?:Function) {
        var ranCallback = false;
        if (this.isRunning()) {
            console.warn('The server is already running.')
        } else {
            console.log('Starting the server');
            this.child = cmd.solargraphCommand([
                'server',
                '--port', vscode.workspace.getConfiguration("solargraph").serverPort,
                '--views', vscode.extensions.getExtension('castwide.solargraph').extensionPath + '/views'
            ]);
            this.child.stderr.on('data', (data) => {
                var out = data.toString();
                console.log(out);
                if (!this.port) {
                    var match = out.match(/port=([0-9]*)/);
                    if (match) {
                        this.port = match[1];
                    }
                    match = out.match(/pid=([0-9]*)/);
                    if (match) {
                        this.pid = parseInt(match[1]);
                    }
                }
                if (this.isRunning() && callback && !ranCallback) {
                    ranCallback = true;
                    callback();
                }
            });
            this.child.on('exit', () => {
                this.port = null;
            });
        }
    }

    public stop() {
        if (!this.isRunning()) {
            console.warn('The server is not running.');
        } else {
            process.kill(this.pid);
            this.pid = null;
            this.port = null;
        }
    }

    public restart() {
        this.stop();
        this.start();
    }

    public prepare(workspace:string) {
        request.post({url:'http://localhost:' + this.port + '/prepare', form: {
            workspace: workspace
        }});
    }
}
