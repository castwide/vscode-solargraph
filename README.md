# VS Code Solargraph Extension

Solargraph provides code completion and inline documentation for Ruby.

![Screenshot](vscode-solargraph-0.1.0.gif)

*This project is still in early development.* Expect bugs and breaking changes.

## Features

* Context-aware suggestions and documentation for the Ruby core
* Detection of some variable types and method return values (e.g., `String.new.` returns String instance methods)
* Identification of local, class, and instance variables within the current scope
* Near-complete support for the Ruby stdlib
* Partial support for Ruby on Rails

## Requirements

You need to install the Ruby gem:

    gem install solargraph

## Usage

### Code Completion

Open a Ruby file and start typing. Solargraph should start providing contextual code suggestions. To start a search manually, hit ctrl-space. Example:

    Stri # <- Hitting ctrl-space here will suggest String

Method arguments and documentation can be seen by starting parentheses after the method call. Example:

    String.new.casecmp( # <- Displays arguments and documentation for String#casecmp

### Documentation

Solargraph provides a command to access searchable documentation directly from the IDE.

* Hit ctrl+shift+r (or hit ctrl+shift+p and find `Search Ruby Documentation`).
* Enter a keyword or path to search; e.g., `String` or `Array#join`.

The documentation includes the Ruby core, bundled gems, and the current workspace. Documentation from the workspace is automatically updated when you save the corresponding file.

You can also hover over variables, constants, and method calls to see popup information with links to more documentation.

#### Documenting Your Code

Using [YARD](http://www.rubydoc.info/gems/yard/file/docs/GettingStarted.md) for inline documentation is highly recommended.
Solargraph will use YARD comments to provide the best code completion and API reference it can.

In addition to the standard YARD tags, Solargraph defines a `@type` tag for documenting variable types. It works with both
local and instance variables. Example:

    # @type [String]
    my_variable = some_method_call
    my_variable. # <= Hitting crtl-space here will suggest String instance methods

### Restarting Solargraph

Some changes you make to a project, such as updating the Gemfile, might require you to restart the Solargraph server.
Instead of reloading the VS Code window, you can run Restart Solargraph from the Command Palette.

### Project Configuration

Solargraph will use the .solargraph.yml file for configuration if it exists in the workspace root. The extension provides
a command to `Create a Solargraph config file`, or you can do it from the command line:

    $ solargraph config .

The default file should look something like this:

    include:
      - ./**/*.rb
    exclude:
      - spec/**/*

This configuration tells Solargraph to parse all .rb files in the workspace excluding the spec folder.

## Updating the Core Documentation (EXPERIMENTAL)

The Solargraph gem ships with documentation for Ruby 2.2.2. As of gem version 0.15.0, there's an option to download additional documentation for other Ruby versions from the command line.

    $ solargraph list-cores      # List the installed documentation versions
    $ solargraph available-cores # List the versions available for download
    $ solargraph download-core   # Install the best match for your Ruby version
    $ solargraph clear-cores     # Clear the documentation cache

## Runtime Suggestions (EXPERIMENTAL)

As of gem version 0.15.0, Solargraph includes experimental support for plugins.

The built-in `Runtime` plugin enhances code completion by querying namespaces for method names in a subprocess. If it finds any undocumented or "magic" methods, they get added to the suggestions.

This feature is currently disabled by default. If you'd like to try it, you can enable it by setting the `plugins` section in your project's .solargraph.yml file:

    plugins:
    - runtime

## Extension Settings

This extension contributes the following settings:

* `solargraph.commandPath`: Path to the solargraph command.  Set this to an absolute path to select from multiple installed Ruby versions.
* `solargraph.useBundler`: Use `bundle exec` to run solargraph. (If this is true, `solargraph.commandPath` is ignored.)
* `solargraph.withSnippets`: Include snippets in completion suggestions. Default is false.
* `solargraph.checkGemVersion`: Check if a new version of the Solargraph gem is available. Default is true (recommended).

## Known Issues

* Partial support for stdlib
* Partial support for Rails
* Documentation pages need better design/layout
