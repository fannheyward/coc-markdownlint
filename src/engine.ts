import { TextDocument, CodeAction, CodeActionContext, CodeActionKind, CodeActionProvider, Diagnostic, DiagnosticSeverity, languages, Position, Range, TextEdit, window, workspace, WorkspaceEdit } from 'coc.nvim';
import extend from 'deep-extend';
import fs from 'fs';
import jsYaml from 'js-yaml';
import { LintError, Options, readConfigSync, sync } from 'markdownlint';
import { applyFix, applyFixes } from 'markdownlint-rule-helpers';
import path from 'path';
import rc from 'rc';

const projectConfigFiles = ['.markdownlint.json', '.markdownlint.yaml', '.markdownlint.yml'];
const configFileParsers = [JSON.parse, jsYaml.load];

export class MarkdownlintEngine implements CodeActionProvider {
  public readonly fixAllCommandName = 'markdownlint.fixAll';
  private readonly source = 'markdownlint';
  private outputChannel = window.createOutputChannel(this.source);
  private diagnosticCollection = languages.createDiagnosticCollection(this.source);
  private config: { [key: string]: any } = {};

  private outputLine(message: string) {
    if (this.outputChannel) {
      this.outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] ${message}`);
    }
  }

  async parseConfig() {
    try {
      this.config = rc(this.source, {});
      this.outputLine(`Info: global config: ${JSON.stringify(rc(this.source, {}))}`);
    } catch (e) {
      this.outputLine(`Error: global config parse failed: ${e}`);
    }

    try {
      for (const projectConfigFile of projectConfigFiles) {
        const fullPath = path.join(workspace.root, projectConfigFile);
        if (fs.existsSync(fullPath)) {
          // @ts-ignore
          const projectConfig = readConfigSync(fullPath, configFileParsers);
          this.config = extend(this.config, projectConfig);

          this.outputLine(`Info: local config: ${fullPath}, ${JSON.stringify(projectConfig)}`);
          break;
        }
      }
    } catch (e) {
      this.outputLine(`Error: local config parse failed: ${e}`);
    }

    const cocConfig = workspace.getConfiguration('markdownlint').get<{[key:string]:any}>('config');
    if (cocConfig) {
      this.config = extend(this.config, cocConfig);
      this.outputLine(`Info: config from coc-settings.json: ${JSON.stringify(cocConfig)}`);
    }

    this.outputLine(`Info: full config: ${JSON.stringify(this.config)}`);
  }

  private markdownlintWrapper(document: TextDocument): LintError[] {
    const options: Options = {
      resultVersion: 3,
      config: this.config,
      // customRules: customRules,
      strings: {
        [document.uri]: document.getText(),
      },
    };

    let results: LintError[] = [];
    try {
      results = sync(options)[document.uri] as LintError[];
    } catch (e) {
      this.outputLine(`Error: lint exception: ${e}`);
    }

    return results || [];
  }

  public async provideCodeActions(document: TextDocument, range: Range, context: CodeActionContext) {
    const doc = workspace.getDocument(document.uri);
    const wholeRange = Range.create(0, 0, doc.lineCount, 0);
    let whole = false;
    if (range.start.line === wholeRange.start.line && range.start.character === wholeRange.start.character && range.end.line === wholeRange.end.line && range.end.character === wholeRange.end.character) {
      whole = true;
    }
    const codeActions: CodeAction[] = [];
    const fixInfoDiagnostics: Diagnostic[] = [];
    for (const diagnostic of context.diagnostics) {
      // @ts-ignore
      if (diagnostic.fixInfo) {
        // @ts-ignore
        const lineNumber = diagnostic.fixInfo.lineNumber - 1 || diagnostic.range.start.line;
        const line = await workspace.getLine(document.uri, lineNumber);
        // @ts-ignore
        const newText = applyFix(line, diagnostic.fixInfo, '\n');

        const edit: WorkspaceEdit = { changes: {} };
        if (typeof newText === 'string') {
          const range = Range.create(lineNumber, 0, lineNumber, line.length);
          edit.changes![document.uri] = [TextEdit.replace(range, newText)];
        } else {
          edit.changes![document.uri] = [TextEdit.del(diagnostic.range)];
        }

        const title = `Fix: ${diagnostic.message.split(':')[0]}`;
        const action: CodeAction = {
          title,
          edit,
          diagnostics: [...context.diagnostics],
        };

        fixInfoDiagnostics.push(diagnostic);
        if (!whole) {
          codeActions.push(action);
        }
      }
    }

    if (range.start.line === range.end.line && range.start.character === 0) {
      // <!-- markdownlint-disable-next-line -->
      const edit = TextEdit.insert(Position.create(range.start.line, 0), '<!-- markdownlint-disable-next-line -->\n')
      codeActions.push({
        title: 'Disable markdownlint for current line',
        edit: {
          changes: {
            [doc.uri]: [edit]
          }
        }
      })
    }

    if (whole) {
      // <!-- markdownlint-disable-file -->
      const edit = TextEdit.insert(Position.create(0, 0), '<!-- markdownlint-disable-file -->\n')
      codeActions.push({
        title: 'Disable markdownlint for current file',
        edit: {
          changes: {
            [doc.uri]: [edit]
          }
        }
      })
    }

    if (fixInfoDiagnostics.length) {
      const title = 'Fix All error found by markdownlint';
      const sourceFixAllAction: CodeAction = {
        title,
        kind: CodeActionKind.SourceFixAll,
        diagnostics: fixInfoDiagnostics,
        command: {
          title,
          command: this.fixAllCommandName,
        },
      };

      codeActions.push(sourceFixAllAction);
    }

    return codeActions;
  }

  public lint(document: TextDocument) {
    if (document.languageId !== 'markdown') {
      return;
    }
    this.diagnosticCollection.set(document.uri)

    const results = this.markdownlintWrapper(document);
    if (!results.length) {
      return;
    }

    const diagnostics: Diagnostic[] = [];
    results.forEach((result: LintError) => {
      const ruleDescription = result.ruleDescription;
      let message = result.ruleNames.join('/') + ': ' + ruleDescription;
      if (result.errorDetail) {
        message += ' [' + result.errorDetail + ']';
      }

      const start = Position.create(result.lineNumber - 1, 0);
      const end = Position.create(result.lineNumber - 1, 0);
      if (result.errorRange) {
        start.character = result.errorRange[0] - 1;
        end.character = start.character + result.errorRange[1];
      }

      const range = Range.create(start, end);
      const diagnostic = Diagnostic.create(range, message);
      diagnostic.severity = DiagnosticSeverity.Warning;
      diagnostic.source = this.source;
      // @ts-ignore
      diagnostic.fixInfo = result.fixInfo;
      diagnostics.push(diagnostic);
    });

    this.diagnosticCollection.set(document.uri, diagnostics);
  }

  public async fixAll(document: TextDocument) {
    const results = this.markdownlintWrapper(document);
    if (!results.length) {
      return;
    }

    const text = document.getText();
    const fixedText = applyFixes(text, results);
    if (text != fixedText) {
      const doc = workspace.getDocument(document.uri);
      const end = Position.create(doc.lineCount - 1, doc.getline(doc.lineCount - 1).length);
      const edit: WorkspaceEdit = {
        changes: {
          [document.uri]: [TextEdit.replace(Range.create(Position.create(0, 0), end), fixedText)],
        },
      };
      await workspace.applyEdit(edit);
    }
  }
}
