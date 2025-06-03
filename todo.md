## 3. Paste Image from Clipboard
Why: If someone copies an image (e.g. screenshot) to the clipboard, hitting your “Insert Image from Clipboard” command could automatically:
1. Paste the PNG data from the clipboard into that file.<br>

Command: `markdown-enhancer.pasteImageFromClipboard`
Implementation hints:
1. Use `Node’s clipboardy` or VS Code’s `vscode.env.clipboard.readImage()` API (introduced in recent versions) to retrieve an image buffer.
2. Save it with `fs.writeFile(…)` into a relative folder.

---

## 4. Wrap/Unwrap Selection in Markdown Blocks
Why: If the user selects multiple lines and hits a command, you could wrap them in a code fence, blockquote, or admonition (“> Note: …”).<br>

Commands:
- `markdown-enhancer.wrapInCodeBlock` → wrap selection in:
```md
```lang
selected text
`` `
```
<br>`markdown-enhancer.wrapInBlockquote` → prefix each line with `>`.
<br>`markdown-enhancer.wrapInAdmonition` → insert something like
```md
> **Note**
>
> selected text
```
- Behavior:
1. If user has a multi‑line selection, detect it.
2. Prompt for a language (for code block) or admonition type.
3. Insert opening/closing markers & adjust indentation.