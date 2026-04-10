const nodeEmoji = require('node-emoji');
const emojilib = require('emojilib');

const defaultEmoji = '👉';

function getBestEmoji(text) {
    const lowerText = text.toLowerCase();
    const words = lowerText.split(/\W+/);
    for (const word of words) {
        if (!word) continue;
        const results = nodeEmoji.search(word);
        if (results && results.length > 0) {
            console.log(`Matched word: ${word} in node-emoji -> ${results[0].emoji}`);
            return results[0].emoji;
        }
        for (const [emoji, keywords] of Object.entries(emojilib)) {
            if (keywords.includes(word)) {
                console.log(`Matched word: ${word} in emojilib -> ${emoji}`);
                return emoji;
            }
        }
    }
    for (const [emoji, keywords] of Object.entries(emojilib)) {
        for (const keyword of keywords) {
            if (keyword.length > 3 && lowerText.includes(keyword)) {
                console.log(`Matched keyword partial: ${keyword} in emojilib -> ${emoji}`);
                return emoji;
            }
        }
    }
    return defaultEmoji;
}

const samples = [
    "Starting sync",
    "Background location received",
    "SDK update successful",
    "Native watcher appears dead"
];

samples.forEach(s => {
    console.log(`[${s}] -> ${getBestEmoji(s)}`);
});
