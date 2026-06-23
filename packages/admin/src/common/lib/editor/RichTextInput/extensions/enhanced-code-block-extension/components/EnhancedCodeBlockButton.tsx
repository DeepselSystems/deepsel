import React from 'react';
import type { Editor } from '@tiptap/core';
import { Tooltip } from '@mantine/core';
import { useTranslation } from 'react-i18next';

interface EnhancedCodeBlockButtonProps {
  editor: Editor | null;
  children?: React.ReactNode;
}

/**
 * Button to insert code block into the editor
 *
 * @constructor
 */
const EnhancedCodeBlockButton = ({ editor, children }: EnhancedCodeBlockButtonProps) => {
  const { t } = useTranslation();

  /**
   * Handle click to insert code block
   */
  const handleClick = () => {
    if (editor) {
      editor.chain().focus().toggleEnhancedCodeBlock({ language: 'javascript' }).run();
    }
  };

  return (
    <Tooltip label={t('Insert Code Block')}>
      <button type="button" onClick={handleClick}>
        {children || <div className="text-gray-500 text-xs px-0.5">&#123;...&#125;</div>}
      </button>
    </Tooltip>
  );
};

export default EnhancedCodeBlockButton;
