import React, { useEffect, useState, useRef } from 'react';
import { Editor } from '@tiptap/react';
import { Trash2, Plus, Copy, Grip } from 'lucide-react';
import { TextSelection } from '@tiptap/pm/state';
import { CellSelection } from '@tiptap/pm/tables';

interface TableHoverControlsProps {
  editor: Editor | null;
}

type HoverState = {
  type: 'row' | 'col';
  index: number;
  cell: HTMLTableCellElement;
  rect: DOMRect;
  isSecondarySide: boolean;
};

export function TableHoverControls({ editor }: TableHoverControlsProps) {
  const [tableElement, setTableElement] = useState<HTMLTableElement | null>(null);
  const [tableRect, setTableRect] = useState<DOMRect | null>(null);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [hoverState, setHoverState] = useState<HoverState | null>(null);

  const hideTimeoutRef = useRef<any>(null);

  const tableInfoRef = useRef<{
    table: HTMLTableElement;
    rect: DOMRect;
    rowRects: { cell: HTMLTableCellElement, rect: DOMRect }[];
    colRects: { cell: HTMLTableCellElement, rect: DOMRect }[];
  } | null>(null);

  useEffect(() => {
    if (!tableElement) return;
    const observer = new ResizeObserver(() => {
      // Invalidate cache on resize so the next mousemove recalculates accurately
      tableInfoRef.current = null;
    });
    observer.observe(tableElement);
    return () => observer.disconnect();
  }, [tableElement]);

  useEffect(() => {
    if (!editor || !editor.view.dom) return;

    const handleMouseMove = (e: MouseEvent) => {
      if (isMenuOpen) return;
      const target = e.target as HTMLElement;

      const table = target.closest('table') as HTMLTableElement;

      if (table) {
        if (tableInfoRef.current?.table !== table) {
          if (tableInfoRef.current) tableInfoRef.current.table.classList.remove('table-hovered');
          table.classList.add('table-hovered');
          setTableElement(table);
          
          const rect = table.getBoundingClientRect();
          setTableRect(rect);

          const rowsArray = Array.from(table.querySelectorAll('tr'));
          const newRowRects = rowsArray.map(r => ({
            cell: r.firstElementChild as HTMLTableCellElement,
            rect: r.getBoundingClientRect()
          }));
          const colsArray = Array.from(rowsArray[0].querySelectorAll('th, td'));
          const newColRects = colsArray.map(c => ({
            cell: c as HTMLTableCellElement,
            rect: c.getBoundingClientRect()
          }));

          tableInfoRef.current = { table, rect, rowRects: newRowRects, colRects: newColRects };
        }
      }

      let keepState = false;
      if (target.closest('.table-insert-btn')) {
        keepState = true;
      }

      let newState: HoverState | null = null;

      if (tableInfoRef.current && !keepState) {
        const { rect, rowRects, colRects } = tableInfoRef.current;
        
        // Col detection (hover near top edge of the table)
        if (Math.abs(e.clientY - rect.top) < 15) {
          const index = colRects.findIndex(c => e.clientX >= c.rect.left && e.clientX <= c.rect.right);
          if (index !== -1) {
            const cellInfo = colRects[index];
            const isRight = e.clientX > cellInfo.rect.left + cellInfo.rect.width / 2;
            newState = { type: 'col', index, cell: cellInfo.cell, rect: cellInfo.rect, isSecondarySide: isRight };
          }
        }
        
        // Row detection (hover near left edge of the table)
        if (!newState && Math.abs(e.clientX - rect.left) < 15) {
          const index = rowRects.findIndex(r => e.clientY >= r.rect.top && e.clientY <= r.rect.bottom);
          if (index !== -1) {
            const cellInfo = rowRects[index];
            const isBottom = e.clientY > cellInfo.rect.top + cellInfo.rect.height / 2;
            newState = { type: 'row', index, cell: cellInfo.cell, rect: cellInfo.rect, isSecondarySide: isBottom };
          }
        }
      }

      // Hide interactions if hovering Grip or Menu
      if (target.closest('.table-grip-wrapper') || target.closest('.table-menu-popup')) {
        newState = null;
        keepState = false;
      }

      if (!keepState) {
        setHoverState(newState);
      }

      let isOperableArea = false;
      if (table || target.closest('.table-insert-btn') || target.closest('.table-grip-wrapper') || target.closest('.table-menu-popup')) {
        isOperableArea = true;
      } else if (tableInfoRef.current) {
        const { rect } = tableInfoRef.current;
        if (
          e.clientX >= rect.left - 40 &&
          e.clientX <= rect.right + 20 &&
          e.clientY >= rect.top - 40 &&
          e.clientY <= rect.bottom + 20
        ) {
          isOperableArea = true;
        }
      }

      if (isOperableArea) {
        clearTimeout(hideTimeoutRef.current);
      } else {
        clearTimeout(hideTimeoutRef.current);
        hideTimeoutRef.current = setTimeout(() => {
          if (tableInfoRef.current) tableInfoRef.current.table.classList.remove('table-hovered');
          if (tableElement) tableElement.classList.remove('table-hovered'); 
          setTableElement(null);
          setHoverState(null);
          tableInfoRef.current = null;
        }, 150);
      }
    };

    const handleGlobalClick = (e: MouseEvent) => {
      if (isMenuOpen) {
        if (!(e.target as HTMLElement).closest('.table-menu-popup')) {
          setIsMenuOpen(false);
          if (tableInfoRef.current) tableInfoRef.current.table.classList.remove('table-hovered');
          if (tableElement) tableElement.classList.remove('table-hovered'); 
          setTableElement(null); 
        }
      }
    };

    const handleScroll = () => {
      if (tableInfoRef.current) tableInfoRef.current.table.classList.remove('table-hovered');
      setTableElement(null);
      setHoverState(null);
      setIsMenuOpen(false);
      tableInfoRef.current = null;
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('click', handleGlobalClick);
    window.addEventListener('scroll', handleScroll, true);

    return () => {
      clearTimeout(hideTimeoutRef.current);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('click', handleGlobalClick);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [editor, isMenuOpen]);

  if (!editor || !tableElement || !tableRect) return null;

  const setCursorToElement = (element: HTMLElement) => {
    try {
      const pos = editor.view.posAtDOM(element, 0);
      const resolved = editor.view.state.doc.resolve(pos);
      // Force selection strictly inside the cell by searching forwards from the start of the cell
      const selection = TextSelection.findFrom(resolved, 1, true) || TextSelection.near(resolved);
      if (selection) {
        editor.view.dispatch(editor.view.state.tr.setSelection(selection));
        editor.view.focus();
        console.log('[TableHover] setCursorToElement success. pos:', pos);
      } else {
        console.warn('[TableHover] setCursorToElement failed to find a valid selection near pos:', pos);
      }
    } catch (err) {
      console.error('[TableHover] setCursorToElement error (likely stale DOM node):', err);
    }
  };

  const selectRowOrCol = (cell: HTMLElement, type: 'row' | 'col') => {
    try {
      const pos = editor.view.posAtDOM(cell, 0);
      const $pos = editor.view.state.doc.resolve(pos);
      
      // $pos is inside the td/th. We need to find the node position of the td/th.
      // A table cell is usually at depth - 1 (since $pos might be inside a paragraph inside the cell)
      // We search up the resolved position to find the cell node.
      let cellPos = pos;
      for (let d = $pos.depth; d > 0; d--) {
        if ($pos.node(d).type.name === 'tableCell' || $pos.node(d).type.name === 'tableHeader') {
          cellPos = $pos.before(d);
          break;
        }
      }

      const $cellPos = editor.view.state.doc.resolve(cellPos);
      const selection = type === 'row' ? CellSelection.rowSelection($cellPos) : CellSelection.colSelection($cellPos);
      
      editor.view.dispatch(editor.view.state.tr.setSelection(selection as any));
      editor.view.focus();
    } catch (e) {
      console.error('[TableHover] selectRowOrCol error:', e);
    }
  };

  const copyTable = () => {
    try {
      const pos = editor.view.posAtDOM(tableElement, 0);
      editor.commands.setNodeSelection(pos - 1);
      setTimeout(() => document.execCommand('copy'), 50);
      setIsMenuOpen(false);
    } catch (err) {}
  };

  const cutTable = () => {
    try {
      const pos = editor.view.posAtDOM(tableElement, 0);
      editor.commands.setNodeSelection(pos - 1);
      setTimeout(() => {
        document.execCommand('copy');
        editor.commands.deleteTable();
      }, 50);
      setIsMenuOpen(false);
    } catch (err) {}
  };

  return (
    <div 
      className="table-hover-controls"
      style={{ position: 'fixed', zIndex: 100, top: 0, left: 0, pointerEvents: 'none' }}
    >
      <div 
        className="table-grip-wrapper"
        style={{
        position: 'absolute',
        top: tableRect.top - 34,
        left: tableRect.left - 34,
        width: '36px', height: '36px',
        pointerEvents: 'auto',
      }}>
        <button 
          style={{
            position: 'absolute', top: '8px', left: '8px',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: 'none', background: '#f1f3f5', width: '22px', height: '22px', borderRadius: '4px',
            cursor: 'pointer', color: '#888', boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
          }} 
          title="点击打开操作菜单"
          onClick={(e) => {
            e.stopPropagation();
            setIsMenuOpen(!isMenuOpen);
          }}
        ><Grip size={14} /></button>

        {isMenuOpen && (
          <div className="table-menu-popup" style={{ position: 'absolute', top: '40px', left: 0, zIndex: 200 }}>
            <div className="menu-group-title">操作</div>
            <button className="menu-item-btn" onClick={copyTable}>复制</button>
            <button className="menu-item-btn" onClick={cutTable}>剪切</button>
            <button className="menu-item-btn danger" onClick={() => { setCursorToElement(tableElement); editor.chain().focus().deleteTable().run(); setIsMenuOpen(false); tableInfoRef.current = null; }}>删除</button>
            <div className="menu-divider"></div>
            <button className="menu-item-btn" onClick={() => { setCursorToElement(tableElement); editor.chain().focus().addRowBefore().run(); setIsMenuOpen(false); tableInfoRef.current = null; }}>在上方添加行</button>
            <button className="menu-item-btn" onClick={() => { setCursorToElement(tableElement); editor.chain().focus().addRowAfter().run(); setIsMenuOpen(false); tableInfoRef.current = null; }}>在下方添加行</button>
            <button className="menu-item-btn" onClick={() => { setCursorToElement(tableElement); editor.chain().focus().addColumnBefore().run(); setIsMenuOpen(false); tableInfoRef.current = null; }}>在左侧添加列</button>
            <button className="menu-item-btn" onClick={() => { setCursorToElement(tableElement); editor.chain().focus().addColumnAfter().run(); setIsMenuOpen(false); tableInfoRef.current = null; }}>在右侧添加列</button>
          </div>
        )}
      </div>

      {hoverState && !isMenuOpen && (
        <>
          <div 
            onClick={() => selectRowOrCol(hoverState.cell, hoverState.type)}
            style={{
              position: 'absolute',
              backgroundColor: '#8c8c8c',
              cursor: 'pointer',
              zIndex: 10,
              pointerEvents: 'auto',
              ...(hoverState.type === 'col' 
                ? { top: tableRect.top - 4, left: hoverState.rect.left, width: hoverState.rect.width, height: '5px' }
                : { top: hoverState.rect.top, left: tableRect.left - 4, width: '5px', height: hoverState.rect.height })
            }}
          />

          <div style={{
            position: 'absolute',
            backgroundColor: '#1677ff',
            pointerEvents: 'none',
            zIndex: 9,
            ...(hoverState.type === 'col'
              ? { 
                  top: tableRect.top - 4, 
                  height: tableRect.height + 4, 
                  width: '2px', 
                  left: hoverState.isSecondarySide ? hoverState.rect.right - 1 : hoverState.rect.left - 1 
                }
              : { 
                  left: tableRect.left - 4, 
                  width: tableRect.width + 4, 
                  height: '2px', 
                  top: hoverState.isSecondarySide ? hoverState.rect.bottom - 1 : hoverState.rect.top - 1 
                })
          }} />

          <div
            className="table-insert-btn"
            onClick={() => {
              console.log(`[TableHover] Clicked + button. Type: ${hoverState.type}, Index: ${hoverState.index}, isSecondary: ${hoverState.isSecondarySide}`);
              const table = tableInfoRef.current?.table || tableElement;
              if (!table) return;

              let freshTargetCell: HTMLElement | null = null;
              const rows = Array.from(table.querySelectorAll('tr'));
              
              if (hoverState.type === 'col') {
                if (rows.length > 0) {
                  const cells = Array.from(rows[0].querySelectorAll('th, td'));
                  freshTargetCell = cells[hoverState.index] as HTMLElement;
                }
              } else {
                if (rows.length > hoverState.index) {
                  freshTargetCell = rows[hoverState.index].firstElementChild as HTMLElement;
                }
              }

              if (!freshTargetCell) {
                console.error("[TableHover] Could not find fresh target cell in DOM.");
                return;
              }

              // Use the dynamically queried cell to avoid 'Node is not in document' errors
              setCursorToElement(freshTargetCell);
              
              const isAfter = hoverState.isSecondarySide;
              const index = hoverState.index;
              const targetIndex = isAfter ? index + 1 : index;

              if (hoverState.type === 'col') {
                if (isAfter) editor.chain().focus().addColumnAfter().run();
                else editor.chain().focus().addColumnBefore().run();
                
                setTimeout(() => {
                  const currentRows = Array.from(table.querySelectorAll('tr'));
                  if (currentRows.length > 0) {
                    const targetCell = currentRows[0].children[targetIndex] as HTMLElement;
                    if (targetCell) setCursorToElement(targetCell);
                  }
                }, 50);
              } else {
                if (isAfter) editor.chain().focus().addRowAfter().run();
                else editor.chain().focus().addRowBefore().run();
                
                setTimeout(() => {
                  const currentRows = Array.from(table.querySelectorAll('tr'));
                  if (currentRows.length > targetIndex) {
                    const targetCell = currentRows[targetIndex].children[0] as HTMLElement;
                    if (targetCell) setCursorToElement(targetCell);
                  }
                }, 50);
              }
              setHoverState(null);
              tableInfoRef.current = null; // Clear cache immediately so next movement accurately renders new guides
            }}
            style={{
              position: 'absolute',
              width: '24px', height: '24px',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
              pointerEvents: 'auto',
              zIndex: 11,
              ...(hoverState.type === 'col'
                ? { 
                    top: tableRect.top - 24, 
                    left: (hoverState.isSecondarySide ? hoverState.rect.right : hoverState.rect.left) - 12 
                  }
                : { 
                    left: tableRect.left - 24, 
                    top: (hoverState.isSecondarySide ? hoverState.rect.bottom : hoverState.rect.top) - 12 
                  })
            }}
          >
            <button className="table-insert-btn-inner" title="插入">
              <Plus size={12} />
            </button>
          </div>
        </>
      )}
    </div>
  );
}
