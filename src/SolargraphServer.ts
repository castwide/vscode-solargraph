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
		return (this.child != null && this.port != null && this.pid != null);
	}

	public getPort():string {
		return this.port;
	}

	public start(callback?:Function) {
		var ranCallback = false;
		if (this.child) {
			console.warn('There is already a process running for the Solargraph server.');
		} else {
			console.log('Starting the server');
			this.child = cmd.solargraphCommand([
				'server',
				'--port', '0',
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
		if (!this.child) {
			console.warn('The server is not running.');
		} else {
			this.child.kill();
			if (this.pid) {
				process.kill(this.pid);
			}
			this.pid = null;
			this.port = null;
			this.child = null;
		}
	}

	public restart() {
		this.stop();
		this.start();
	}

	public prepare(workspace:string) {
		if (workspace) {
			let prepareStatus = vscode.window.setStatusBarMessage('Analyzing Ruby code in workspace ' + workspace);
			request.post({url:'http://localhost:' + this.port + '/prepare', form: {
				workspace: workspace
			}}, function(err, response, body) {
				setTimeout(function() {
				prepareStatus.dispose();
					if (err) {
						vscode.window.setStatusBarMessage('There was an error analyzing the Ruby code.', 3000);
					}
				}, 500);
			});
		} else {
			console.log('No workspace to prepare.');
		}
	}
}
