import { languages, DiagnosticCollection, workspace } from 'coc.nvim';
import extend from 'deep-extend';
import fs from 'fs';
import jsYaml from 'js-yaml';
import markdownlint, { MarkdownlintResult } from 'markdownlint';
import rc from 'rc';
import { Position, TextDocument, Diagnostic, Range, DiagnosticSeverity } from 'vscode-languageserver-protocol';

const source = 'markdownlint';
const projectConfigFiles = ['.markdownlint.json', '.markdownlint.yaml', '.markdownlint.yml'];
const configFileParsers = [JSON.parse, jsYaml.safeLoad];

function getConfig() {
  let config = rc(source, {});
  for (const projectConfigFile of projectConfigFiles) {
    try {
      fs.accessSync(projectConfigFile, fs.constants.R_OK);
      // @ts-ignore
      const projectConfig = markdownlint.readConfigSync(projectConfigFile, configFileParsers);
      config = extend(config, projectConfig);
      break;
    } catch (error) {
      // Ignore failure
    }
  }

  return config;
}

export class MarkdownlintEngine {
  private outputChannel = workspace.createOutputChannel(source);
  private diagnosticCollection = languages.createDiagnosticCollection(source);
  private config = getConfig();

  private outputLine(message: string) {
    if (this.outputChannel) {
      this.outputChannel.appendLine(`[${new Date().toLocaleTimeString()}] ${message}`);
      this.outputChannel.show();
    }
  }

  public lint(document: TextDocument) {
    if (document.languageId !== 'markdown') {
      return;
    }

    const diagnostics: Diagnostic[] = [];

    const options: markdownlint.MarkdownlintOptions = {
      config: this.config,
      // customRules: customRules,
      strings: {
        [document.uri]: document.getText()
      }
    };

    try {
      const results = <MarkdownlintResult[]>markdownlint.sync(options)[document.uri];
      results.forEach((result: MarkdownlintResult) => {
        // @ts-ignore
        const ruleName = result.ruleNames[0];
        const ruleDescription = result.ruleDescription;
        // @ts-ignore
        let message = result.ruleNames.join('/') + ': ' + ruleDescription;
        if (result.errorDetail) {
          message += ' [' + result.errorDetail + ']';
        }

        let start = Position.create(result.lineNumber - 1, 0);
        let end = Position.create(result.lineNumber - 1, 0);
        if (result.errorRange) {
          start.character = result.errorRange[0] - 1;
          end.character = result.errorRange[1];
        }

        const range = Range.create(start, end);
        const diagnostic = Diagnostic.create(range, message);
        diagnostic.severity = DiagnosticSeverity.Warning;
        diagnostic.code = ruleName;
        diagnostic.source = source;
        diagnostics.push(diagnostic);
      });

      this.diagnosticCollection.set(document.uri, diagnostics);
    } catch (e) {
      this.outputLine(`Error: ${e}`);
    }
  }

  public dispose() {
    this.outputChannel.dispose();
  }
}
