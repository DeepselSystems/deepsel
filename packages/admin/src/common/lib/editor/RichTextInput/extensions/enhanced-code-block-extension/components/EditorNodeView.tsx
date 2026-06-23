import React, { useEffect, useRef } from 'react';
import { NodeViewContent, NodeViewWrapper } from '@tiptap/react';
import type { NodeViewProps } from '@tiptap/react';
import { Select, Tooltip } from '@mantine/core';
import { IconTrash } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { common, createLowlight } from 'lowlight';
import {
  ENHANCED_CODE_BLOCK_ATTRIBUTES,
  ENHANCED_CODE_BLOCK_CLASSES,
  getLanguageLabel,
  PROGRAMMING_LANGUAGES,
} from '../utils';

/**
 * Create lowlight instance
 */
const lowlight = createLowlight(common);

/**
 * EditorNodeView component for enhanced code block
 * Provides language selection dropdown and delete button
 */
const EditorNodeView = ({ node, updateAttributes, deleteNode }: NodeViewProps) => {
  const { t } = useTranslation();
  const { language } = node.attrs as { language: string };
  const contentRef = useRef<HTMLDivElement>(null);

  /**
   * Handle language change
   */
  const handleLanguageChange = (newLanguage: string | null) => {
    if (newLanguage) {
      updateAttributes({ language: newLanguage });
    }
  };

  /**
   * Apply syntax highlighting to the code content
   */
  useEffect(() => {
    if (!contentRef.current) return;

    const preElement = contentRef.current.querySelector('pre');
    const codeElement = preElement?.querySelector('code');

    if (!codeElement) return;

    codeElement.className = '';

    codeElement.classList.add(`language-${language}`);

    const code = codeElement.textContent || '';

    try {
      if (language && language !== 'plaintext' && lowlight.registered(language)) {
        const result = lowlight.highlight(language, code);

        codeElement.innerHTML = '';

        result.children.forEach((child) => {
          const span = document.createElement('span');
          if (child.type === 'element') {
            span.className = (child.properties.className as string[])?.join(' ') || '';
            span.textContent = child.children
              .map((c) => (c.type === 'text' ? c.value : ''))
              .join('');
          } else if (child.type === 'text') {
            span.textContent = child.value;
          }
          codeElement.appendChild(span);
        });
      }
    } catch (error) {
      console.warn('Syntax highlighting failed:', error);
    }
  }, [language, node.content]);

  return (
    <NodeViewWrapper
      className={clsx(ENHANCED_CODE_BLOCK_CLASSES.WRAPPER)}
      {...{
        [ENHANCED_CODE_BLOCK_ATTRIBUTES.CONTAINER]: 'true',
        [ENHANCED_CODE_BLOCK_ATTRIBUTES.LANGUAGE]: language,
      }}
    >
      {/* Header with language selector and controls */}
      <div
        className={clsx(
          ENHANCED_CODE_BLOCK_CLASSES.HEADER,
          'flex items-center justify-between gap-2 px-4 py-2 bg-gray-100 border border-gray-300 border-b-0 rounded-t',
        )}
      >
        {/* Language selector */}
        <Select
          value={language}
          onChange={handleLanguageChange}
          data={PROGRAMMING_LANGUAGES.map((lang) => ({
            value: lang.value,
            label: lang.label,
          }))}
          size="xs"
          className="w-48"
          searchable
          clearable={false}
        />

        {/* Language label (visible when not hovering) */}
        <span
          className={clsx(
            ENHANCED_CODE_BLOCK_CLASSES.LANGUAGE_LABEL,
            'text-sm text-gray-600 font-mono ml-auto',
          )}
        >
          {getLanguageLabel(language)}
        </span>

        {/* Delete button */}
        <Tooltip label={t('Delete Code Block')}>
          <button
            type="button"
            onClick={deleteNode}
            className="w-8 h-8 flex justify-center items-center rounded p-1 cursor-pointer hover:bg-red-100 opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <IconTrash size={16} className="text-red-500" />
          </button>
        </Tooltip>
      </div>

      {/* Code content */}
      <div
        ref={contentRef}
        className={clsx(
          ENHANCED_CODE_BLOCK_CLASSES.CONTENT,
          'border border-gray-300 rounded-b overflow-x-auto',
        )}
      >
        <NodeViewContent as="pre" className="m-0 p-4 bg-gray-50" />
      </div>
    </NodeViewWrapper>
  );
};

export default EditorNodeView;
