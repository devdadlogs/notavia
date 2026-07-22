import assert from 'node:assert/strict';
import test from 'node:test';
import { applyMarkdownToolbarAction, insertMarkdownMedia } from './markdownToolbar.ts';

test('inserting a table preserves selected writing', () => {
  const content = '开头\n这段文字不能丢失\n结尾';
  const start = content.indexOf('这段');
  const end = start + '这段文字不能丢失'.length;

  const result = applyMarkdownToolbarAction(content, { start, end }, 'table');

  assert.match(result.content, /这段文字不能丢失/);
  assert.match(result.content, /\| 表头1 \| 表头2 \| 表头3 \|/);
});

test('heading formatting applies to the complete current line', () => {
  const content = '今天分享经验\n下一段';
  const cursor = content.indexOf('分享');

  const result = applyMarkdownToolbarAction(content, { start: cursor, end: cursor }, 'heading', { level: 2 });

  assert.equal(result.content, '## 今天分享经验\n下一段');
});

test('heading formatting keeps the first line when the document starts with a newline', () => {
  const result = applyMarkdownToolbarAction('\n下一段', { start: 0, end: 0 }, 'heading', { level: 3 });

  assert.equal(result.content, '### \n下一段');
});

test('image and video insertion keeps selected writing and escapes Markdown syntax', () => {
  const content = '素材文字';
  const selection = { start: 0, end: content.length };
  const image = insertMarkdownMedia(content, selection, { kind: 'image', fileName: 'a]b.png', url: '/uploads/a(b).png' });
  const video = insertMarkdownMedia(content, selection, { kind: 'video', fileName: 'video.mp4', url: '/uploads/a"b.mp4' });

  assert.match(image.content, /素材文字/);
  assert.match(image.content, /!\[a\\]b\.png\]\(\/uploads\/a\\\(b\\\)\.png\)/);
  assert.match(video.content, /素材文字/);
  assert.match(video.content, /src="\/uploads\/a&quot;b\.mp4"/);
});
