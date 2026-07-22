import { useCallback, useEffect, useRef, useState } from 'react';
import type { Editor } from '@tiptap/react';
import { CellSelection } from '@tiptap/pm/tables';
import { Copy, GripVertical, Merge, Plus, Rows3, Scissors, Split, TableProperties, Trash2 } from 'lucide-react';

type HoverTarget = {
  axis: 'row' | 'column';
  cell: HTMLTableCellElement;
  rect: DOMRect;
  after: boolean;
};

type TableHoverControlsProps = { editor: Editor | null };

/**
 * Table controls intentionally live next to the table instead of in the global
 * toolbar: a grip exposes whole-table commands, edges select a row/column, and
 * the plus affordance inserts exactly where the pointer is.
 */
export function TableHoverControls({ editor }: TableHoverControlsProps) {
  const [table, setTable] = useState<HTMLTableElement | null>(null);
  const [tableRect, setTableRect] = useState<DOMRect | null>(null);
  const [hover, setHover] = useState<HoverTarget | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [selectionMenu, setSelectionMenu] = useState<{ top: number; left: number } | null>(null);
  const hideTimer = useRef<number | null>(null);

  const refreshTable = useCallback((next: HTMLTableElement | null) => {
    if (table && table !== next) table.classList.remove('table-hovered');
    if (next) {
      next.classList.add('table-hovered');
      setTable(next);
      setTableRect(next.getBoundingClientRect());
    } else {
      setTable(null);
      setTableRect(null);
      setHover(null);
    }
  }, [table]);

  useEffect(() => {
    if (!editor) return;

    const isControl = (target: HTMLElement) => Boolean(target.closest('.table-hover-controls'));
    const handleMove = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      const candidate = target.closest('table') as HTMLTableElement | null;
      const current = candidate && editor.view.dom.contains(candidate) ? candidate : null;

      if (!current && !isControl(target)) {
        if (hideTimer.current) window.clearTimeout(hideTimer.current);
        hideTimer.current = window.setTimeout(() => {
          if (!menuOpen) refreshTable(null);
        }, 120);
        return;
      }

      if (hideTimer.current) window.clearTimeout(hideTimer.current);
      if (current) refreshTable(current);
      const activeTable = current || table;
      if (!activeTable || isControl(target)) return;

      const rect = activeTable.getBoundingClientRect();
      setTableRect(rect);
      const rows = Array.from(activeTable.rows);
      const columns = Array.from(rows[0]?.cells || []);
      const nearTop = event.clientY >= rect.top - 18 && event.clientY <= rect.top + 12;
      const nearLeft = event.clientX >= rect.left - 18 && event.clientX <= rect.left + 12;

      if (nearTop) {
        const cell = columns.find(column => event.clientX >= column.getBoundingClientRect().left && event.clientX <= column.getBoundingClientRect().right);
        if (cell) {
          const cellRect = cell.getBoundingClientRect();
          setHover({ axis: 'column', cell, rect: cellRect, after: event.clientX > cellRect.left + cellRect.width / 2 });
          return;
        }
      }
      if (nearLeft) {
        const row = rows.find(item => event.clientY >= item.getBoundingClientRect().top && event.clientY <= item.getBoundingClientRect().bottom);
        const cell = row?.cells[0];
        if (cell) {
          const cellRect = cell.getBoundingClientRect();
          setHover({ axis: 'row', cell, rect: cellRect, after: event.clientY > cellRect.top + cellRect.height / 2 });
          return;
        }
      }
      setHover(null);
    };

    const closeMenu = (event: MouseEvent) => {
      if (!(event.target as HTMLElement).closest('.table-grip-menu, .table-grip-button')) setMenuOpen(false);
    };
    const clearOnScroll = () => { setMenuOpen(false); setHover(null); refreshTable(null); };
    document.addEventListener('mousemove', handleMove);
    document.addEventListener('mousedown', closeMenu);
    window.addEventListener('scroll', clearOnScroll, true);
    return () => {
      if (hideTimer.current) window.clearTimeout(hideTimer.current);
      document.removeEventListener('mousemove', handleMove);
      document.removeEventListener('mousedown', closeMenu);
      window.removeEventListener('scroll', clearOnScroll, true);
    };
  }, [editor, menuOpen, table, refreshTable]);

  useEffect(() => {
    if (!editor) return;
    const updateSelectionMenu = () => {
      const cells = Array.from(editor.view.dom.querySelectorAll<HTMLElement>('.selectedCell'));
      if (cells.length < 2) return setSelectionMenu(null);
      const rects = cells.map(cell => cell.getBoundingClientRect());
      const top = Math.min(...rects.map(rect => rect.top));
      const left = Math.min(...rects.map(rect => rect.left));
      const right = Math.max(...rects.map(rect => rect.right));
      setSelectionMenu({ top: Math.max(8, top - 42), left: left + (right - left) / 2 });
    };
    editor.on('selectionUpdate', updateSelectionMenu);
    editor.on('transaction', updateSelectionMenu);
    window.addEventListener('scroll', updateSelectionMenu, true);
    return () => {
      editor.off('selectionUpdate', updateSelectionMenu);
      editor.off('transaction', updateSelectionMenu);
      window.removeEventListener('scroll', updateSelectionMenu, true);
    };
  }, [editor]);

  if (!editor || !table || !tableRect) return null;

  const selectCell = (cell: HTMLElement) => {
    const pos = editor.view.posAtDOM(cell, 0);
    const resolved = editor.state.doc.resolve(pos);
    for (let depth = resolved.depth; depth > 0; depth -= 1) {
      const node = resolved.node(depth);
      if (node.type.name === 'tableCell' || node.type.name === 'tableHeader') {
        editor.view.dispatch(editor.state.tr.setSelection(CellSelection.create(editor.state.doc, resolved.before(depth))));
        editor.commands.focus();
        return;
      }
    }
  };

  const runInTable = (action: () => boolean) => {
    const firstCell = table.querySelector('th, td') as HTMLElement | null;
    if (firstCell) selectCell(firstCell);
    action();
    setMenuOpen(false);
    setHover(null);
    window.requestAnimationFrame(() => refreshTable(table.isConnected ? table : null));
  };

  const selectWholeTable = () => {
    const cells = Array.from(table.querySelectorAll('th, td')) as HTMLElement[];
    if (cells.length === 0) return;
    const first = editor.view.posAtDOM(cells[0], 0);
    const last = editor.view.posAtDOM(cells[cells.length - 1], 0);
    const findCellPosition = (pos: number) => {
      const resolved = editor.state.doc.resolve(pos);
      for (let depth = resolved.depth; depth > 0; depth -= 1) {
        if (['tableCell', 'tableHeader'].includes(resolved.node(depth).type.name)) return resolved.before(depth);
      }
      return pos;
    };
    editor.view.dispatch(editor.state.tr.setSelection(CellSelection.create(editor.state.doc, findCellPosition(first), findCellPosition(last))));
    editor.commands.focus();
    setMenuOpen(false);
  };

  const copyTable = async () => {
    const html = table.outerHTML;
    const text = table.innerText;
    try {
      if (navigator.clipboard?.write && typeof ClipboardItem !== 'undefined') {
        await navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([text], { type: 'text/plain' }) })]);
      } else {
        await navigator.clipboard.writeText(text);
      }
    } catch {
      selectWholeTable();
      document.execCommand('copy');
    }
    setMenuOpen(false);
  };

  const insertAtHover = () => {
    if (!hover) return;
    selectCell(hover.cell);
    if (hover.axis === 'row') (hover.after ? editor.chain().focus().addRowAfter() : editor.chain().focus().addRowBefore()).run();
    else (hover.after ? editor.chain().focus().addColumnAfter() : editor.chain().focus().addColumnBefore()).run();
    setHover(null);
  };

  const selectAxis = () => {
    if (!hover) return;
    const pos = editor.view.posAtDOM(hover.cell, 0);
    const resolved = editor.state.doc.resolve(pos);
    for (let depth = resolved.depth; depth > 0; depth -= 1) {
      if (['tableCell', 'tableHeader'].includes(resolved.node(depth).type.name)) {
        const cell = editor.state.doc.resolve(resolved.before(depth));
        const selection = hover.axis === 'row' ? CellSelection.rowSelection(cell) : CellSelection.colSelection(cell);
        editor.view.dispatch(editor.state.tr.setSelection(selection));
        editor.commands.focus();
        return;
      }
    }
  };

  return <div className="table-hover-controls" aria-label="表格快捷操作">
    <div className="table-grip" style={{ top: tableRect.top - 30, left: tableRect.left - 30 }}>
      <button className="table-grip-button" type="button" aria-label="打开表格操作菜单" title="表格操作" onMouseDown={event => event.preventDefault()} onClick={() => setMenuOpen(open => !open)}><GripVertical size={17}/></button>
      {menuOpen && <div className="table-grip-menu" role="menu">
        <span className="table-menu-label"><TableProperties size={14}/>表格</span>
        <button type="button" onClick={selectWholeTable}>全选表格</button>
        <button type="button" onClick={() => void copyTable()}><Copy size={14}/>复制表格</button>
        <button type="button" onClick={() => void copyTable().then(() => runInTable(() => editor.chain().focus().deleteTable().run()))}><Scissors size={14}/>剪切表格</button>
        <i/>
        <button type="button" onClick={() => runInTable(() => editor.chain().focus().addRowBefore().run())}>在上方添加行</button>
        <button type="button" onClick={() => runInTable(() => editor.chain().focus().addRowAfter().run())}>在下方添加行</button>
        <button type="button" onClick={() => runInTable(() => editor.chain().focus().addColumnBefore().run())}>在左侧添加列</button>
        <button type="button" onClick={() => runInTable(() => editor.chain().focus().addColumnAfter().run())}>在右侧添加列</button>
        <button type="button" onClick={() => runInTable(() => editor.chain().focus().toggleHeaderRow().run())}>切换首行表头</button>
        <i/>
        <button className="is-danger" type="button" onClick={() => runInTable(() => editor.chain().focus().deleteTable().run())}><Trash2 size={14}/>删除表格</button>
      </div>}
    </div>
    {hover && !menuOpen && <>
      <button className={`table-axis-hit-area is-${hover.axis}`} type="button" aria-label={`选中${hover.axis === 'row' ? '行' : '列'}`} onMouseDown={event => event.preventDefault()} onClick={selectAxis} style={hover.axis === 'column' ? { top: tableRect.top - 14, left: hover.rect.left, width: hover.rect.width, height: 14 } : { top: hover.rect.top, left: tableRect.left - 14, width: 14, height: hover.rect.height }}/>
      <span className={`table-insert-guide is-${hover.axis}`} style={hover.axis === 'column' ? { top: tableRect.top - 3, left: hover.after ? hover.rect.right : hover.rect.left, height: tableRect.height + 3 } : { top: hover.after ? hover.rect.bottom : hover.rect.top, left: tableRect.left - 3, width: tableRect.width + 3 }}/>
      <button className="table-insert-affordance" type="button" aria-label={`在${hover.axis === 'row' ? '此行' : '此列'}${hover.after ? '后' : '前'}插入`} title="插入" onMouseDown={event => event.preventDefault()} onClick={insertAtHover} style={hover.axis === 'column' ? { top: tableRect.top - 27, left: (hover.after ? hover.rect.right : hover.rect.left) - 12 } : { top: (hover.after ? hover.rect.bottom : hover.rect.top) - 12, left: tableRect.left - 27 }}><Plus size={14}/></button>
    </>}
    {selectionMenu && <div className="table-selection-menu" style={{ top: selectionMenu.top, left: selectionMenu.left }} onMouseDown={event => event.preventDefault()}>
      <button type="button" title="合并单元格" disabled={!editor.can().mergeCells()} onClick={() => editor.chain().focus().mergeCells().run()}><Merge size={15}/>合并</button>
      <button type="button" title="拆分单元格" disabled={!editor.can().splitCell()} onClick={() => editor.chain().focus().splitCell().run()}><Split size={15}/>拆分</button>
      <span/>
      <button type="button" title="删除当前行" onClick={() => editor.chain().focus().deleteRow().run()}><Rows3 size={15}/>删除行</button>
      <button className="is-danger" type="button" title="删除表格" onClick={() => editor.chain().focus().deleteTable().run()}><Trash2 size={15}/></button>
    </div>}
  </div>;
}
