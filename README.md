# VS Code Solargraph Extension

Solargraph provides code completion and inline documentation for Ruby.

![Screenshot](vscode-solargraph-0.1.0.gif)

*This project is still in early development.* Expect bugs and breaking changes.

## Features

* Context-aware suggestions and documentation for the Ruby core
* Detection of some variable types and method return values (e.g., `String.new.` returns String instance methods)
* Identification of local, class, and instance variables within the current scope

## Requirements

You need to install the Ruby gem:

    gem install solargraph

## Usage

### Code Completion

Open a Ruby file and start typing. Solargraph should start providing contextual code suggestions. To start a search manually, hit ctrl-space. Example:

    Stri # <- Hitting ctrl-space here will suggest String

### Documentation

Solargraph provides access to searchable documentation directly from the IDE.

* Hit ctrl-shift-p to open commands.
* Find `Search Ruby Commands`.
* Enter a keyword or path to search; e.g., `String` or `Array#split`.

## Extension Settings

This extension contributes the following settings:

* `solargraph.commandPath`: Path to the solargraph command.  Set this to an absolute path to select from multiple installed Ruby versions.
* `solargraph.useBundler`: Use `bundle exec` to run solargraph. (If this is true, `solargraph.commandPath` is ignored.)
* `solargraph.useServer`: Run solargraph server for better performance. Defaults to true as of version 0.1.0.
* `solargraph.serverPort`: The port where the server runs. Default is 7657. 0 selects the first available port.

## Known Issues

* Incomplete support for stdlib
* Incomplete support for Rails
