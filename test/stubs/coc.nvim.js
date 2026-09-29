// Minimal coc.nvim stub for tests: plain-object creators mirroring
// vscode-languageserver-protocol, plus no-op factories so engine and index
// modules can be loaded outside a coc.nvim process. Register/event calls are
// recorded on globalThis.__cocTestHooks so activation tests can assert the
// wiring in src/index.ts.
const hooks = (globalThis.__cocTestHooks ??= { registrations: [], handlers: {} });

const SymbolKind = {
  File: 1,
  Module: 2,
  Namespace: 3,
  Package: 4,
  Class: 5,
  Method: 6,
  Property: 7,
  Field: 8,
  Constructor: 9,
  Enum: 10,
  Interface: 11,
  Function: 12,
  Variable: 13,
  Constant: 14,
  String: 15,
  Number: 16,
  Boolean: 17,
  Array: 18,
  Object: 19,
  Key: 20,
  Null: 21,
  EnumMember: 22,
  Struct: 23,
  Event: 24,
  Operator: 25,
  TypeParameter: 26,
};

const Position = {
  create: (line, character) => ({ line, character }),
};

const Range = {
  create: (start, end) => ({ start, end }),
};

const DocumentSymbol = {
  create: (name, detail, kind, range, selectionRange, children) => ({
    name,
    detail,
    kind,
    range,
    selectionRange,
    children,
  }),
};

const Diagnostic = {
  create: (range, message, severity, source) => ({ range, message, severity, source }),
};

const DiagnosticSeverity = { Error: 1, Warning: 2, Information: 3, Hint: 4 };

const CodeActionKind = { SourceFixAll: "source.fixAll" };

const TextEdit = {
  replace: (range, newText) => ({ range, newText }),
  del: (range) => ({ range }),
};

const disposable = () => ({ dispose() {} });

const languages = {
  createDiagnosticCollection: () => ({ set() {}, dispose() {} }),
  registerCodeActionProvider: (...args) => {
    hooks.registrations.push({ type: "codeAction", args });
    return disposable();
  },
  registerDocumentSymbolProvider: (...args) => {
    hooks.registrations.push({ type: "documentSymbol", args });
    return disposable();
  },
};

const commands = {
  registerCommand: (name, callback) => {
    hooks.registrations.push({ type: "command", args: [name, callback] });
    return disposable();
  },
};

const onDidHandler = (name) => (listener) => {
  hooks.handlers[name] = listener;
  return disposable();
};

const workspace = {
  // Nonexistent by design so parseConfig()'s fs.existsSync probes never hit
  // real files, keeping tests hermetic
  root: "/nonexistent-coc-markdownlint-test-root",
  documents: [],
  getConfiguration: () => ({ get: (_name, defaultValue) => defaultValue }),
  onDidOpenTextDocument: onDidHandler("open"),
  onDidChangeTextDocument: onDidHandler("change"),
  onDidSaveTextDocument: onDidHandler("save"),
  onDidCloseTextDocument: onDidHandler("close"),
};

const window = {
  createOutputChannel: () => ({ appendLine() {}, dispose() {} }),
};

module.exports = {
  SymbolKind,
  Position,
  Range,
  DocumentSymbol,
  Diagnostic,
  DiagnosticSeverity,
  CodeActionKind,
  TextEdit,
  languages,
  commands,
  workspace,
  window,
};
