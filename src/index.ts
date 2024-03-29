import {
  type DidChangeTextDocumentParams,
  type Document,
  type DocumentFilter,
  type ExtensionContext,
  type TextDocument,
  commands,
  languages,
  workspace,
} from "coc.nvim";
import { MarkdownlintEngine } from "./engine";

const documentSelector: DocumentFilter[] = [
  {
    language: "markdown",
    scheme: "file",
  },
  {
    language: "markdown",
    scheme: "untitled",
  },
];

let documentVersion = 0;
const engine = new MarkdownlintEngine();
const config = workspace.getConfiguration("markdownlint");

function didOpenTextDocument(document: TextDocument) {
  if (config.get("onOpen", true)) {
    engine.lint(document);
  }
}

async function didChangeTextDocument(params: DidChangeTextDocumentParams) {
  if (!config.get<boolean>("onChange", true)) {
    return;
  }

  if (params.textDocument.version && documentVersion !== params.textDocument.version) {
    documentVersion = params.textDocument.version;
    const { document } = await workspace.getCurrentState();
    engine.lint(document);
  }
}

async function didSaveTextDocument(document: TextDocument) {
  if (config.get<boolean>("onSave", true)) {
    engine.lint(document);
  }
}

export async function activate(context: ExtensionContext): Promise<void> {
  await engine.parseConfig();

  context.subscriptions.push(
    languages.registerCodeActionProvider(documentSelector, engine, "markdownlint"),
    commands.registerCommand(engine.fixAllCommandName, async () => {
      const { document } = await workspace.getCurrentState();
      engine.fixAll(document);
    }),

    workspace.onDidOpenTextDocument(didOpenTextDocument),
    workspace.onDidChangeTextDocument(didChangeTextDocument),
    workspace.onDidSaveTextDocument(didSaveTextDocument),
  );

  workspace.documents.map((doc: Document) => {
    didOpenTextDocument(doc.textDocument);
  });
}
