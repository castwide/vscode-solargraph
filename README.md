# VS Code Solargraph Extension

Solargraph provides code completion and inline documentation for Ruby.

## Features

* Context-aware suggestions and documentation for the Ruby core
* Detection of variable type (e.g., `String.new.` returns String instance methods)
* Identification of local, class, and instance variables within the current scope

## Requirements

You need to install the Ruby gem:

    gem install solargraph

## Usage

Open a Ruby file and start typing. Solargraph should start providing contextual code suggestions. To start a search manually, hit ctrl-space. Example:

    Stri # <- Hitting ctrl-space here will suggest String

## Extension Settings

This extension contributes the following settings:

* `solargraph.commandPath`: Path to the solargraph command.  Set this to an absolute path to select from multiple installed Ruby versions.
* `solargraph.useBundler`: Use `bundle exec` to run solargraph. (If this is true, `solargraph.commandPath` is ignored.)

## Known Issues

* Incomplete support for stdlib
* Completion items should include method arguments
