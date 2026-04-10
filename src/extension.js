const vscode = require('vscode');
const nodeEmoji = require('node-emoji');
const emojilib = require('emojilib');

const defaultEmoji = '👉';

// ─── Manual Map ───────────────────────────────────────────────────────────────
const manualMap = {
    'sync': '🔄', 'heartbeat': '💓', 'task': '🏢', 'sdk': '🔌',
    'success': '✅', 'fail': '❌', 'failed': '❌', 'failure': '❌',
    'error': '🚨', 'warn': '⚠️', 'warning': '⚠️',
    'fg': '🔘', 'bg': '🟢', 'location': '📍',
    'restarting': '🔃', 'starting': '🚀', 'start': '🚀',
    'dead': '😵', 'crashed': '💥', 'crash': '💥',
    'init': '🔧', 'initialize': '🔧', 'setup': '🔧',
    'connect': '🔗', 'connected': '🔗', 'disconnect': '🔌',
    'fetch': '📡', 'request': '📤', 'response': '📥',
    'upload': '⬆️', 'download': '⬇️',
    'login': '🔐', 'logout': '🔓', 'auth': '🔑',
    'user': '👤', 'data': '💾', 'cache': '🗃️',
    'loading': '⏳', 'loaded': '✅', 'complete': '✅',
    'stop': '⛔', 'stopped': '⛔', 'cancel': '🚫',
    'retry': '🔁', 'timeout': '⏱️',
    'api': '🌐', 'server': '🖥️', 'database': '🗄️',
    'payment': '💳', 'order': '📦', 'delivery': '🚚',
};

