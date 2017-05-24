import * as vscode from 'vscode';
import * as child_process from 'child_process';

export function solargraphCommand(args) {
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

export function yardCommand(args) {
	let cmd = [];
	if (vscode.workspace.getConfiguration('solargraph').useBundler) {
		cmd.push('bundle', 'exec');
	}
	cmd.push('yard');
	var env = { shell: true };
	if (vscode.workspace.rootPath) env['cwd'] = vscode.workspace.rootPath;
	return child_process.spawn(cmd.shift(), cmd.concat(args), env);
}

export function gemCommand(args) {
	let cmd = [];
	if (vscode.workspace.getConfiguration('solargraph').useBundler) {
		cmd.push('bundle', 'exec');
	}
	cmd.push('gem');
	var env = { shell: true };
	if (vscode.workspace.rootPath) env['cwd'] = vscode.workspace.rootPath;
	return child_process.spawn(cmd.shift(), cmd.concat(args), env);
}
