# Emoji Log Assistant v1.0.2 🚀
![Icon](icon.png)

A local VS Code extension that automatically adds the most relevant emojis to your print/log statements in any language!

### How it works:
It scans your current file for typical log statements (like `console.log`, `print`, `println`, `echo`, `puts`, `System.out.println`, `Console.WriteLine`, `logger.info`, etc...) and checks the text inside the quotes. It then inserts the best matching emoji right into your string!

### Supported Languages:
Works seamlessly out of the box with JavaScript, TypeScript, Python, Java, Go, C#, C++, Ruby, PHP, Rust, and more by detecting common print patterns.

## Installation Status
✅ I have automatically installed the extension into your local VS Code extensions directory (`~/.vscode/extensions/emoji-log-ext`).

### How to Activate It Now:
1. Reload your VS Code window so it picks up the new extension (Press `Cmd+Shift+P` and type **Developer: Reload Window**, then press Enter).
2. Open any code file that has some log statements (e.g., `console.log("Starting server")`).
3. Open the Command Palette (`Cmd+Shift+P`).
4. Type **"Add Emojis to Console Logs"** and select it.
5. Watch the magic happen! Your log statements will automatically get cool emojis like `console.log("🚀 Starting server")`.

---

**Example Output:**

*Before:*
```javascript
console.error("Database connection failed")
console.log("User authentication success")
print("Loading user data")
```

*After running the command:*
```javascript
console.error("❌ Database connection failed")
console.log("✅ User authentication success")
print("⏳ Loading user data")
```
