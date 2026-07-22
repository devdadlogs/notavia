export type MarkdownToolbarAction =
  | 'bold'
  | 'italic'
  | 'bulletList'
  | 'orderedList'
  | 'blockquote'
  | 'codeBlock'
  | 'heading'
  | 'link'
  | 'table';

export type MarkdownSelection = { start: number; end: number };
export type MarkdownEdit = { content: string; selectionStart: number; selectionEnd: number };
export type MarkdownMedia = { kind: 'image' | 'video'; url: string; fileName: string };

const tableTemplate = '| 表头1 | 表头2 | 表头3 |\n| --- | --- | --- |\n| 内容1 | 内容2 | 内容3 |';

function boundedSelection(content: string, selection: MarkdownSelection) {
  const start = Math.max(0, Math.min(selection.start, content.length));
  const end = Math.max(start, Math.min(selection.end, content.length));
  return { start, end };
}

function replaceRange(content: string, start: number, end: number, replacement: string, selectionStart: number, selectionEnd: number): MarkdownEdit {
  return { content: content.slice(0, start) + replacement + content.slice(end), selectionStart, selectionEnd };
}

function selectedLines(content: string, selection: MarkdownSelection) {
  const { start, end } = boundedSelection(content, selection);
  const lineStart = start === 0 ? 0 : content.lastIndexOf('\n', start - 1) + 1;
  const nextLineBreak = content.indexOf('\n', Math.max(end, lineStart));
  const lineEnd = nextLineBreak === -1 ? content.length : nextLineBreak;
  return { start, end, lineStart, lineEnd, text: content.slice(lineStart, lineEnd) };
}

function toggleLinePrefix(text: string, expression: RegExp, prefix: (index: number) => string) {
  const lines = text.split('\n');
  const nonEmpty = lines.filter(line => line.trim().length > 0);
  const shouldRemove = nonEmpty.length > 0 && nonEmpty.every(line => expression.test(line));
  return lines.map((line, index) => {
    if (shouldRemove) return line.replace(expression, '$1');
    return line.trim().length === 0 ? prefix(index) : `${prefix(index)}${line}`;
  }).join('\n');
}

function escapeMarkdownLabel(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\[/g, '\\[').replace(/\]/g, '\\]');
}

function escapeMarkdownDestination(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/[()]/g, '\\$&');
}

function escapeHtmlAttribute(value: string) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function applyMarkdownToolbarAction(
  content: string,
  selection: MarkdownSelection,
  action: MarkdownToolbarAction,
  options?: { level?: number; href?: string },
): MarkdownEdit {
  const { start, end } = boundedSelection(content, selection);
  const selectedText = content.slice(start, end);

  if (action === 'bold' || action === 'italic') {
    const marker = action === 'bold' ? '**' : '*';
    if (selectedText.startsWith(marker) && selectedText.endsWith(marker) && selectedText.length >= marker.length * 2) {
      const replacement = selectedText.slice(marker.length, -marker.length);
      return replaceRange(content, start, end, replacement, start, start + replacement.length);
    }
    const replacement = `${marker}${selectedText}${marker}`;
    return replaceRange(content, start, end, replacement, start + marker.length, start + marker.length + selectedText.length);
  }

  if (action === 'heading' || action === 'bulletList' || action === 'orderedList' || action === 'blockquote') {
    const lines = selectedLines(content, selection);
    let replacement = lines.text;
    if (action === 'heading') {
      const level = Math.max(1, Math.min(6, options?.level || 1));
      const expression = /^(#{1,6})\s+/;
      const nonEmptyLines = replacement.split('\n').filter(line => line.trim());
      const allAtLevel = nonEmptyLines.length > 0 && nonEmptyLines.every(line => line.startsWith(`${'#'.repeat(level)} `));
      replacement = replacement.split('\n').map(line => {
        if (allAtLevel) return line.replace(expression, '');
        return `${'#'.repeat(level)} ${line.replace(expression, '')}`;
      }).join('\n');
    } else if (action === 'bulletList') {
      replacement = toggleLinePrefix(replacement, /^(\s*)-\s+/, () => '- ');
    } else if (action === 'orderedList') {
      replacement = toggleLinePrefix(replacement, /^(\s*)\d+\.\s+/, index => `${index + 1}. `);
    } else {
      replacement = toggleLinePrefix(replacement, /^(\s*)>\s?/, () => '> ');
    }
    return replaceRange(content, lines.lineStart, lines.lineEnd, replacement, lines.lineStart, lines.lineStart + replacement.length);
  }

  if (action === 'codeBlock') {
    const replacement = `\n\`\`\`\n${selectedText}\n\`\`\`\n`;
    const cursor = start + 5;
    return replaceRange(content, start, end, replacement, cursor, cursor + selectedText.length);
  }

  if (action === 'link') {
    const label = selectedText || '链接文字';
    const href = options?.href;
    if (!href) return { content, selectionStart: start, selectionEnd: end };
    const replacement = `[${escapeMarkdownLabel(label)}](${escapeMarkdownDestination(href)})`;
    return replaceRange(content, start, end, replacement, start + 1, start + 1 + label.length);
  }

  if (action === 'table') {
    const leading = start > 0 && !content.slice(0, start).endsWith('\n\n') ? '\n\n' : '';
    const trailing = end < content.length && !content.slice(end).startsWith('\n') ? '\n' : '';
    const replacement = `${leading}${tableTemplate}\n${trailing}`;
    const insertionPoint = end;
    return replaceRange(content, insertionPoint, insertionPoint, replacement, insertionPoint + replacement.length, insertionPoint + replacement.length);
  }

  return { content, selectionStart: start, selectionEnd: end };
}

export function insertMarkdownMedia(content: string, selection: MarkdownSelection, media: MarkdownMedia): MarkdownEdit {
  const { end } = boundedSelection(content, selection);
  const leading = end > 0 && !content.slice(0, end).endsWith('\n') ? '\n\n' : '';
  const trailing = end < content.length && !content.slice(end).startsWith('\n') ? '\n' : '';
  const markup = media.kind === 'image'
    ? `![${escapeMarkdownLabel(media.fileName || '图片')}](${escapeMarkdownDestination(media.url)})`
    : `<video src="${escapeHtmlAttribute(media.url)}" controls></video>`;
  const replacement = `${leading}${markup}\n${trailing}`;
  return replaceRange(content, end, end, replacement, end + replacement.length, end + replacement.length);
}
