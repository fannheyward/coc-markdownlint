import { CodeAction, CodeActionProvider, languages, Uri, workspace } from 'coc.nvim';
import extend from 'deep-extend';
import fs from 'fs';
import jsYaml from 'js-yaml';
import markdownlint, { MarkdownlintResult } from 'markdownlint';
import { applyFix } from 'markdownlint-rule-helpers';
import path from 'path';
import rc from 'rc';
import { CodeActionContext, Diagnostic, DiagnosticSeverity, Position, Range, TextDocument, TextEdit, WorkspaceEdit } from 'vscode-languageserver-protocol';

const source = 'markdownlint';
const projectConfigFiles = ['.markdownlint.json', '.markdownlint.yaml', '.markdownlint.yml'];
const configFileParsers = [JSON.parse, jsYaml.safeLoad];

export class MarkdownlintEngine implements CodeActionProvider {
  private outputChannel = workspace.createOutputChannel(source);
  private diagnosticCollection = languages.createDiagnosticCollection(source);
  private config = rc(source, {});

  private outputLine(message: string) {
    if (this.outputChannel) {
      this.outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] ${message}`);
    }
  }

  private async parseLocalConfig() {
    this.outputLine(`Info: global config: ${JSON.stringify(this.config)}`);

    try {
      const preferences = workspace.getConfiguration('coc.preferences');
      const rootFolder = await workspace.resolveRootFolder(Uri.parse(workspace.uri), preferences.get('rootPatterns', []));
      for (const projectConfigFile of projectConfigFiles) {
        const fullPath = path.join(rootFolder, projectConfigFile);
        if (fs.existsSync(fullPath)) {
          // @ts-ignore
          const projectConfig = markdownlint.readConfigSync(fullPath, configFileParsers);
          this.config = extend(this.config, projectConfig);

          this.outputLine(`Info: local config: ${fullPath}, ${JSON.stringify(projectConfig)}`);
          break;
        }
      }
    } catch (_e) {}

    const cocConfig = workspace.getConfiguration('markdownlint').get('config');
    if (cocConfig) {
      this.config = extend(this.config, cocConfig);
      this.outputLine(`Info: config from coc-settings.json: ${JSON.stringify(cocConfig)}`);
    }

    this.outputLine(`Info: full config: ${JSON.stringify(this.config)}`);
  }

  constructor() {
    this.parseLocalConfig();
  }

  public async provideCodeActions(document: TextDocument, _range: Range, context: CodeActionContext) {
    const codeActions: CodeAction[] = [];
    for (const diagnostic of context.diagnostics) {
      // @ts-ignore
      if (diagnostic.ext) {
        // @ts-ignore
        const ext = diagnostic.ext as MarkdownlintResult;
        const line = await workspace.getLine(document.uri, ext.lineNumber - 1);
        if (!line) {
          continue;
        }
        // @ts-ignore
        const newText = applyFix(line, ext.fixInfo);
        const edit: WorkspaceEdit = {
          changes: {}
        };
        const change: TextEdit = {
          range: Range.create(ext.lineNumber - 1, 0, ext.lineNumber - 1, line.length),
          newText
        };
        edit.changes![document.uri] = [change];

        const title = `Fix: ${diagnostic.message.split(':')[0]}`;
        const action: CodeAction = {
          title,
          edit,
          diagnostics: [...context.diagnostics]
        };

        codeActions.push(action);
      }
    }

    console.error(codeActions.length);
    return codeActions;
  }

  public lint(document: TextDocument) {
    this.diagnosticCollection.clear();
    if (document.languageId !== 'markdown') {
      return;
    }

    const diagnostics: Diagnostic[] = [];

    const options: markdownlint.MarkdownlintOptions = {
      resultVersion: 3,
      config: this.config,
      // customRules: customRules,
      strings: {
        [document.uri]: document.getText()
      }
    };

    try {
      const results = markdownlint.sync(options)[document.uri] as MarkdownlintResult[];
      results.forEach((result: MarkdownlintResult) => {
        const ruleDescription = result.ruleDescription;
        // @ts-ignore
        let message = result.ruleNames.join('/') + ': ' + ruleDescription;
        if (result.errorDetail) {
          message += ' [' + result.errorDetail + ']';
        }

        const start = Position.create(result.lineNumber - 1, 0);
        const end = Position.create(result.lineNumber - 1, 0);
        if (result.errorRange) {
          start.character = result.errorRange[0] - 1;
          end.character = result.errorRange[1];
        }

        const range = Range.create(start, end);
        const diagnostic = Diagnostic.create(range, message);
        diagnostic.severity = DiagnosticSeverity.Warning;
        diagnostic.source = source;
        // @ts-ignore
        // TODO: limit same lineNumber
        if (result.fixInfo && (!result.fixInfo.lineNumber || result.fixInfo.lineNumber === result.lineNumber)) {
          // @ts-ignore
          diagnostic.ext = result;
        }
        diagnostics.push(diagnostic);
      });

      this.diagnosticCollection.set(document.uri, diagnostics);
    } catch (e) {
      this.outputLine(`Error: ${e}`);
    }
  }
}