// ─── Log Patterns ─────────────────────────────────────────────────────────────
const logPatterns = [
    /(console\.(?:log|error|warn|info|debug)\s*\(\s*)(["'`])(.*?)\2/gi,
    /(print\s*\(\s*)(["'`])(.*?)\2/gi,
    /(println\!?\s*\(\s*)(["'`])(.*?)\2/gi,
    /(System\.out\.print(?:ln)?\s*\(\s*)(["'`])(.*?)\2/gi,
    /(fmt\.Print(?:ln|f)?\s*\(\s*)(["'`])(.*?)\2/gi,
    /(Console\.Write(?:Line)?\s*\(\s*)(["'`])(.*?)\2/gi,
    /(logger\.(?:info|debug|error|warn)\s*\(\s*)(["'`])(.*?)\2/gi,
    /(Log\.[deivw]\s*\([^,]+,\s*)(["'`])(.*?)\2/gi,
    /(puts\s+)(["'`])(.*?)\2/gi,
    /(echo\s+)(["'`])(.*?)\2/gi,
];

// Patterns that suggest a log is missing (catch, async fn, api calls)
const MISSING_LOG_PATTERNS = [
    { regex: /^\s*catch\s*(\(.*?\))?\s*\{/, label: '🚨 catch block', suggestion: 'error' },
    { regex: /^\s*}\s*catch\s*(\(.*?\))?\s*\{/, label: '🚨 catch block', suggestion: 'error' },
    { regex: /^\s*async\s+function\s+(\w+)/, label: '⚡ async function entry', suggestion: 'start', extract: 1 },
    { regex: /^\s*const\s+(\w+)\s*=\s*async\s*\(/, label: '⚡ async arrow fn entry', suggestion: 'start', extract: 1 },
    { regex: /^\s*(await\s+)?fetch\s*\(/, label: '📡 fetch/API call', suggestion: 'fetch' },
    { regex: /^\s*(const|let|var)\s+\w+\s*=\s*(await\s+)?(axios|fetch|http)\b/, label: '📡 API call', suggestion: 'fetch' },
];

// Diagnostic collection for missing log hints
let diagnosticCollection;

// ─── Emoji Picker ────────────────────────────────────────────────────────────
function getBestEmoji(text) {
    const lowerText = text.toLowerCase();
    const words = lowerText.split(/\W+/);

    for (const word of words) {
        if (manualMap[word]) return manualMap[word];
    }
    for (const word of words) {
        if (!word || word.length < 3) continue;
        const results = nodeEmoji.search(word);
        if (results && results.length > 0) {
            const match = results.find(r => r.name.toLowerCase() === word);
            return match ? match.emoji : results[0].emoji;
        }
    }
    for (const word of words) {
        if (!word || word.length < 3) continue;
        for (const [emoji, keywords] of Object.entries(emojilib)) {
            if (keywords.includes(word)) return emoji;
        }
    }
    for (const [emoji, keywords] of Object.entries(emojilib)) {
        for (const keyword of keywords) {
            if (keyword.length > 3) {
                const regex = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
                if (regex.test(lowerText)) return emoji;
            }
        }
    }
    return defaultEmoji;
}

// ─── Emoji Edits Calculator ───────────────────────────────────────────────────
function getEmojiEdits(document) {
    const edits = [];
    for (let i = 0; i < document.lineCount; i++) {
        const lineText = document.lineAt(i).text;
        for (const pattern of logPatterns) {
            pattern.lastIndex = 0;
            let match;
            while ((match = pattern.exec(lineText)) !== null) {
                const content = match[3] || '';
                const hasEmoji = /^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F1E6}-\u{1F1FF}\u{25AA}-\u{25FE}]/u.test(content.trim());
                if (!hasEmoji && content.trim().length > 0) {
                    const quotePos = match.index + match[1].length;
                    edits.push(vscode.TextEdit.insert(new vscode.Position(i, quotePos + 1), getBestEmoji(content) + ' '));
                }
            }
        }
    }
    return edits;
}

// ─── Apply Edits ─────────────────────────────────────────────────────────────
function applyEdits(editor, edits) {
    return editor.edit(eb => edits.forEach(e => eb.insert(e.range.start, e.newText)));
}

// ─── Missing Log Diagnostics ─────────────────────────────────────────────────
function updateMissingLogDiagnostics(document) {
    if (!diagnosticCollection) return;

    // Only run on supported source files
    const supportedLangs = ['javascript', 'typescript', 'python', 'java', 'go', 'csharp', 'ruby', 'php', 'rust'];
    if (!supportedLangs.includes(document.languageId)) {
        diagnosticCollection.set(document.uri, []);
        return;
    }

    const diagnostics = [];

    for (let i = 0; i < document.lineCount; i++) {
        const lineText = document.lineAt(i).text;

        for (const p of MISSING_LOG_PATTERNS) {
            const m = lineText.match(p.regex);
            if (!m) continue;

            // Check next 3 lines: if there's already a log, skip
            let hasLog = false;
            for (let j = i + 1; j < Math.min(i + 4, document.lineCount); j++) {
                const nextLine = document.lineAt(j).text;
                if (/console\.|print\(|println|logger\.|Log\.|fmt\.Print/.test(nextLine)) {
                    hasLog = true;
                    break;
                }
            }
            if (hasLog) continue;

            // Build the suggestion label
            const fnName = p.extract && m[p.extract] ? m[p.extract] : null;
            const emoji = manualMap[p.suggestion] || '👉';
            const suggestedLog = fnName
                ? `console.log("${emoji} ${fnName} called");`
                : `console.log("${emoji} ${p.label}");`;

            const range = new vscode.Range(i, 0, i, lineText.length);
            const diagnostic = new vscode.Diagnostic(
                range,
                `💡 Missing log: ${p.label} — Add a log statement here.`,
                vscode.DiagnosticSeverity.Hint
            );
            diagnostic.code = {
                value: 'emoji-log-missing',
                target: vscode.Uri.parse(`command:emoji-log.insertLog?${encodeURIComponent(JSON.stringify({ line: i + 1, text: suggestedLog }))}`)
            };
            diagnostic.source = 'Emoji Log Assistant';
            // Store suggestion for quick-fix
            diagnostic._suggestedLog = suggestedLog;
            diagnostic._line = i;

            diagnostics.push(diagnostic);
            break; // Only one diagnostic per line
        }
    }

    diagnosticCollection.set(document.uri, diagnostics);
}

// ─── Missing Log Quick Fix Provider ──────────────────────────────────────────
class EmojiLogCodeActionProvider {
    provideCodeActions(document, range) {
        const diags = diagnosticCollection.get(document.uri) || [];
        const actions = [];

        for (const diag of diags) {
            if (!diag.range.intersection(range)) continue;
            if (!diag._suggestedLog) continue;

            const action = new vscode.CodeAction(
                `💡 Insert: ${diag._suggestedLog}`,
                vscode.CodeActionKind.QuickFix
            );
            action.command = {
                command: 'emoji-log.insertLog',
                title: 'Insert Log',
                arguments: [{ line: diag._line + 1, text: diag._suggestedLog, document }]
            };
            action.diagnostics = [diag];
            actions.push(action);
        }
        return actions;
    }
}

// ─── ACTIVATE ────────────────────────────────────────────────────────────────
/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    console.log('🚀 Emoji Log Assistant activated!');

    // Initialize diagnostics
    diagnosticCollection = vscode.languages.createDiagnosticCollection('emoji-log-missing');
    context.subscriptions.push(diagnosticCollection);

    // ── 1. One-time Project Scan Prompt ──────────────────────────────────────
    const hasPrompted = context.workspaceState.get('hasPromptedEmojiScan', false);
    if (!hasPrompted && vscode.workspace.workspaceFolders) {
        vscode.window.showInformationMessage(
            '🎉 Emoji Log Assistant: Add emojis to all log statements in this project?',
            'Yes, do it!', 'No, thanks'
        ).then(sel => {
            if (sel === 'Yes, do it!') processWorkspace();
            if (sel) context.workspaceState.update('hasPromptedEmojiScan', true);
        });
    }

    // ── 2. Real-time: Emoji on typing & AI paste detection ───────────────────
    let typingListener = vscode.workspace.onDidChangeTextDocument(event => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || event.document !== editor.document) return;

        const changes = event.contentChanges;
        const lastChange = changes[changes.length - 1];
        if (!lastChange) return;

        const isAIPaste = lastChange.text.split('\n').length > 5; // Large paste = AI-generated
        const isCompletedLine = lastChange.text.includes('\n') || lastChange.text.includes(';') || lastChange.text.includes(')');

        if (isAIPaste || isCompletedLine) {
            const edits = getEmojiEdits(event.document);
            if (edits.length > 0) applyEdits(editor, edits);
        }

        // Update missing log hints in real-time
        updateMissingLogDiagnostics(event.document);
    });

    // ── 3. Missing logs on file open ─────────────────────────────────────────
    if (vscode.window.activeTextEditor) {
        updateMissingLogDiagnostics(vscode.window.activeTextEditor.document);
    }
    let openListener = vscode.window.onDidChangeActiveTextEditor(editor => {
        if (editor) updateMissingLogDiagnostics(editor.document);
    });

    // ── 4. Auto-format on Save ────────────────────────────────────────────────
    let saveListener = vscode.workspace.onWillSaveTextDocument(event => {
        const edits = getEmojiEdits(event.document);
        if (edits.length > 0) event.waitUntil(Promise.resolve(edits));
    });

    // ── 5. Manual Command: Add Emojis ────────────────────────────────────────
    let addEmojisCmd = vscode.commands.registerCommand('emoji-log.addEmojis', () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return vscode.window.showInformationMessage('No active editor found.');
        const edits = getEmojiEdits(editor.document);
        if (edits.length > 0) {
            applyEdits(editor, edits).then(() =>
                vscode.window.showInformationMessage(`✅ Added ${edits.length} emojis successfully!`)
            );
        } else {
            vscode.window.showInformationMessage('No new logs to process.');
        }
    });

    // ── 6. Quick Fix Command: Insert suggested log ────────────────────────────
    let insertLogCmd = vscode.commands.registerCommand('emoji-log.insertLog', async (args) => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || !args) return;

        const line = args.line; // line AFTER the trigger line (1-indexed)
        const text = args.text;
        const document = args.document || editor.document;
        const insertLine = Math.min(line, document.lineCount);
        const indentMatch = document.lineAt(insertLine > 0 ? insertLine - 1 : 0).text.match(/^(\s*)/);
        const indent = indentMatch ? indentMatch[1] + '  ' : '  ';

        await editor.edit(eb => {
            eb.insert(new vscode.Position(insertLine, 0), `${indent}${text}\n`);
        });
    });

    // ── 7. Register Quick Fix Provider ───────────────────────────────────────
    const supportedDocSelector = [
        { scheme: 'file', language: 'javascript' },
        { scheme: 'file', language: 'typescript' },
        { scheme: 'file', language: 'javascriptreact' },
        { scheme: 'file', language: 'typescriptreact' },
        { scheme: 'file', language: 'python' },
        { scheme: 'file', language: 'java' },
        { scheme: 'file', language: 'go' },
    ];
    let codeActionProvider = vscode.languages.registerCodeActionsProvider(
        supportedDocSelector,
        new EmojiLogCodeActionProvider(),
        { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }
    );

    context.subscriptions.push(
        addEmojisCmd, insertLogCmd, saveListener,
        typingListener, openListener, codeActionProvider
    );
}

// ─── Workspace-wide Scan ──────────────────────────────────────────────────────
async function processWorkspace() {
    const excludePattern = '{**/node_modules/**,**/build/**,**/dist/**,**/out/**,**/.git/**,**/.vscode/**,**/.next/**,**/target/**,**/android/**,**/ios/**}';
    const files = await vscode.workspace.findFiles('**/*.{js,ts,jsx,tsx,py,java,cpp,c,cs,go,rb,php,sh}', excludePattern);
    let totalEdits = 0, filesUpdated = 0;

    vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: '🔍 Emoji Log: Scanning workspace...',
        cancellable: false
    }, async (progress) => {
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const document = await vscode.workspace.openTextDocument(file);
            const edits = getEmojiEdits(document);
            if (edits.length > 0) {
                const we = new vscode.WorkspaceEdit();
                edits.forEach(e => we.insert(file, e.range.start, e.newText));
                await vscode.workspace.applyEdit(we);
                totalEdits += edits.length;
                filesUpdated++;
            }
            progress.report({ increment: 100 / files.length, message: `${i + 1}/${files.length} files` });
        }
        vscode.window.showInformationMessage(
            totalEdits > 0
                ? `🎉 Done! Added ${totalEdits} emojis across ${filesUpdated} files.`
                : '✅ All logs already have emojis!'
        );
    });
}

function deactivate() {
    if (diagnosticCollection) diagnosticCollection.dispose();
}

module.exports = { activate, deactivate };
