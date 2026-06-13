import { Node, mergeAttributes } from '@tiptap/core';

export const SimpleTable = Node.create({
  name: 'table',
  group: 'block',
  content: 'tableRow+',
  tableRole: 'table',
  isolating: true,
  parseHTML() {
    return [{ tag: 'table' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['table', mergeAttributes(HTMLAttributes, { class: 'simple-table' }), ['tbody', 0]];
  },
});

export const SimpleTableRow = Node.create({
  name: 'tableRow',
  content: '(tableCell | tableHeader)*',
  tableRole: 'row',
  parseHTML() {
    return [{ tag: 'tr' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['tr', mergeAttributes(HTMLAttributes), 0];
  },
});

export const SimpleTableCell = Node.create({
  name: 'tableCell',
  content: 'block+',
  tableRole: 'cell',
  isolating: true,
  parseHTML() {
    return [{ tag: 'td' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['td', mergeAttributes(HTMLAttributes), 0];
  },
});

export const SimpleTableHeader = Node.create({
  name: 'tableHeader',
  content: 'block+',
  tableRole: 'header_cell',
  isolating: true,
  parseHTML() {
    return [{ tag: 'th' }];
  },
  renderHTML({ HTMLAttributes }) {
    return ['th', mergeAttributes(HTMLAttributes), 0];
  },
});
