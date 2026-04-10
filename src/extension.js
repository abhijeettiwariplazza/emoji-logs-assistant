const vscode = require('vscode');

const nodeEmoji = require('node-emoji');
const emojilib = require('emojilib');

const defaultEmoji = '👉';

// Manual map for common technical terms in logs to ensure consistency
const manualMap = {
    'sync': '🔄',
    'heartbeat': '💓',
    'task': '🏢',
    'sdk': '🔌',
    'success': '✅',
    'fail': '❌',
    'error': '🚨',
    'warn': '⚠️',
    'fg': '🔘',
    'bg': '🟢',
    'location': '📍',
    'restarting': '🔃',
    'starting': '🚀',
    'dead': '😵',
    'crashed': '💥'
};

function getBestEmoji(text) {
    const lowerText = text.toLowerCase();
    const words = lowerText.split(/\W+/);
    
    // 1. Check Manual Map first (highest priority for technical logs)
    for (const word of words) {
        if (manualMap[word]) return manualMap[word];
    }

    // 2. Try node-emoji (searches literal names)
    for (const word of words) {
        if (!word || word.length < 3) continue;
        const results = nodeEmoji.search(word);
        if (results && results.length > 0) {
            // Check for direct match to be more accurate
            const match = results.find(r => r.name.toLowerCase() === word);
            if (match) return match.emoji;
            // Otherwise use the first result
            return results[0].emoji;
        }
    }

    // 3. Try emojilib (searches semantic keywords)
    for (const word of words) {
        if (!word || word.length < 3) continue;
        for (const [emoji, keywords] of Object.entries(emojilib)) {
            if (keywords.includes(word)) {
                return emoji;
            }
        }
    }

    // Fallback: check whole-word partial matches (avoids "date" inside "update")
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

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
    console.log('Emoji Log Assistant is now active!');

    // 1. One-time Project Prompt on Startup
    const hasPrompted = context.workspaceState.get('hasPromptedEmojiScan', false);
    if (!hasPrompted && vscode.workspace.workspaceFolders) {
        vscode.window.showInformationMessage(
            'Emoji Log Assistant: Would you like to scan and add emojis to all log statements in this project?',
            'Yes, do it!',
            'No, thanks'
        ).then(selection => {
            if (selection === 'Yes, do it!') {
                processWorkspace();
                context.workspaceState.update('hasPromptedEmojiScan', true);
            } else if (selection === 'No, thanks') {
                context.workspaceState.update('hasPromptedEmojiScan', true);
            }
        });
    }

    // 2. Real-time Emoji Addition (While Typing)
    let typingListener = vscode.workspace.onDidChangeTextDocument(event => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || event.document !== editor.document) return;

        // We only process if the change looks like a completed log or a newline
        const changes = event.contentChanges;
        const lastChange = changes[changes.length - 1];
        
        if (lastChange && (lastChange.text.includes('\n') || lastChange.text.includes(';') || lastChange.text.includes(')'))) {
            const document = event.document;
            const edits = getEmojiEdits(document);
            if (edits.length > 0) {
                applyEdits(editor, edits);
            }
        }
    });

    // 3. Command Registration (Manual Trigger)
    let commandDisposable = vscode.commands.registerCommand('emoji-log.addEmojis', function () {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showInformationMessage('No active editor found.');
            return;
        }
        const edits = getEmojiEdits(editor.document);
        if (edits.length > 0) {
            applyEdits(editor, edits).then(() => {
                vscode.window.showInformationMessage(`Added ${edits.length} emojis successfully!`);
            });
        } else {
            vscode.window.showInformationMessage('No new logs to process.');
        }
    });

    // 4. Auto-format on Save Listener
    let saveListener = vscode.workspace.onWillSaveTextDocument((event) => {
        const edits = getEmojiEdits(event.document);
        if (edits.length > 0) {
            event.waitUntil(Promise.resolve(edits));
        }
    });

    context.subscriptions.push(commandDisposable, saveListener, typingListener);
}

/**
 * Applies a list of TextEdits to an editor
 */
function applyEdits(editor, edits) {
    return editor.edit(editBuilder => {
        edits.forEach(edit => {
            editBuilder.insert(edit.range.start, edit.newText);
        });
    });
}

/**
 * Scans the entire workspace for supported files and adds emojis
 */
async function processWorkspace() {
    const files = await vscode.workspace.findFiles('**/*.{js,ts,py,java,cpp,c,cs,go,rb,php,sh}', '**/node_modules/**');
    let totalEdits = 0;
    let filesUpdated = 0;

    vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: "Processing workspace logs...",
        cancellable: false
    }, async (progress) => {
        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const document = await vscode.workspace.openTextDocument(file);
            const edits = getEmojiEdits(document);
            
            if (edits.length > 0) {
                const workspaceEdit = new vscode.WorkspaceEdit();
                edits.forEach(edit => workspaceEdit.insert(file, edit.range.start, edit.newText));
                await vscode.workspace.applyEdit(workspaceEdit);
                totalEdits += edits.length;
                filesUpdated++;
            }
            progress.report({ increment: (100 / files.length), message: `Scanned ${i+1}/${files.length} files` });
        }
        
        if (totalEdits > 0) {
            vscode.window.showInformationMessage(`Project Scan Complete: Added ${totalEdits} emojis across ${filesUpdated} files!`);
        } else {
            vscode.window.showInformationMessage('Project Scan Complete: No new logs found.');
        }
    });
}

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
    /(echo\s+)(["'`])(.*?)\2/gi
];

/**
 * Calculates needed emoji insertions for a document
 * @param {vscode.TextDocument} document 
 * @returns {vscode.TextEdit[]}
 */
function getEmojiEdits(document) {
    const edits = [];
    for (let i = 0; i < document.lineCount; i++) {
        const line = document.lineAt(i);
        const lineText = line.text;

        for (const pattern of logPatterns) {
            pattern.lastIndex = 0;
            let match;
            while ((match = pattern.exec(lineText)) !== null) {
                const originalStringContext = match[3] || "";
                
                // Check if it already has an emoji at start
                const hasEmojiAtStart = /^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F1E6}-\u{1F1FF}\u{25AA}-\u{25FE}]/u.test(originalStringContext.trim());
                
                if (!hasEmojiAtStart && originalStringContext.trim().length > 0) {
                    const emoji = getBestEmoji(originalStringContext);
                    const prefix = match[1];
                    const prefixLength = prefix.length;
                    const quotePos = match.index + prefixLength; 
                    const insertPos = new vscode.Position(i, quotePos + 1);
                    
                    edits.push(vscode.TextEdit.insert(insertPos, emoji + ' '));
                }
            }
        }
    }
    return edits;
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
}
