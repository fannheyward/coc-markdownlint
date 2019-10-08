import { commands, ExtensionContext, workspace } from 'coc.nvim';
import { DidChangeTextDocumentParams, TextDocument } from 'vscode-languageserver-protocol';
import { MarkdownlintEngine } from './engine';

let documentVersion = 0;
const engine = new MarkdownlintEngine();

function didOpenTextDocument(document: TextDocument) {
  engine.lint(document);
}

async function didChangeTextDocument(params: DidChangeTextDocumentParams) {
  if (params.textDocument.version && documentVersion !== params.textDocument.version) {
    documentVersion = params.textDocument.version;
    const { document } = await workspace.getCurrentState();
    engine.lint(document);
  }
}

async function didSaveTextDocument(document: TextDocument) {
  engine.lint(document);
}

async function didCloseTextDocument(document: TextDocument) {
  console.error(document.uri);
}

export async function activate(context: ExtensionContext): Promise<void> {
  context.subscriptions.push(
    workspace.onDidOpenTextDocument(didOpenTextDocument),
    workspace.onDidChangeTextDocument(didChangeTextDocument),
    workspace.onDidSaveTextDocument(didSaveTextDocument),
    workspace.onDidCloseTextDocument(didCloseTextDocument),

    commands.registerCommand('coc-markdownlint.Command', async () => {
      workspace.showMessage(`coc-markdownlint Commands works!`);
    })
  );
}

export function deactivate() {
  engine.dispose();
}

