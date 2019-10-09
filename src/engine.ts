import { languages, Uri, workspace } from 'coc.nvim';
import extend from 'deep-extend';
import fs from 'fs';
import jsYaml from 'js-yaml';
import markdownlint, { MarkdownlintResult } from 'markdownlint';
import path from 'path';
import rc from 'rc';
import { Diagnostic, DiagnosticSeverity, Position, Range, TextDocument } from 'vscode-languageserver-protocol';

const source = 'markdownlint';
const projectConfigFiles = ['.markdownlint.json', '.markdownlint.yaml', '.markdownlint.yml'];
const configFileParsers = [JSON.parse, jsYaml.safeLoad];

export class MarkdownlintEngine {
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

    const preferences = workspace.getConfiguration('coc.preferences');
    const rootFolder = await workspace.resolveRootFolder(Uri.parse(workspace.uri), preferences.get('rootPatterns', []));

    for (const projectConfigFile of projectConfigFiles) {
      const fullPath = path.join(rootFolder, projectConfigFile);
      if (fs.existsSync(fullPath)) {
        try {
          fs.accessSync(fullPath, fs.constants.R_OK);
          // @ts-ignore
          const projectConfig = markdownlint.readConfigSync(fullPath, configFileParsers);
          this.config = extend(this.config, projectConfig);

          this.outputLine(`Info: local config: ${fullPath}, ${JSON.stringify(projectConfig)}`);
          break;
        } catch (_e) {}
      }
    }

    this.outputLine(`Info: full config: ${JSON.stringify(this.config)}`);
  }

  constructor() {
    this.parseLocalConfig();
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
