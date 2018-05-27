## 0.17.4 - May 29, 2018
- solargraph.downloadCore command
- Updated README

## 0.17.3 - May 18, 2018
- Missing solargraph.config command

## 0.17.2 - May 17, 2018
- Improved messages for solargraph executable failures

## 0.17.1 - May 8, 2018
- Use original gem version check

## 0.17.0 - May 7, 2018
- Dynamic registration options
- Commands for building gem documentation

## 0.16.0 - April 16, 2018
- `solargraph.diagnostics` default is false
- Updated solargraph-utils

## 0.15.0 - April 10, 2018
- Removed rebornix.Ruby integration checks
- Enabled gem notifications

## 0.14.1 - April 5, 2018
- Fixed server start after gem updates.

## 0.14.0 - April 5, 2018
- First version of language server
- Allow commandPath and bundlerPath in workspace configuration

## 0.13.0 - March 6, 2018
- bundlerPath configuration option
- Disabled installation notification

## 0.12.0 - February 3, 2018
- Go to/peek definition support
- Update solargraph-utils for improved shell detection

## 0.11.3 - January 31, 2018
- Handle undefined workspace folders

## 0.11.2 - January 31, 2018
- Updated solargraph-utils to fix shell argument bug
- Invoke explicit bash shell on darwin and linux

## 0.11.1 - January 26, 2018
- Check Ruby extension's code completion setting

## 0.11.0 - January 17, 2018
- First version of download core command
- Documentation page tweaks
- Method parameters in document pages
- Fixed bug in completion of symbols with leading underscores
- Fixed document page links
- Always display suggestion paths
- Multi-root workspace support

## 0.10.3 - December 12, 2017
- Use suggestion's has_doc property to determine whether to resolve documentation
- Fix document links in expanded documentation

## 0.10.2 - December 4, 2017
- README explains the Runtime plugin and how to update the core documentation
- Reload inline documents to keep them in sync with the workspace

## 0.10.1 - November 26, 2017
- Minor path resolution bugs

## 0.10.0 - November 26, 2017
- Do not repeat paths in hovers.
- First version of Rails and stdlib support
- Update vscode engine
- Support document links in CompletionItem documentation
- Resolve completion item detail separately
- Update to solargraph-utils 0.3.3

## 0.9.1 - October 30, 2017
- Provide completion items for global variables

## 0.9.0 - October 4, 2017
- Update solargraph-utils
- Quick file updates (single file vs. entire workspace)
- Eliminated local yardoc dependency

## 0.8.0 - September 12, 2017
- Show @ characters in class/instance variable labels.
- Prepare workspace on server restart.
- Use MarkdownString for trusted command links.

## 0.7.1 - September 5, 2017
- solargraph.checkGemVersion setting
- solargraph.checkGemVersion command

## 0.7.0 - August 9, 2017
- Constant completion item kind.
- Detect class variables and infer types.
- Detect yield parameters in method blocks.

## 0.6.0 - August 7, 2017
- Display error message when gem test fails.
- Updated solargraph-utils version.
- Restart the server when the configuration changes.
- Message actions for installing and updating the gem.

## 0.5.1 - August 1, 2017
- Display param tag info in method documentation.
- Config file command.

## 0.5.0 - July 5, 2017
- Use solargraph-utils for Solargraph gem integration.
- Additional HTML to plain text conversions.

## 0.4.1 - June 14, 2017
- Use html2plaintext to convert documentation.
- Do not prepare workspace (i.e., run yardoc update) if root path is undefined.

## 0.4.0 - June 12, 2017
- Restart server command.
- Commands activate extension.
- Removed useServer configuration (extension always requires server for now).
- Completion items display arguments, return value, path, and documentation.
- Convert HTML to plain text in documentation.

## 0.3.2 - June 6, 2017
- Field and Property completion item kinds.

## 0.3.1 - June 2, 2017
- Fixed instance variable completion bug.

## 0.3.0 – May 24th, 2017
- Only set CompletionItem.insertText to SnippetString if suggestion kind is Snippet.
- Arguments removed from CompletionItem labels.
- Signature help for method arguments.
- The extension requires the Solargraph server for the time being. Running processes for queries is too cumbersome.
- Display popup documentation on hover with links to documentation.
- Code completion detail includes arguments for methods.
- Code analysis notifications in status bar.

## 0.2.6
- Setting to choose whether the gem includes snippets in suggestions. Defaults to false.

## 0.2.5
- Solargraph server manages the workspace yardoc.

## 0.2.4
- Trigger workspace refresh on file saves. (This eliminates the need for the server's constant_updates thread.)

## 0.2.3
- Documentation for the @type tag

## 0.2.2
- Kill Solargraph server process on deactivation

## 0.1.1
- Minor documentation updates

## 0.1.0
- Check for Solargraph gem updates
- Use server instead of command line for better performance
- Serial files are no longer used

## 0.0.2
- Updated README and package metadata (author, keywords, etc.)
- Added icon
- Reduced console output

## 0.0.1
- Initial release
