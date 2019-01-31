'use strict';

// Inspired by elegant-spinner (https://github.com/sindresorhus/elegant-spinner)

export default class Spinner {
	// The original elegant-spinner used different characters on Windows due to
	// lack of Unicode support in the console. Since vscode-solargraph uses it
	// in the status bar, Unicode is fine.
	private frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

	private interval = 0;

	public spin(): string {
		return this.frames[this.interval = ++this.interval % this.frames.length];	
	}
};
