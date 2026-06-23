import { mergeAttributes, Node } from '@tiptap/core';
import type { Command } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';

interface RichTextConfig {
  maxWidth: number | null;
  backgroundColor: string;
  padding: number;
  borderRadius: number;
  border: string;
}

interface RichTextAttributes {
  richtextId: string | null;
  content: string;
  config: RichTextConfig;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    richtext: {
      setRichText: (attributes: Partial<RichTextAttributes>) => ReturnType;
      updateRichText: (attributes: Partial<RichTextAttributes>) => ReturnType;
    };
  }
}

export const RichText = Node.create({
  name: 'richtext',

  addAttributes() {
    return {
      richtextId: {
        default: null,
      },
      content: {
        default: '',
      },
      config: {
        default: {
          maxWidth: null,
          backgroundColor: '#f5f5f5',
          padding: 16,
          borderRadius: 8,
          border: '1px solid #e0e0e0',
        },
      },
    };
  },

  group: 'block',
  content: '',
  marks: '',
  selectable: true,
  draggable: true,
  isolating: true,

  parseHTML() {
    return [
      {
        tag: 'div[data-type="richtext"]',
        getAttrs: (node) => {
          if (!(node instanceof HTMLElement)) return {};

          try {
            const configStr = node.getAttribute('data-config');
            const content = node.getAttribute('data-content');

            const parsedConfig = configStr
              ? JSON.parse(configStr)
              : {
                  maxWidth: null,
                  backgroundColor: '#f5f5f5',
                  padding: 16,
                  borderRadius: 8,
                  border: '1px solid #e0e0e0',
                };

            return {
              config: parsedConfig,
              content: content || '',
              richtextId: node.getAttribute('data-richtext-id') || null,
            };
          } catch (error) {
            console.error('Error parsing richtext attributes:', error);
            return {};
          }
        },
      },
    ];
  },

  renderHTML({ node }) {
    const config = (node.attrs.config as RichTextConfig) || {
      maxWidth: null,
      backgroundColor: '#f5f5f5',
      padding: 16,
      borderRadius: 8,
      border: '1px solid #e0e0e0',
    };
    const content = node.attrs.content || '';
    const richtextId = node.attrs.richtextId || null;

    const dataAttrs = {
      'data-type': 'richtext',
      'data-richtext-id': richtextId,
      'data-config': JSON.stringify(config),
      'data-content': content,
    };

    if (typeof window === 'undefined') {
      return ['div', mergeAttributes(dataAttrs)];
    }

    const richtextStyle: Record<string, string> = {
      margin: '1rem 0',
      padding: `${config.padding}px`,
      'background-color': config.backgroundColor,
      'border-radius': `${config.borderRadius}px`,
      border: config.border,
      ...(config.maxWidth ? { 'max-width': `${config.maxWidth}px`, margin: '1rem auto' } : {}),
    };

    const styleStr = Object.entries(richtextStyle)
      .map(([key, value]) => `${key}: ${value};`)
      .join(' ');

    const richtextAttrs = {
      ...dataAttrs,
      class: 'richtext-container',
      style: styleStr,
    };

    return [
      'div',
      mergeAttributes(richtextAttrs),
      ['div', { class: 'richtext-content' }, content],
      [
        'script',
        {},
        `(function() {
          const script = document.currentScript;
          const container = script.parentNode;
          const contentDiv = container.querySelector('.richtext-content');
          if (contentDiv) {
            const htmlContent = contentDiv.textContent || contentDiv.innerText;
            if (htmlContent && htmlContent.trim().startsWith('<')) {
              contentDiv.innerHTML = htmlContent;
            }
          }
          script.parentNode.removeChild(script);
        })();`,
      ],
    ];
  },

  addCommands() {
    return {
      setRichText:
        (attributes: Partial<RichTextAttributes>): Command =>
        ({ commands }) => {
          return commands.insertContent({
            type: this.name,
            attrs: attributes,
          });
        },
      updateRichText:
        (attributes: Partial<RichTextAttributes>): Command =>
        ({ commands, editor }) => {
          if (editor.isActive(this.name)) {
            return commands.updateAttributes(this.name, attributes);
          }
          return false;
        },
    };
  },

  addNodeView() {
    return ({ node, editor, getPos }) => {
      const dom = document.createElement('div');
      dom.classList.add('richtext-container');

      let config: RichTextConfig = {
        maxWidth: null,
        backgroundColor: '#f5f5f5',
        padding: 16,
        borderRadius: 8,
        border: '1px solid #e0e0e0',
      };
      let content = '';

      if (node.attrs.config) {
        config =
          typeof node.attrs.config === 'string' ? JSON.parse(node.attrs.config) : node.attrs.config;
      }

      if (node.attrs.content) {
        content = node.attrs.content;
      }

      dom.style.margin = '1rem 0';
      dom.style.padding = `${config.padding}px`;
      dom.style.backgroundColor = config.backgroundColor;
      dom.style.borderRadius = `${config.borderRadius}px`;
      dom.style.border = config.border;

      if (config.maxWidth) {
        dom.style.maxWidth = `${config.maxWidth}px`;
        dom.style.margin = '1rem auto';
      }

      const contentContainer = document.createElement('div');
      contentContainer.classList.add('richtext-content');

      if (content) {
        contentContainer.innerHTML = content;
      }

      dom.appendChild(contentContainer);

      const editButton = document.createElement('button');
      editButton.classList.add('richtext-edit-button');
      editButton.setAttribute('type', 'button');
      editButton.innerHTML = 'Edit Content';
      editButton.style.position = 'absolute';
      editButton.style.top = '10px';
      editButton.style.right = '10px';
      editButton.style.backgroundColor = 'white';
      editButton.style.border = '1px solid #ddd';
      editButton.style.borderRadius = '4px';
      editButton.style.padding = '4px 8px';
      editButton.style.fontSize = '12px';
      editButton.style.cursor = 'pointer';
      editButton.style.display = 'none';
      editButton.style.zIndex = '10';

      dom.addEventListener('mouseenter', () => {
        editButton.style.display = 'block';
      });

      dom.addEventListener('mouseleave', () => {
        editButton.style.display = 'none';
      });

      editButton.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();

        const event = new CustomEvent('editRichText', {
          detail: {
            richtextId: node.attrs.richtextId,
            config: node.attrs.config,
            content: node.attrs.content || '',
            updateRichText: (newAttrs: Partial<RichTextAttributes>) => {
              const pos = getPos();
              if (typeof pos === 'number') {
                const transaction = editor.view.state.tr.setNodeMarkup(pos, undefined, {
                  ...node.attrs,
                  ...newAttrs,
                });
                editor.view.dispatch(transaction);
              }
            },
          },
        });
        window.dispatchEvent(event);
      });

      dom.style.position = 'relative';
      dom.appendChild(editButton);

      return {
        dom,
        update: (updatedNode) => {
          if (updatedNode.type.name !== 'richtext') return false;

          let updatedConfig: RichTextConfig = {
            maxWidth: null,
            backgroundColor: '#f5f5f5',
            padding: 16,
            borderRadius: 8,
            border: '1px solid #e0e0e0',
          };
          let updatedContent = '';

          if (updatedNode.attrs.config) {
            updatedConfig =
              typeof updatedNode.attrs.config === 'string'
                ? JSON.parse(updatedNode.attrs.config)
                : updatedNode.attrs.config;
          }

          if (updatedNode.attrs.content) {
            updatedContent = updatedNode.attrs.content;
          }

          dom.style.padding = `${updatedConfig.padding}px`;
          dom.style.backgroundColor = updatedConfig.backgroundColor;
          dom.style.borderRadius = `${updatedConfig.borderRadius}px`;
          dom.style.border = updatedConfig.border;

          if (updatedConfig.maxWidth) {
            dom.style.maxWidth = `${updatedConfig.maxWidth}px`;
          } else {
            dom.style.maxWidth = '';
          }

          if (updatedContent) {
            contentContainer.innerHTML = updatedContent;
          } else {
            contentContainer.innerHTML = '';
          }

          return true;
        },
        destroy: () => {
          dom.removeEventListener('mouseenter', () => {});
          dom.removeEventListener('mouseleave', () => {});
          editButton.removeEventListener('click', () => {});
        },
      };
    };
  },

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey('richtextPlugin'),
        view: () => ({
          update: () => {
            setTimeout(() => {
              const richtextContainers = document.querySelectorAll('.richtext-container');
              richtextContainers.forEach((container) => {
                const contentDiv = container.querySelector('.richtext-content');
                if (contentDiv) {
                  const htmlContent =
                    contentDiv.textContent || (contentDiv as HTMLElement).innerText;
                  if (htmlContent && htmlContent.trim().startsWith('<')) {
                    (contentDiv as HTMLElement).innerHTML = htmlContent;
                  }
                }
              });
            }, 0);
            return true;
          },
        }),
      }),
    ];
  },
});

export default RichText;
