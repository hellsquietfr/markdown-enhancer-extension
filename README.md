# 🧩 Markdown Enhancer

Enhance your Markdown editing experience in Visual Studio Code with smart formatting, intelligent code fences, dynamic Table of Contents generation, and more.

---

## ✨ Features

✅ **Backtick Decoration**  
Highlights all backtick sequences (`) in Markdown for improved visibility.

✅ **Smart Backtick Handling**  
Typing a backtick in between two backticks turns them into a full 6-backtick block and prompts for a language.

✅ **Auto-Continue Lists**  
Pressing `Enter` inside lists (bullets or numbered) automatically continues the list or exits if appropriate.

✅ **Smart Code Block Completion**  
Type three or six backticks to trigger a language picker, auto-complete the closing fence, and place your cursor in the right spot.

✅ **Command Palette Actions**  
- Insert Markdown Header
- Insert Code Block with Language
- Insert Link
- Insert Image
- Insert Table
- Insert Task List
- Format Text (Bold, Italic, Inline Code, etc.)
- Generate or Refresh Table of Contents

✅ **Keyboard Shortcuts** (Markdown only):
| Keybind | Action |
|--------|--------|
| `` ` `` | Smart backtick handler |
| Ctrl+Shift+C | Insert code block |
| Ctrl+Shift+L | Insert link |
| Ctrl+Shift+T | Insert table |
| Ctrl+Shift+I | Insert image |
| Ctrl+Shift+F | Format text |
| Ctrl+Shift+G | Generate TOC |
| Ctrl+Shift+R | Refresh TOC |

---

## 📸 Screenshots

_Coming soon..._

---

## 🔧 Commands Reference

| Command | Description |
|--------|-------------|
| `markdown-enhancer.insertHeader` | Insert Markdown header |
| `markdown-enhancer.insertCodeBlock` | Insert language-tagged code block |
| `markdown-enhancer.insertLink` | Prompt for link text and URL |
| `markdown-enhancer.insertTable` | Generate a table with given rows/columns |
| `markdown-enhancer.insertImage` | Prompt for image alt text + URL |
| `markdown-enhancer.insertTaskList` | Create a checklist |
| `markdown-enhancer.formatText` | Choose formatting: bold, italic, quote, etc. |
| `markdown-enhancer.generateToc` | Insert a new table of contents |
| `markdown-enhancer.refreshToc` | Refresh existing TOC based on document |
| `markdown-enhancer.test` | Test command (for debugging) |

---

## 🚀 Getting Started

1. Open a Markdown (`.md`) file in VS Code.
2. Try typing backticks (`` ` ``) or pressing `Enter` inside a list.
3. Use `Ctrl+Shift+P` to access `Markdown Enhancer` commands.

---