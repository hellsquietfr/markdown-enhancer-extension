// src/extension.ts
import * as vscode from 'vscode';

let suspendListContinuation = false;

export function activate(context: vscode.ExtensionContext) {
	console.log('🟢 Markdown Enhancer: activate() has run');
	console.log('🟢 Active editor language ID:', vscode.window.activeTextEditor?.document.languageId);
	console.log('🟢 Is active file Markdown?', vscode.window.activeTextEditor?.document.languageId === 'markdown');
	vscode.window.showInformationMessage('🟢 Markdown Enhancer is now active!');

	// ────────────────────────────────────────────────────────────
	// 1) Create a decoration type that paints backticks in red
	// ────────────────────────────────────────────────────────────
	const backtickDecorationType = vscode.window.createTextEditorDecorationType({
		color: '#FF5555' // bright red (feel free to pick any color)
	});

	// Common programming languages for quick selection
	const commonLanguages = [
		'javascript', 'typescript', 'python', 'java', 'csharp', 'cpp', 'c',
		'html', 'css', 'scss', 'json', 'xml', 'yaml', 'markdown',
		'bash', 'powershell', 'sql', 'php', 'ruby', 'go', 'rust',
		'swift', 'kotlin', 'dart', 'r', 'matlab', 'perl', 'lua'
	];

	// Function to scan the entire Markdown document and decorate every run of backticks:
	function updateBacktickDecorations(editor: vscode.TextEditor | undefined) {
		if (!editor) {
			return;
		}
		if (editor.document.languageId !== 'markdown') {
			// Only decorate when the active document is Markdown
			editor.setDecorations(backtickDecorationType, []);
			return;
		}

		const doc = editor.document;
		const decorations: vscode.Range[] = [];
		const regEx = /`+/g; // match any sequence of 1 or more backticks

		for (let lineNumber = 0; lineNumber < doc.lineCount; lineNumber++) {
			const lineText = doc.lineAt(lineNumber).text;
			let match: RegExpExecArray | null;
			while ((match = regEx.exec(lineText))) {
				const start = new vscode.Position(lineNumber, match.index);
				const end = new vscode.Position(lineNumber, match.index + match[0].length);
				decorations.push(new vscode.Range(start, end));
			}
		}

		editor.setDecorations(backtickDecorationType, decorations);
	}

	// Whenever the active editor changes, re‐decorate:
	context.subscriptions.push(
		vscode.window.onDidChangeActiveTextEditor((editor) => {
			updateBacktickDecorations(editor);
		})
	);

	// Whenever the document text changes, re‐decorate (only if it's the active Markdown file):
	context.subscriptions.push(
		vscode.workspace.onDidChangeTextDocument((e) => {
			const active = vscode.window.activeTextEditor;
			if (active && e.document === active.document && active.document.languageId === 'markdown') {
				updateBacktickDecorations(active);
			}
		})
	);

	// Immediately decorate the currently visible Markdown editor (if any):
	updateBacktickDecorations(vscode.window.activeTextEditor);

	// ────────────────────────────────────────────────────────────
	// 2) Create a custom command for handling backtick key presses
	// ────────────────────────────────────────────────────────────
	const backtickHandler = vscode.commands.registerCommand('markdown-enhancer.handleBacktick', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor || editor.document.languageId !== 'markdown') {
			// Not in a Markdown file, just insert a regular backtick
			await vscode.commands.executeCommand('default:type', { text: '`' });
			return;
		}

		const doc = editor.document;
		const sel = editor.selection;
		const pos = sel.active;

		// 1) Are we currently sitting between two backticks?
		//    i.e. preceding char is "`" and next char is "`"
		if (
			pos.character > 0 &&
			pos.character < doc.lineAt(pos.line).text.length &&
			doc.getText(new vscode.Range(pos.translate(0, -1), pos)) === '`' &&
			doc.getText(new vscode.Range(pos, pos.translate(0, 1))) === '`'
		) {
			// We have:  `|`  (cursor between two backticks)
			// The user just typed another backtick, so we want to expand
			// from `|`  →  ``````  (six backticks)  and put cursor in between 3rd/4th.

			// Compute the range of those two surrounding backticks:
			const surroundStart = pos.translate(0, -1);
			const surroundEnd = pos.translate(0, 1);

			await editor.edit((eb) => {
				eb.replace(new vscode.Range(surroundStart, surroundEnd), '``````');
			});

			// Place cursor between the 3rd and 4th backtick:
			const newCursor = surroundStart.translate(0, 3);
			editor.selection = new vscode.Selection(newCursor, newCursor);
			return;
		}

		// 2) Otherwise, we're just inserting a single backtick at the cursor →
		//    insert two backticks and put the cursor between them.
		await editor.edit((eb) => {
			eb.insert(pos, '``');
		});
		// Move the cursor one position to the right so it sits between the two:
		const newPosition = pos.translate(0, 1);
		editor.selection = new vscode.Selection(newPosition, newPosition);
	});

	context.subscriptions.push(backtickHandler);

	// ────────────────────────────────────────────────────────────
	// 3) Enhanced Enter key handling with smart code fence completion & auto-continue-lists
	// ────────────────────────────────────────────────────────────
	const typeInterceptor = vscode.commands.registerCommand('type', async (args) => {
		if (!args || typeof args.text !== 'string') {
			await vscode.commands.executeCommand('default:type', args);
			return;
		}

		const editor = vscode.window.activeTextEditor;
		if (!editor || editor.document.languageId !== 'markdown') {
			await vscode.commands.executeCommand('default:type', args);
			return;
		}

		// Only intercept Enter:
		if (args.text === '\n') {
			const doc = editor.document;
			const sel = editor.selection;
			const pos = sel.active;
			const lineText = doc.lineAt(pos.line).text;
			const trimmed = lineText.trim();

			// ───────────────────────
			// 1) Auto‑Continue Lists
			// ───────────────────────
			//
			// New regex: 
			//   ^(\s*)([-*]|\d+\.)\s*(.*)$
			//   1) (\s*)        = any leading indentation  
			//   2) ([-*]|\d+\.) = either "-" or "*" or "###."  
			//   3) \s*          = zero-or-more spaces  
			//   4) (.*)         = whatever comes next (could be empty)
			const listMatch = lineText.match(/^(\s*)([-*]|\d+\.)\s*(.*)$/);
			if (listMatch) {
				const indent = listMatch[1]; // e.g. "" or "  "
				const marker = listMatch[2]; // "-" or "*" or "3."
				const rest = listMatch[3]; // text after marker+space, or "" if none

				// Determine if we should *drop out* of the list vs. *continue*.
				// - If it’s a bullet ("-" or "*") AND rest is exactly empty → drop out.
				// - If it’s a number (e.g. "3.") and rest is empty, we still want to continue as "4."
				const isNumbered = /^\d+\.$/.test(marker);

				if (!isNumbered && rest === '') {
					// Bullet with no text after it: drop out of list.
					const newLineText = '\n' + indent;
					await editor.edit((eb) => {
						eb.insert(pos, newLineText);
					});
					const newCursor = new vscode.Position(pos.line + 1, indent.length);
					editor.selection = new vscode.Selection(newCursor, newCursor);
					return;
				}

				// Otherwise, continue the list:
				let nextMarker: string;
				if (marker === '-' || marker === '*') {
					// Bulleted list: keep the same bullet
					nextMarker = `${indent}${marker} `;
				} else {
					// Numbered list: increment the number before the dot
					const numberPart = marker.slice(0, -1);      // "3." → "3"
					const nextNum = parseInt(numberPart, 10) + 1;
					nextMarker = `${indent}${nextNum}. `;
				}

				// Insert newline + nextMarker
				const insertion = `\n${nextMarker}`;
				await editor.edit((eb) => {
					eb.insert(pos, insertion);
				});

				// Move cursor to after the marker (so user can type immediately)
				const newCursor = new vscode.Position(pos.line + 1, nextMarker.length);
				editor.selection = new vscode.Selection(newCursor, newCursor);
				return;
			}

			// ─────── Handle Six‑Backtick Case (“```|```” → prompt for language)
			if (trimmed === '``````') {
				// Show the language‐picker:
				const chosen = await vscode.window.showQuickPick(commonLanguages, {
					placeHolder: 'Select a language for the code fence (or press Esc for no language)',
					canPickMany: false
				});

				if (chosen) {
					// Replace “``````” with “```chosen”, then insert blank line + closing “```”
					const lineRange = doc.lineAt(pos.line).range;
					await editor.edit((eb) => {
						eb.replace(lineRange, `\`\`\`${chosen}`);
						eb.insert(lineRange.end, '\n\n```');
					});
				} else {
					// User canceled → just insert two newlines
					await editor.edit((eb) => {
						eb.insert(pos, '\n\n');
					});
				}

				// Move the cursor into the blank line between the fences:
				const newLine = pos.line + 1; // the “middle” empty line
				const newCursor = new vscode.Position(newLine, 0);
				editor.selection = new vscode.Selection(newCursor, newCursor);
				return;
			}

			// ─────── Handle Three‑Backtick Case (“```” or “```lang”):
			// Only Prompt if This “```” is an Opening Fence (not a closing fence).
			const codeBlockMatch = trimmed.match(/^```(\w*)$/);
			if (codeBlockMatch) {
				// Count how many lines *above* this one contain a triple‐backtick
				let countTripleFenceLinesAbove = 0;
				for (let i = 0; i < pos.line; i++) {
					if (doc.lineAt(i).text.trim().startsWith('```')) {
						countTripleFenceLinesAbove++;
					}
				}
				// If that count is even → this is *opening* fence. If odd → it's a closing fence.
				const isOpeningFence = (countTripleFenceLinesAbove % 2 === 0);
				const existingLang = codeBlockMatch[1]; // e.g. “python” if “```python”

				if (isOpeningFence) {
					// We’re on an opening fence. Prompt for language only if none was already typed.
					if (!existingLang) {
						const chosen = await vscode.window.showQuickPick(commonLanguages, {
							placeHolder: 'Select a language for the code fence (or press Esc for none)',
							canPickMany: false
						});

						if (chosen) {
							// Replace “```” with “```chosen”, then insert blank line + closing “```”
							const lineRange = doc.lineAt(pos.line).range;
							await editor.edit((eb) => {
								eb.replace(lineRange, `\`\`\`${chosen}`);
								eb.insert(lineRange.end, '\n\n```');
							});
						} else {
							// Canceled → just insert closing fence with one blank line
							await editor.edit((eb) => {
								eb.insert(pos, '\n\n```');
							});
						}
					} else {
						// “```lang” was already typed (e.g. “```javascript”) → just insert closing fence
						await editor.edit((eb) => {
							eb.insert(pos, '\n\n```');
						});
					}

					// Move cursor into the blank line
					const newLine = pos.line + 1;
					const newCursor = new vscode.Position(newLine, 0);
					editor.selection = new vscode.Selection(newCursor, newCursor);
					return;
				}

				// If this “```” is actually a *closing* fence (countTripleFenceLinesAbove is odd),
				// we do *not* prompt again. Just insert two newlines as before:
				await editor.edit((eb) => {
					eb.insert(pos, '\n\n');
				});
				// Move the cursor down two lines (so we remain after the blank line):
				const newLine = pos.line + 2;
				const newCursor = new vscode.Position(newLine, 0);
				editor.selection = new vscode.Selection(newCursor, newCursor);
				return;
			}

			// ─────── All Other Cases: Fall back to default Enter behavior:
			await vscode.commands.executeCommand('default:type', args);
			return;
		}

		// Any other key → default:
		await vscode.commands.executeCommand('default:type', args);
	});

	context.subscriptions.push(typeInterceptor);

	// ────────────────────────────────────────────────────────────
	// 4) Quick Language Picker Command
	// ────────────────────────────────────────────────────────────
	const insertCodeBlock = vscode.commands.registerCommand('markdown-enhancer.insertCodeBlock', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor || editor.document.languageId !== 'markdown') {
			vscode.window.showWarningMessage('Open a Markdown file first!');
			return;
		}

		const selectedLanguage = await vscode.window.showQuickPick(commonLanguages, {
			placeHolder: 'Select a language for the code block',
			canPickMany: false
		});

		if (selectedLanguage) {
			const pos = editor.selection.active;
			await editor.edit((eb) => {
				eb.insert(pos, `\`\`\`${selectedLanguage}\n\n\`\`\``);
			});

			// Position cursor in the middle of the code block
			const newLine = pos.line + 1;
			const newCursor = new vscode.Position(newLine, 0);
			editor.selection = new vscode.Selection(newCursor, newCursor);
		}
	});

	context.subscriptions.push(insertCodeBlock);

	// ────────────────────────────────────────────────────────────
	// 5) Smart Header Insertion
	// ────────────────────────────────────────────────────────────
	const insertHeader = vscode.commands.registerCommand('markdown-enhancer.insertHeader', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor || editor.document.languageId !== 'markdown') {
			vscode.window.showWarningMessage('Open a Markdown file first!');
			return;
		}

		const headerLevel = await vscode.window.showQuickPick(
			['# H1', '## H2', '### H3', '#### H4', '##### H5', '###### H6'],
			{ placeHolder: 'Select header level' }
		);

		if (headerLevel) {
			const headerText = await vscode.window.showInputBox({
				placeHolder: 'Enter header text',
				prompt: 'What should the header say?'
			});

			if (headerText) {
				const pos = editor.selection.active;
				await editor.edit((eb) => {
					eb.insert(pos, `${headerLevel.split(' ')[0]} ${headerText}\n`);
				});
			}
		}
	});

	context.subscriptions.push(insertHeader);

	// ────────────────────────────────────────────────────────────
	// 6) Smart Link Formatter
	// ────────────────────────────────────────────────────────────
	const insertLink = vscode.commands.registerCommand('markdown-enhancer.insertLink', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor || editor.document.languageId !== 'markdown') {
			vscode.window.showWarningMessage('Open a Markdown file first!');
			return;
		}

		const linkText = await vscode.window.showInputBox({
			placeHolder: 'Enter link text',
			prompt: 'What should the link text be?'
		});

		if (linkText) {
			const linkUrl = await vscode.window.showInputBox({
				placeHolder: 'Enter URL',
				prompt: 'What is the URL?'
			});

			if (linkUrl) {
				const pos = editor.selection.active;
				await editor.edit((eb) => {
					eb.insert(pos, `[${linkText}](${linkUrl})`);
				});
			}
		}
	});

	context.subscriptions.push(insertLink);

	// ────────────────────────────────────────────────────────────
	// 7) Table generator
	// ────────────────────────────────────────────────────────────
	const insertTable = vscode.commands.registerCommand(
		'markdown-enhancer.insertTable',
		async () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor || editor.document.languageId !== 'markdown') {
				vscode.window.showWarningMessage('Open a Markdown file first!');
				return;
			}

			// 1) Ask for number of columns:
			const columns = await vscode.window.showInputBox({
				placeHolder: 'Number of columns (1-10)',
				prompt: 'How many columns?',
				validateInput: (input) => {
					const num = parseInt(input);
					if (isNaN(num) || num < 1 || num > 10) {
						return 'Please enter a number between 1 and 10';
					}
					return null;
				},
			});
			if (!columns) {
				return;
			}
			const numCols = parseInt(columns);

			// 2) Ask for number of rows (excluding header):
			const rows = await vscode.window.showInputBox({
				placeHolder: 'Number of rows (1-10)',
				prompt: 'How many rows? (excluding header)',
				validateInput: (input) => {
					const num = parseInt(input);
					if (isNaN(num) || num < 1 || num > 10) {
						return 'Please enter a number between 1 and 10';
					}
					return null;
				},
			});
			if (!rows) {
				return;
			}
			const numRows = parseInt(rows);

			// 3) Build a 2D array of strings: first row = headers, next rows = "Cell r,c"
			//    [ ["Header 1", "Header 2", …], ["Cell 1,1", "Cell 1,2", …], … ]
			const tableData: string[][] = [];

			// Header names:
			const headerRow: string[] = [];
			for (let c = 0; c < numCols; c++) {
				headerRow.push(`Header ${c + 1}`);
			}
			tableData.push(headerRow);

			// Data rows:
			for (let r = 0; r < numRows; r++) {
				const rowArr: string[] = [];
				for (let c = 0; c < numCols; c++) {
					rowArr.push(`Cell ${r + 1},${c + 1}`);
				}
				tableData.push(rowArr);
			}

			// 4) Compute the maximum width of each column:
			//    colWidths[c] = the length of the longest string in tableData[all rows][c]
			const colWidths: number[] = new Array(numCols).fill(0);
			for (let c = 0; c < numCols; c++) {
				let maxLen = 0;
				for (let r = 0; r < tableData.length; r++) {
					maxLen = Math.max(maxLen, tableData[r][c].length);
				}
				colWidths[c] = maxLen;
			}

			// 5) Helper to pad a cell’s text to exactly `colWidths[c]` characters, left-aligned:
			function padCell(text: string, width: number): string {
				const extraSpaces = width - text.length;
				return text + ' '.repeat(extraSpaces);
			}

			// 6) Build the Markdown “header” row, the “separator” row, and each “data” row:
			let tableText = '';

			// 6a) Header row:
			tableText += '| ';
			for (let c = 0; c < numCols; c++) {
				tableText += padCell(tableData[0][c], colWidths[c]) + ' | ';
			}
			tableText += '\n';

			// 6b) Separator row (each column’s dashes = exactly colWidths[c] long):
			tableText += '| ';
			for (let c = 0; c < numCols; c++) {
				// e.g. if colWidths[c] is 8, this becomes "--------"
				const dashLine = '-'.repeat(colWidths[c]);
				tableText += dashLine + ' | ';
			}
			tableText += '\n';

			// 6c) Data rows:
			for (let r = 1; r < tableData.length; r++) {
				tableText += '| ';
				for (let c = 0; c < numCols; c++) {
					tableText += padCell(tableData[r][c], colWidths[c]) + ' | ';
				}
				tableText += '\n';
			}

			// 7) Insert the entire table at the current cursor position:
			const pos = editor.selection.active;
			await editor.edit((eb) => {
				eb.insert(pos, tableText);
			});
		}
	);

	context.subscriptions.push(insertTable);

	// ────────────────────────────────────────────────────────────
	// Refresh Table of Contents (auto-update existing TOC at any # level)
	// ────────────────────────────────────────────────────────────
	const refreshToc = vscode.commands.registerCommand(
		'markdown-enhancer.refreshToc',
		async () => {
			const editor = vscode.window.activeTextEditor;
			if (!editor || editor.document.languageId !== 'markdown') {
				vscode.window.showWarningMessage('Open a Markdown file first!');
				return;
			}

			const doc = editor.document;
			const fullText = doc.getText();
			const lines = fullText.split(/\r?\n/);

			// 1) Find the TOC heading at ANY level: e.g. "# Table of Contents" or "## Table of Contents"
			let tocStartLine = -1;
			let tocLevel = 0; // number of '#' characters for the TOC heading we found
			for (let i = 0; i < lines.length; i++) {
				const trimmedLower = lines[i].trim().toLowerCase();
				// Match "#...# Table of Contents" ignoring extra spaces and case
				const match = lines[i].match(/^(\s*)(#{1,6})\s*Table of Contents\s*$/i);
				if (match) {
					tocStartLine = i;
					tocLevel = match[2].length; // e.g. "##" → length 2
					break;
				}
			}

			// 2) Gather ALL headers (# to ######), skipping any that say "Table of Contents"
			//    Regex: ^(#{1,6})\s+(.+)$
			type Header = { level: number; text: string; slug: string };
			const headers: Header[] = [];
			const headerRegex = /^(#{1,6})\s+(.+)$/gm;
			let m: RegExpExecArray | null;
			while ((m = headerRegex.exec(fullText)) !== null) {
				const level = m[1].length;       // number of '#'s
				const text = m[2].trim();        // heading text
				if (text.toLowerCase() === 'table of contents') {
					continue; // skip the TOC itself
				}

				// Generate slug (GitHub‐style):
				const slug = text
					.toLowerCase()
					.replace(/[^\w\s-]/g, '') // remove punctuation
					.replace(/\s+/g, '-')     // spaces → dashes
					.replace(/^-+|-+$/g, ''); // trim leading/trailing dashes

				headers.push({ level, text, slug });
			}

			// 3) Build the new TOC string. 
			//    We always start with "## Table of Contents" (level 2) in the new TOC.
			//    If you want the new TOC to match the same level (# vs ##) as the old one,
			//    you could change this to `${'#'.repeat(tocLevel)} Table of Contents`.
			//    But for simplicity, we'll canonicalize to level‐2 ("##").
			let newTocText = '## Table of Contents\n\n';
			for (const h of headers) {
				// Indent H2 as top‐level entry (no indent),
				// indent H3 by two spaces, H4 by four spaces, etc.
				// Treat H1 the same as H2 (no indent).
				const effectiveLevel = h.level <= 2 ? 2 : h.level;
				const indent = '  '.repeat(effectiveLevel - 2);
				newTocText += `${indent}- [${h.text}](#${h.slug})\n`;
			}
			newTocText += '\n'; // blank line after TOC

			// 4) If we found an existing TOC heading, replace that block:
			if (tocStartLine >= 0) {
				// Determine where the existing TOC ends.
				// We stop replacing as soon as we see a heading whose level ≤ tocLevel.
				// (Because splitting at the same or higher‐level heading ends the TOC block.)
				let tocEndLine = lines.length - 1;
				for (let j = tocStartLine + 1; j < lines.length; j++) {
					// Look for any heading of level ≤ tocLevel:
					const headingMatch = lines[j].match(/^(#{1,6})\s+/);
					if (headingMatch) {
						const thatLevel = headingMatch[1].length;
						if (thatLevel <= tocLevel) {
							tocEndLine = j - 1;
							break;
						}
					}
				}

				// Build a Range from the start of the TOC line down to the line after tocEndLine
				const startPos = new vscode.Position(tocStartLine, 0);
				const endPos = new vscode.Position(tocEndLine + 1, 0);
				const replaceRange = new vscode.Range(startPos, endPos);

				await editor.edit((eb) => {
					eb.replace(replaceRange, newTocText);
				});

				// Move cursor to the new "## Table of Contents" line:
				const newCursorPos = new vscode.Position(tocStartLine, 0);
				editor.selection = new vscode.Selection(newCursorPos, newCursorPos);
				return;
			}

			// 5) If no existing TOC was found, just insert at the current cursor position:
			const insertPos = editor.selection.active;
			await editor.edit((eb) => {
				eb.insert(insertPos, newTocText);
			});
			const newCursorPos = new vscode.Position(insertPos.line, 0);
			editor.selection = new vscode.Selection(newCursorPos, newCursorPos);
		}
	);

	context.subscriptions.push(refreshToc);

	// ────────────────────────────────────────────────────────────
	// 8) Image insertion helper
	// ────────────────────────────────────────────────────────────
	const insertImage = vscode.commands.registerCommand('markdown-enhancer.insertImage', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor || editor.document.languageId !== 'markdown') {
			vscode.window.showWarningMessage('Open a Markdown file first');
			return;
		}

		const altText = await vscode.window.showInputBox({
			placeHolder: 'Alt text for the image',
			prompt: 'Enter alt text (description of the image)'
		});

		if (altText === undefined) { return; }

		const imageUrl = await vscode.window.showInputBox({
			placeHolder: 'URL or relative path to image',
			prompt: 'Enter image URL or path'
		});

		if (imageUrl) {
			const pos = editor.selection.active;
			await editor.edit((eb) => {
				eb.insert(pos, `![${altText}](${imageUrl})`);
			});
		}
	});

	context.subscriptions.push(insertImage);

	// ────────────────────────────────────────────────────────────
	// 9) Task List creator
	// ────────────────────────────────────────────────────────────
	const insertTaskList = vscode.commands.registerCommand('markdown-enhancer.insertTaskList', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor || editor.document.languageId !== 'markdown') {
			vscode.window.showWarningMessage('Open a Markdown file first');
			return;
		}

		// Get number of tasks
		const numTasksInput = await vscode.window.showInputBox({
			placeHolder: 'Number of tasks (1-10)',
			prompt: 'How many tasks items?',
			validateInput: (input) => {
				const num = parseInt(input);
				if (isNaN(num) || num < 1 || num > 10) {
					return 'Please enter a number between 1 and 10';
				}
				return null;
			}
		});

		if (!numTasksInput) { return; }
		const numTasks = parseInt(numTasksInput);

		// Generate task list
		let taskListText = '';
		for (let i = 0; i < numTasks; i++) {
			taskListText += `; [ ] task ${i + 1}\n`;
		}

		// Insert the task list
		const pos = editor.selection.active;
		await editor.edit((eb) => {
			eb.insert(pos, taskListText);
		});
	});

	context.subscriptions.push(insertTaskList);

	// ────────────────────────────────────────────────────────────
	// 10) Text Formatting Shortcuts
	// ────────────────────────────────────────────────────────────
	const formatText = vscode.commands.registerCommand('markdown-enhancer.formatText', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor || editor.document.languageId !== 'markdown') {
			vscode.window.showWarningMessage('Open a Markdown file first!');
			return;
		}

		const formatOptions = [
			'Bold (**text**)',
			'Italic (*text*)',
			'Strikethrough (~~text~~)',
			'Inline Code (`text`)',
			'Blockquote (> text)',
			'Horizontal Rule (---)',
		];

		const selectedFormat = await vscode.window.showQuickPick(formatOptions, {
			placeHolder: 'Select text formatting'
		});

		if (!selectedFormat) { return; }

		const selection = editor.selection;
		const hasSelection = !selection.isEmpty;
		let text = hasSelection ? editor.document.getText(selection) : '';

		let formattedText = '';
		let newCursorPos: vscode.Position | null = null;

		switch (selectedFormat) {
			case 'Bold (**text**)':
				formattedText = `**${text || 'bold text'}**`;
				if (!hasSelection) {
					newCursorPos = new vscode.Position(
						selection.active.line,
						selection.active.character + 2
					);
				}
				break;
			case 'Italic (*text*)':
				formattedText = `*${text || 'italic text'}*`;
				if (!hasSelection) {
					newCursorPos = new vscode.Position(
						selection.active.line,
						selection.active.character + 1
					);
				}
				break;
			case 'Strikethrough (~~text~~)':
				formattedText = `~~${text || 'strikethrough text'}~~`;
				if (!hasSelection) {
					newCursorPos = new vscode.Position(
						selection.active.line,
						selection.active.character + 2
					);
				}
				break;
			case 'Inline Code (`text`)':
				formattedText = `\`${text || 'code'}\``;
				if (!hasSelection) {
					newCursorPos = new vscode.Position(
						selection.active.line,
						selection.active.character + 1
					);
				}
				break;
			case 'Blockquote (> text)':
				formattedText = `> ${text || 'blockquote'}`;
				if (!hasSelection) {
					newCursorPos = new vscode.Position(
						selection.active.line,
						selection.active.character + 2
					);
				}
				break;
			case 'Horizontal Rule (---)':
				formattedText = `\n---\n`;
				break;
		}

		await editor.edit((eb) => {
			if (hasSelection) {
				eb.replace(selection, formattedText);
			} else {
				eb.insert(selection.active, formattedText);
			}
		});

		// Position cursor inside formatting if no text was selected
		if (!hasSelection && newCursorPos) {
			editor.selection = new vscode.Selection(newCursorPos, newCursorPos);
		}
	});

	context.subscriptions.push(formatText);

	// ────────────────────────────────────────────────────────────
	// 11) Table of Contents generator
	// ────────────────────────────────────────────────────────────
	const generateToc = vscode.commands.registerCommand('markdown-enhancer.generateToc', async () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor || editor.document.languageId !== 'markdown') {
			vscode.window.showWarningMessage('Open a Markdown file first');
			return;
		}

		const doc = editor.document;
		const text = doc.getText();

		// Find all headers in the document
		const headerRegex = /^(#{1,6})\s+(.+)$/gm;
		const headers: { level: number, text: string, slug: string }[] = [];
		let match;

		while ((match = headerRegex.exec(text)) !== null) {
			const level = match[1].length;
			const headerText = match[2].trim();

			// Create a slug for the header (simplified version)
			const slug = headerText
				.toLowerCase()
				.replace(/[^\w\s-]/g, '') // Remove special chars
				.replace(/\s+/g, '-')    // Replace spaces with hyphens
				.replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens

			headers.push({ level, text: headerText, slug });
		}

		// Generate TOC
		let toc = '## Table of Contents\n\n';

		for (const header of headers) {
			// Skip H1 titles and the TOC itself
			if (header.level === 1 || header.text === 'Table of Contents') {
				continue;
			}

			// Add identation based on header level
			const indent = '  '.repeat(header.level - 2);
			toc += `${indent}- [${header.text}](#${header.slug})\n`;
		}

		// Insert TOC at cursor position
		const pos = editor.selection.active;
		await editor.edit((eb) => {
			eb.insert(pos, toc);
		});
	});

	context.subscriptions.push(generateToc);

	// ────────────────────────────────────────────────────────────
	// 12) Test Command
	// ────────────────────────────────────────────────────────────
	const testCommand = vscode.commands.registerCommand('markdown-enhancer.test', () => {
		vscode.window.showInformationMessage('🟢 Markdown Enhancer test command executed!');
	});

	context.subscriptions.push(testCommand);
}

export function deactivate() { }

