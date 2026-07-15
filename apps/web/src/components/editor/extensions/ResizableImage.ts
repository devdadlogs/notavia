import { Node, mergeAttributes } from '@tiptap/core';

export interface ResizableImageOptions {
  inline: boolean;
  allowBase64: boolean;
  HTMLAttributes: Record<string, any>;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    resizableImage: {
      setResizableImage: (options: {
        src: string;
        alt?: string;
        title?: string;
        width?: string;
        align?: string;
      }) => ReturnType;
    };
  }
}

export const ResizableImage = Node.create<ResizableImageOptions>({
  name: 'resizableImage',

  group: 'block',

  draggable: true,

  addOptions() {
    return {
      inline: false,
      allowBase64: true,
      HTMLAttributes: {},
    };
  },

  addAttributes() {
    return {
      src: {
        default: null,
      },
      alt: {
        default: null,
      },
      title: {
        default: null,
      },
      width: {
        default: '100%',
      },
      align: {
        default: 'center',
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'figure[data-type="resizable-image"]',
      },
      {
        tag: 'img[src]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    const { align, width, ...imgAttrs } = HTMLAttributes;
    
    const justifyMap: Record<string, string> = {
      left: 'flex-start',
      center: 'center',
      right: 'flex-end',
    };

    return [
      'figure',
      {
        'data-type': 'resizable-image',
        style: `display: flex; justify-content: ${justifyMap[align] || 'center'}; margin: 1rem 0;`,
      },
      [
        'img',
        mergeAttributes(this.options.HTMLAttributes, imgAttrs, {
          style: `width: ${width}; max-width: 100%; cursor: pointer; border-radius: 8px;`,
        }),
      ],
    ];
  },

  addCommands() {
    return {
      setResizableImage:
        (options) =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: options,
          });
        },
    };
  },

  // NodeView is handled in React component
  addNodeView() {
    return ({ node, getPos, editor }) => {
      // Create DOM
      const wrapper = document.createElement('figure');
      wrapper.setAttribute('data-type', 'resizable-image');
      wrapper.style.display = 'flex';
      wrapper.style.margin = '1rem 0';
      wrapper.style.position = 'relative';

      const updateAlign = () => {
        const justifyMap: Record<string, string> = {
          left: 'flex-start',
          center: 'center',
          right: 'flex-end',
        };
        wrapper.style.justifyContent = justifyMap[node.attrs.align] || 'center';
      };
      updateAlign();

      // Image element
      const img = document.createElement('img');
      img.src = node.attrs.src;
      img.alt = node.attrs.alt || '';
      img.title = node.attrs.title || '';
      img.style.width = node.attrs.width || '100%';
      img.style.maxWidth = '100%';
      img.style.borderRadius = '8px';
      img.style.cursor = 'pointer';
      img.style.boxShadow = '0 2px 8px rgba(0,0,0,0.08)';
      img.style.transition = 'box-shadow 0.2s';
      img.draggable = false;

      // Toolbar (hidden by default)
      const toolbar = document.createElement('div');
      toolbar.style.cssText = `
        position: absolute; top: 8px; left: 50%; transform: translateX(-50%);
        display: none; gap: 4px; padding: 4px 8px;
        background: rgba(0,0,0,0.75); border-radius: 8px; z-index: 10;
      `;

      const makeBtn = (label: string, onClick: () => void) => {
        const btn = document.createElement('button');
        btn.textContent = label;
        btn.style.cssText = `
          background: none; border: none; color: white; font-size: 12px;
          padding: 4px 8px; cursor: pointer; border-radius: 4px;
          transition: background 0.15s;
        `;
        btn.onmouseenter = () => { btn.style.background = 'rgba(255,255,255,0.2)'; };
        btn.onmouseleave = () => { btn.style.background = 'none'; };
        btn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();
          onClick();
        };
        return btn;
      };

      // Helper function to update attributes dynamically
      const updateNodeAttrs = (newAttrs: Record<string, any>) => {
        if (typeof getPos === 'function') {
          const pos = getPos();
          if (typeof pos !== 'number') return;
          const currentNode = editor.state.doc.nodeAt(pos);
          if (currentNode) {
            editor.chain().focus().command(({ tr }) => {
              tr.setNodeMarkup(pos, undefined, {
                ...currentNode.attrs,
                ...newAttrs,
              });
              return true;
            }).run();
          }
        }
      };

      // Alignment buttons
      const alignLeft = makeBtn('◀ 左', () => {
        updateNodeAttrs({ align: 'left' });
      });
      const alignCenter = makeBtn('▣ 中', () => {
        updateNodeAttrs({ align: 'center' });
      });
      const alignRight = makeBtn('▶ 右', () => {
        updateNodeAttrs({ align: 'right' });
      });

      // Size buttons
      const sep = document.createElement('span');
      sep.textContent = '|';
      sep.style.cssText = 'color: rgba(255,255,255,0.3); padding: 0 4px;';

      const sizes = [
        { label: '25%', value: '25%' },
        { label: '50%', value: '50%' },
        { label: '75%', value: '75%' },
        { label: '100%', value: '100%' },
      ];
      
      toolbar.append(alignLeft, alignCenter, alignRight, sep);
      sizes.forEach(({ label, value }) => {
        toolbar.appendChild(makeBtn(label, () => {
          updateNodeAttrs({ width: value });
        }));
      });

      // Show/hide toolbar on hover
      wrapper.onmouseenter = () => { toolbar.style.display = 'flex'; };
      wrapper.onmouseleave = () => { toolbar.style.display = 'none'; };

      // Resize handle
      const handle = document.createElement('div');
      handle.style.cssText = `
        position: absolute; bottom: 4px; right: 4px;
        width: 16px; height: 16px; cursor: nwse-resize;
        background: var(--primary-color, #10b981);
        border-radius: 4px; opacity: 0; transition: opacity 0.15s;
        display: flex; align-items: center; justify-content: center;
        font-size: 10px; color: white;
      `;
      handle.textContent = '⤡';
      wrapper.onmouseenter = () => { toolbar.style.display = 'flex'; handle.style.opacity = '1'; };
      wrapper.onmouseleave = () => { toolbar.style.display = 'none'; handle.style.opacity = '0'; };

      // Drag resize
      let startX = 0;
      let startWidth = 0;

      handle.onmousedown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        startX = e.clientX;
        startWidth = img.offsetWidth;

        const onMouseMove = (e: MouseEvent) => {
          const diff = e.clientX - startX;
          const parentWidth = wrapper.parentElement?.offsetWidth || 800;
          const newWidth = Math.max(100, Math.min(parentWidth, startWidth + diff));
          const pct = Math.round((newWidth / parentWidth) * 100);
          img.style.width = `${pct}%`;
        };

        const onMouseUp = () => {
          document.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('mouseup', onMouseUp);
          // Persist the new width
          const parentWidth = wrapper.parentElement?.offsetWidth || 800;
          const pct = Math.round((img.offsetWidth / parentWidth) * 100);
          updateNodeAttrs({ width: `${pct}%` });
        };

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      };

      // Build container with relative positioning for handle
      const imgContainer = document.createElement('div');
      imgContainer.style.position = 'relative';
      imgContainer.style.display = 'inline-block';
      imgContainer.appendChild(img);
      imgContainer.appendChild(handle);

      wrapper.appendChild(toolbar);
      wrapper.appendChild(imgContainer);

      return {
        dom: wrapper,
        update: (updatedNode) => {
          if (updatedNode.type.name !== this.name) return false;
          // Sync attrs
          img.src = updatedNode.attrs.src;
          img.alt = updatedNode.attrs.alt || '';
          img.title = updatedNode.attrs.title || '';
          img.style.width = updatedNode.attrs.width || '100%';
          // Update alignment
          const justifyMap: Record<string, string> = {
            left: 'flex-start',
            center: 'center',
            right: 'flex-end',
          };
          wrapper.style.justifyContent = justifyMap[updatedNode.attrs.align] || 'center';
          return true;
        },
        destroy: () => {
          // cleanup
        },
      };
    };
  },
});
