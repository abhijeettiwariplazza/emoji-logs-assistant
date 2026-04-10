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
    let disposable = vscode.commands.registerCommand('emoji-log.addEmojis', function () {
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
            vscode.window.showInformationMessage('No active editor found.');
            return;
        }

        const document = editor.document;
        
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

        let editsCount = 0;

        editor.edit(editBuilder => {
            for (let i = 0; i < document.lineCount; i++) {
                const line = document.lineAt(i);
                const lineText = line.text;

                for (const pattern of logPatterns) {
                    pattern.lastIndex = 0;
                    let match;
                    while ((match = pattern.exec(lineText)) !== null) {
                        const originalStringContext = match[3] || "";
                        
                        // Check if it already has an emoji at start
                        // Comprehensive emoji check including circles and standard ranges
                        const hasEmojiAtStart = /^[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{1F1E6}-\u{1F1FF}\u{25AA}-\u{25FE}]/u.test(originalStringContext.trim());
                        
                        if (!hasEmojiAtStart && originalStringContext.trim().length > 0) {
                            const emoji = getBestEmoji(originalStringContext);
                            const prefix = match[1];
                            const prefixLength = prefix.length;
                            const quotePos = match.index + prefixLength; 
                            const insertPos = new vscode.Position(i, quotePos + 1);
                            
                            editBuilder.insert(insertPos, emoji + ' ');
                            editsCount++;
                        }
                    }
                }
            }
        }).then(success => {
            if (success && editsCount > 0) {
                vscode.window.showInformationMessage(`Added ${editsCount} emojis to logs successfully!`);
            } else if (success && editsCount === 0) {
                vscode.window.showInformationMessage('No new logs to add emojis to. (Lines with existing emojis are skipped)');
            }
        });
        
    });

    context.subscriptions.push(disposable);
}

function deactivate() {}

module.exports = {
    activate,
    deactivate
}
