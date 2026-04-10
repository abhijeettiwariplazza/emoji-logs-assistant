const vscode = require('vscode');
const nodeEmoji = require('node-emoji');
const emojilib = require('emojilib');

const defaultEmoji = '👉';
let diagnosticCollection;
let statusBarItem;
let debounceTimer;

// ─── Extended Manual Map ──────────────────────────────────────────────────────
const manualMap = {
    'sync': '🔄', 'heartbeat': '💓', 'task': '🏢', 'sdk': '🔌',
    'success': '✅', 'fail': '❌', 'failed': '❌', 'failure': '❌',
    'error': '🚨', 'err': '🚨', 'exception': '💣',
    'warn': '⚠️', 'warning': '⚠️',
    'fg': '🔘', 'bg': '🟢', 'location': '📍',
    'restarting': '🔃', 'starting': '🚀', 'start': '🚀', 'started': '🚀',
    'stop': '⛔', 'stopped': '⛔', 'cancel': '🚫', 'cancelled': '🚫',
    'dead': '😵', 'crashed': '💥', 'crash': '💥',
    'init': '🔧', 'initialize': '🔧', 'initialized': '🔧', 'setup': '🔧',
    'connect': '🔗', 'connected': '🔗', 'connecting': '🔗',
    'disconnect': '🔌', 'disconnected': '🔌',
    'fetch': '📡', 'request': '📤', 'response': '📥',
    'upload': '⬆️', 'download': '⬇️',
    'login': '🔐', 'logout': '🔓', 'auth': '🔑', 'token': '🔑',
    'user': '👤', 'profile': '👤',
    'data': '💾', 'cache': '🗃️', 'database': '🗄️', 'db': '🗄️',
    'loading': '⏳', 'loaded': '✅', 'complete': '✅', 'done': '✅',
    'retry': '🔁', 'timeout': '⏱️', 'delay': '⏳',
    'api': '🌐', 'server': '🖥️',
    'payment': '💳', 'order': '📦', 'delivery': '🚚',
    'click': '🖱️', 'tap': '👆', 'press': '👆',
    'open': '📂', 'close': '📁', 'save': '💾',
    'send': '📤', 'receive': '📥', 'receive': '📥',
    'update': '🔄', 'updated': '🔄', 'refresh': '🔄',
    'delete': '🗑️', 'removed': '🗑️', 'clear': '🧹',
    'create': '✨', 'created': '✨', 'new': '✨',
    'found': '🔍', 'search': '🔍', 'find': '🔍',
    'config': '⚙️', 'settings': '⚙️', 'option': '⚙️',
    'test': '🧪', 'debug': '🐛', 'trace': '🔬',
    'navigate': '🗺️', 'route': '🗺️', 'redirect': '↩️',
    'mount': '🏗️', 'unmount': '🏚️', 'render': '🎨',
    'push': '📲', 'notification': '🔔', 'alert': '🚨',
    'socket': '🔌', 'stream': '🌊', 'event': '📡',
    'batch': '📦', 'queue': '🗂️', 'job': '⚙️',
    'valid': '✅', 'invalid': '❌', 'validate': '✔️',
    'permission': '🔒', 'block': '🚧', 'allow': '✅',
    'health': '❤️', 'ping': '🏓', 'pong': '🏓',
};

