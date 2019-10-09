import { Document, events, ExtensionContext, workspace } from 'coc.nvim';
import { DidChangeTextDocumentParams, TextDocument } from 'vscode-languageserver-protocol';
import { MarkdownlintEngine } from './engine';

let documentVersion = 0;
const engine = new MarkdownlintEngine();
const config = workspace.getConfiguration('markdownlint');

function didOpenTextDocument(document: TextDocument) {
  if (config.get('onOpen', true)) {
    engine.lint(document);
  }
}

async function didChangeTextDocument(params: DidChangeTextDocumentParams) {
  if (!config.get<boolean>('onChange', true)) {
    return;
  }

  if (params.textDocument.version && documentVersion !== params.textDocument.version) {
    documentVersion = params.textDocument.version;
    const { document } = await workspace.getCurrentState();
    engine.lint(document);
  }
}

async function didSaveTextDocument(document: TextDocument) {
  if (config.get<boolean>('onSave', true)) {
    engine.lint(document);
  }
}

async function didCloseTextDocument(_document: TextDocument) {
  engine.dispose();
}

export async function activate(context: ExtensionContext): Promise<void> {
  context.subscriptions.push(
    workspace.onDidOpenTextDocument(didOpenTextDocument),
    workspace.onDidChangeTextDocument(didChangeTextDocument),
    workspace.onDidSaveTextDocument(didSaveTextDocument),
    workspace.onDidCloseTextDocument(didCloseTextDocument),

    events.on('BufEnter', bufnr => {
      const doc = workspace.getDocument(bufnr);
      if (!doc) {
        return;
      }

      didOpenTextDocument(doc.textDocument);
    })
  );

  workspace.documents.map((doc: Document) => {
    didOpenTextDocument(doc.textDocument);
  });
}

export function deactivate() {
  engine.dispose();
}