// ─── Log Patterns ─────────────────────────────────────────────────────────────
const logPatterns = [
    /(console\.(?:log|error|warn|info|debug)\s*\(\s*)(["'`])(.*?)\2/gi,
    /(print\s*\(\s*)(["'`])(.*?)\2/gi,
    /(println\!?\s*\(\s*)(["'`])(.*?)\2/gi,
    /(System\.out\.print(?:ln)?\s*\(\s*)(["'`])(.*?)\2/gi,
    /(fmt\.Print(?:ln|f)?\s*\(\s*)(["'`])(.*?)\2/gi,
    /(Console\.Write(?:Line)?\s*\(\s*)(["'`])(.*?)\2/gi,
    /(logger\.(?:info|debug|error|warn|fatal)\s*\(\s*)(["'`])(.*?)\2/gi,
    /(Log\.[deivw]\s*\([^,]+,\s*)(["'`])(.*?)\2/gi,
    /(puts\s+)(["'`])(.*?)\2/gi,
    /(echo\s+)(["'`])(.*?)\2/gi,
];

// Patterns where logs are typically missing
const MISSING_LOG_PATTERNS = [
    { regex: /^\s*(?:}\s*)?catch\s*(\(.*?\))?\s*\{/, label: 'catch block', emoji: '🚨', suggestion: 'error' },
    { regex: /^\s*async\s+function\s+(\w+)/, label: 'async function entry', emoji: '⚡', suggestion: 'start', extract: 1 },
    { regex: /^\s*const\s+(\w+)\s*=\s*async\s*(?:\(|function)/, label: 'async arrow fn', emoji: '⚡', suggestion: 'start', extract: 1 },
    { regex: /^\s*(?:const|let|var)\s+\w+\s*=\s*(?:await\s+)?(?:axios|fetch|http|api)\b/, label: 'API call', emoji: '📡', suggestion: 'fetch' },
    { regex: /^\s*(?:const|let|var)\s+\w+\s*=\s*await\s+\w+/, label: 'await call', emoji: '⏳', suggestion: 'loading' },
    { regex: /^\s*try\s*\{/, label: 'try block', emoji: '🔧', suggestion: 'start' },
    { regex: /^\s*(?:export\s+)?(?:default\s+)?function\s+(\w+)/, label: 'function entry', emoji: '🔧', suggestion: 'start', extract: 1 },
];

// ─── Config Helper ─────────────────────────────────────────────────────────────
function cfg(key) {
    return vscode.workspace.getConfiguration('emojiLog').get(key);
}

// ─── Emoji Picker ─────────────────────────────────────────────────────────────
function getBestEmoji(text) {
    const lowerText = text.toLowerCase();
    const words = lowerText.split(/\W+/);

    for (const word of words) {
        if (manualMap[word]) return { emoji: manualMap[word], source: `manual map ("${word}")` };
    }
    for (const word of words) {
        if (!word || word.length < 3) continue;
        const results = nodeEmoji.search(word);
        if (results && results.length > 0) {
            const match = results.find(r => r.name.toLowerCase() === word);
            const e = match ? match.emoji : results[0].emoji;
            return { emoji: e, source: `node-emoji ("${word}")` };
        }
    }
    for (const word of words) {
        if (!word || word.length < 3) continue;
        for (const [emoji, keywords] of Object.entries(emojilib)) {
            if (keywords.includes(word)) return { emoji, source: `emojilib keyword ("${word}")` };
        }
    }
    for (const [emoji, keywords] of Object.entries(emojilib)) {
        for (const keyword of keywords) {
            if (keyword.length > 3) {
                const re = new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
                if (re.test(lowerText)) return { emoji, source: `emojilib partial ("${keyword}")` };
            }
        }
    }
    return { emoji: defaultEmoji, source: 'default fallback' };
}

function bestEmojiChar(text) {
    return getBestEmoji(text).emoji;
}

// ─── Emoji Detection ──────────────────────────────────────────────────────────
const EMOJI_REGEX = /^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F1E6}-\u{1F1FF}\u{25AA}-\u{25FE}]/u;

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
                if (!EMOJI_REGEX.test(content.trim()) && content.trim().length > 0) {
                    const quotePos = match.index + match[1].length;
                    edits.push(vscode.TextEdit.insert(
                        new vscode.Position(i, quotePos + 1),
                        bestEmojiChar(content) + ' '
                    ));
                }
            }
        }
    }
    return edits;
}

function applyEdits(editor, edits) {
    return editor.edit(eb => edits.forEach(e => eb.insert(e.range.start, e.newText)));
}

// ─── Status Bar ───────────────────────────────────────────────────────────────
function updateStatusBar(document) {
    if (!statusBarItem || !document) return;
    const edits = getEmojiEdits(document);
    if (edits.length > 0) {
        statusBarItem.text = `$(smiley) +${edits.length} emoji logs`;
        statusBarItem.tooltip = `Click to add emojis to ${edits.length} log statements`;
        statusBarItem.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    } else {
        statusBarItem.text = `$(smiley) Emoji Logs ✓`;
        statusBarItem.tooltip = 'All logs have emojis!';
        statusBarItem.backgroundColor = undefined;
    }
    statusBarItem.show();
}

// ─── Missing Log Diagnostics ──────────────────────────────────────────────────
function updateMissingLogDiagnostics(document) {
    if (!diagnosticCollection || !cfg('suggestMissingLogs')) {
        diagnosticCollection && diagnosticCollection.set(document.uri, []);
        return;
    }
    const supported = ['javascript', 'typescript', 'javascriptreact', 'typescriptreact', 'python', 'java', 'go'];
    if (!supported.includes(document.languageId)) return;

    const diagnostics = [];
    for (let i = 0; i < document.lineCount; i++) {
        const lineText = document.lineAt(i).text;
        for (const p of MISSING_LOG_PATTERNS) {
            const m = lineText.match(p.regex);
            if (!m) continue;
            let hasLog = false;
            for (let j = i + 1; j < Math.min(i + 5, document.lineCount); j++) {
                if (/console\.|print\(|println|logger\.|Log\.|fmt\.Print/.test(document.lineAt(j).text)) {
                    hasLog = true; break;
                }
            }
            if (hasLog) continue;
            const fnName = p.extract && m[p.extract] ? m[p.extract] : null;
            const suggestedLog = fnName
                ? `console.log("${p.emoji} ${fnName} called");`
                : `console.log("${p.emoji} ${p.label}");`;
            const range = new vscode.Range(i, 0, i, lineText.length);
            const diag = new vscode.Diagnostic(range, `💡 Missing log: ${p.label}`, vscode.DiagnosticSeverity.Hint);
            diag.code = 'emoji-log-missing';
            diag.source = 'Emoji Log Assistant';
            diag._suggestedLog = suggestedLog;
            diag._line = i;
            diagnostics.push(diag);
            break;
        }
    }
    diagnosticCollection.set(document.uri, diagnostics);
}

// ─── Hover Provider ───────────────────────────────────────────────────────────
class EmojiLogHoverProvider {
    provideHover(document, position) {
        if (!cfg('showHoverInfo')) return;
        const lineText = document.lineAt(position.line).text;
        for (const pattern of logPatterns) {
            pattern.lastIndex = 0;
            let match;
            while ((match = pattern.exec(lineText)) !== null) {
                const content = match[3] || '';
                const startChar = match.index;
                const endChar = match.index + match[0].length;
                if (position.character >= startChar && position.character <= endChar && content.trim()) {
                    const { emoji, source } = getBestEmoji(content.replace(/^[\u{1F0000}-\u{1FFFF} ]/u, '').trim());
                    const md = new vscode.MarkdownString();
                    md.appendMarkdown(`**Emoji Log Assistant** 🔍\n\n`);
                    md.appendMarkdown(`- **Emoji:** ${emoji}\n`);
                    md.appendMarkdown(`- **Matched via:** ${source}\n`);
                    md.appendMarkdown(`- **Log text:** \`${content.substring(0, 60)}\``);
                    return new vscode.Hover(md);
                }
            }
        }
    }
}

// ─── Inline Completion Provider ───────────────────────────────────────────────
class EmojiLogInlineCompletionProvider {
    provideInlineCompletionItems(document, position) {
        if (!cfg('inlineEmojiSuggestions')) return;
        const lineText = document.lineAt(position.line).text.substring(0, position.character);
        // Detect: console.log(" ... being typed
        const m = lineText.match(/(console\.(?:log|error|warn|info|debug)\s*\(\s*["'`])(.*)$/i);
        if (!m || m[2].trim().length < 2) return;
        const typed = m[2];
        if (EMOJI_REGEX.test(typed.trim())) return; // already has emoji
        const { emoji } = getBestEmoji(typed);
        const item = new vscode.InlineCompletionItem(emoji + ' ' + typed);
        item.range = new vscode.Range(position.line, position.character - typed.length, position.line, position.character);
        return [item];
    }
}

// ─── Code Action Provider ────────────────────────────────────────────────────
class EmojiLogCodeActionProvider {
    provideCodeActions(document, range) {
        const diags = (diagnosticCollection.get(document.uri) || []).filter(
            d => d.range.intersection(range) && d._suggestedLog
        );
        return diags.map(diag => {
            const action = new vscode.CodeAction(`${diag._suggestedLog}`, vscode.CodeActionKind.QuickFix);
            action.command = { command: 'emoji-log.insertLog', title: 'Insert Log', arguments: [{ line: diag._line + 1, text: diag._suggestedLog, document }] };
            action.diagnostics = [diag];
            action.isPreferred = true;
            return action;
        });
    }
}

// ─── Workspace Scan ───────────────────────────────────────────────────────────
async function processWorkspace() {
    const exclude = '{**/node_modules/**,**/build/**,**/dist/**,**/out/**,**/.git/**,**/.vscode/**,**/.next/**,**/target/**,**/android/**,**/ios/**,**/.expo/**,**/coverage/**}';
    const files = await vscode.workspace.findFiles('**/*.{js,ts,jsx,tsx,py,java,cpp,c,cs,go,rb,php,sh}', exclude);
    let total = 0, updated = 0;

    await vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: '🔍 Emoji Log: Scanning workspace...',
        cancellable: false
    }, async (progress) => {
        for (let i = 0; i < files.length; i++) {
            const doc = await vscode.workspace.openTextDocument(files[i]);
            const edits = getEmojiEdits(doc);
            if (edits.length > 0) {
                const we = new vscode.WorkspaceEdit();
                edits.forEach(e => we.insert(files[i], e.range.start, e.newText));
                await vscode.workspace.applyEdit(we);
                total += edits.length;
                updated++;
            }
            progress.report({ increment: 100 / files.length, message: `${i + 1}/${files.length} files` });
        }
        vscode.window.showInformationMessage(
            total > 0
                ? `🎉 Done! Added ${total} emojis across ${updated} files.`
                : '✅ All logs already have emojis!'
        );
    });
}

// ─── ACTIVATE ─────────────────────────────────────────────────────────────────
function activate(context) {
    console.log('🚀 Emoji Log Assistant activated!');

    // Diagnostic collection
    diagnosticCollection = vscode.languages.createDiagnosticCollection('emoji-log-missing');
    context.subscriptions.push(diagnosticCollection);

    // Status bar
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
    statusBarItem.command = 'emoji-log.addEmojis';
    context.subscriptions.push(statusBarItem);

    // ── One-time Workspace Prompt ────────────────────────────────────────────
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

    // ── Real-time: Typing + AI Paste ─────────────────────────────────────────
    let typingListener = vscode.workspace.onDidChangeTextDocument(event => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || event.document !== editor.document) return;
        const last = event.contentChanges[event.contentChanges.length - 1];
        if (!last) return;

        const isAIPaste = last.text.split('\n').length > 5;
        const isLine = last.text.includes('\n') || last.text.includes(';') || last.text.includes(')');

        if (cfg('autoEmojiOnType') && (isAIPaste || isLine)) {
            const edits = getEmojiEdits(event.document);
            if (edits.length > 0) applyEdits(editor, edits);
        }

        // Debounced diagnostics + status bar
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            updateMissingLogDiagnostics(event.document);
            updateStatusBar(event.document);
        }, 600);
    });

    // ── File Open: diagnostics + status bar ─────────────────────────────────
    let openListener = vscode.window.onDidChangeActiveTextEditor(editor => {
        if (!editor) return;
        updateMissingLogDiagnostics(editor.document);
        updateStatusBar(editor.document);
    });
    if (vscode.window.activeTextEditor) {
        updateMissingLogDiagnostics(vscode.window.activeTextEditor.document);
        updateStatusBar(vscode.window.activeTextEditor.document);
    }

    // ── Auto-format on Save ──────────────────────────────────────────────────
    let saveListener = vscode.workspace.onWillSaveTextDocument(event => {
        if (!cfg('formatOnSave')) return;
        const edits = getEmojiEdits(event.document);
        if (edits.length > 0) event.waitUntil(Promise.resolve(edits));
    });

    // ── COMMANDS ─────────────────────────────────────────────────────────────

    // 1. Add emojis to current file
    let addEmojisCmd = vscode.commands.registerCommand('emoji-log.addEmojis', () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        const edits = getEmojiEdits(editor.document);
        if (edits.length > 0) {
            applyEdits(editor, edits).then(() => {
                vscode.window.showInformationMessage(`✅ Added ${edits.length} emojis!`);
                updateStatusBar(editor.document);
            });
        } else {
            vscode.window.showInformationMessage('All logs already have emojis!');
        }
    });

    // 2. Scan entire workspace
    let scanCmd = vscode.commands.registerCommand('emoji-log.scanWorkspace', processWorkspace);

    // 3. Insert suggested log (Quick Fix)
    let insertLogCmd = vscode.commands.registerCommand('emoji-log.insertLog', async (args) => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || !args) return;
        const document = args.document || editor.document;
        const insertLine = Math.min(args.line, document.lineCount);
        const indent = (document.lineAt(Math.max(insertLine - 1, 0)).text.match(/^(\s*)/) || ['', ''])[1] + '  ';
        await editor.edit(eb => eb.insert(new vscode.Position(insertLine, 0), `${indent}${args.text}\n`));
    });

    // 4. Wrap selected variable/text with a log
    let wrapLogCmd = vscode.commands.registerCommand('emoji-log.wrapWithLog', () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        const selection = editor.selection;
        const selectedText = editor.document.getText(selection);
        if (!selectedText.trim()) {
            vscode.window.showWarningMessage('Select a variable or expression first!');
            return;
        }
        const { emoji } = getBestEmoji(selectedText);
        const logStatement = `console.log("${emoji} ${selectedText}:", ${selectedText});`;
        editor.edit(eb => eb.replace(selection, logStatement));
    });

    // 5. Pick emoji interactively for a log
    let pickEmojiCmd = vscode.commands.registerCommand('emoji-log.pickEmoji', async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor) return;
        const position = editor.selection.active;
        const lineText = editor.document.lineAt(position.line).text;
        // Find log on current line
        let found = false;
        for (const pattern of logPatterns) {
            pattern.lastIndex = 0;
            const match = pattern.exec(lineText);
            if (match) {
                const content = match[3] || '';
                // Show top emoji candidates
                const words = content.toLowerCase().split(/\W+/).filter(w => w.length >= 3);
                const candidates = new Map();
                for (const word of words) {
                    const results = nodeEmoji.search(word);
                    results.slice(0, 3).forEach(r => candidates.set(r.emoji, r.name));
                    if (manualMap[word]) candidates.set(manualMap[word], word);
                }
                const items = [...candidates.entries()].map(([e, n]) => ({ label: `${e} ${n}`, emoji: e }));
                if (items.length === 0) {
                    vscode.window.showInformationMessage('No matching emojis found for this log.');
                    return;
                }
                const picked = await vscode.window.showQuickPick(items, { placeHolder: 'Choose an emoji for this log' });
                if (!picked) return;
                // Replace existing emoji or insert new one
                const quotePos = match.index + match[1].length + 1; // after opening quote
                const currentContent = match[3];
                const range = new vscode.Range(position.line, quotePos, position.line, quotePos + currentContent.length);
                const cleaned = currentContent.replace(/^[\u{1F0000}-\u{1FFFF}\u{2600}-\u{27BF}] ?/u, '').trimStart();
                editor.edit(eb => eb.replace(range, `${picked.emoji} ${cleaned}`));
                found = true;
                break;
            }
        }
        if (!found) vscode.window.showWarningMessage('No log statement found on current line.');
    });

    // 6. Reset workspace scan prompt
    let resetPromptCmd = vscode.commands.registerCommand('emoji-log.resetScanPrompt', async () => {
        await context.workspaceState.update('hasPromptedEmojiScan', false);
        vscode.window.showInformationMessage('✅ Scan prompt reset! Reopen your workspace to see it again.');
    });

    // ── Providers ────────────────────────────────────────────────────────────
    const docSelector = [
        { scheme: 'file', language: 'javascript' },
        { scheme: 'file', language: 'typescript' },
        { scheme: 'file', language: 'javascriptreact' },
        { scheme: 'file', language: 'typescriptreact' },
        { scheme: 'file', language: 'python' },
        { scheme: 'file', language: 'java' },
        { scheme: 'file', language: 'go' },
        { scheme: 'file', language: 'ruby' },
        { scheme: 'file', language: 'csharp' },
    ];

    let hoverProvider = vscode.languages.registerHoverProvider(docSelector, new EmojiLogHoverProvider());
    let inlineProvider = vscode.languages.registerInlineCompletionItemProvider(docSelector, new EmojiLogInlineCompletionProvider());
    let codeActionProvider = vscode.languages.registerCodeActionsProvider(
        docSelector,
        new EmojiLogCodeActionProvider(),
        { providedCodeActionKinds: [vscode.CodeActionKind.QuickFix] }
    );

    context.subscriptions.push(
        typingListener, openListener, saveListener,
        addEmojisCmd, scanCmd, insertLogCmd, wrapLogCmd, pickEmojiCmd, resetPromptCmd,
        hoverProvider, inlineProvider, codeActionProvider
    );
}

function deactivate() {
    if (diagnosticCollection) diagnosticCollection.dispose();
    if (statusBarItem) statusBarItem.dispose();
    clearTimeout(debounceTimer);
}

module.exports = { activate, deactivate };
