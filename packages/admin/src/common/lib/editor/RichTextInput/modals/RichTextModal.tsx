import React, { useEffect, useRef, useState } from 'react';
import { Modal, ColorInput, NumberInput } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { v4 as uuidv4 } from 'uuid';
import { Button } from '../../../ui/Button';
import { TextInput } from '../../../ui/TextInput';
import type { User } from '../../../types';
import { RichTextInput } from '../RichTextInput';

/**
 * Rich text component appearance configuration
 */
interface RichTextConfig {
  maxWidth: number | null;
  backgroundColor: string;
  padding: number;
  borderRadius: number;
  border: string;
}

/**
 * Data passed to onSave callback
 */
export interface RichTextModalSaveData {
  richtextId: string;
  content: string;
  config: RichTextConfig;
  /** True if updating an existing richtext component, false if creating new. */
  updateRichText: boolean;
}

export interface RichTextModalProps {
  /** Controls whether the modal is visible. */
  isOpen: boolean;

  /** Callback to close the modal. */
  close: () => void;

  /** ID of the richtext component being edited (undefined for new). */
  richtextId?: string;

  /** Initial appearance configuration. */
  initialConfig?: RichTextConfig;

  /** Initial HTML content. */
  initialContent?: string;

  /** Called when the user saves the content. */
  onSave: (data: RichTextModalSaveData) => void;

  /**
   * Backend host URL.
   * Typically sourced from BackendHostURLState.
   */
  backendHost: string;

  /**
   * Currently authenticated user.
   * Typically sourced from UserState.
   */
  user: User;

  /**
   * Setter for the user state — used by underlying hooks to clear session on 401.
   * Typically sourced from UserState.
   */
  setUser: (user: User | null) => void;

  /**
   * Optional site settings for AI autocomplete features.
   * Sourced from SitePublicSettingsState in the consuming app.
   */
  siteSettings?: {
    has_openrouter_api_key?: boolean;
    ai_autocomplete_model_id?: string;
  };

  /**
   * Organization ID for HtmlComponentsModal template filtering.
   */
  organizationId?: number;
}

/**
 * Ref interface exposed by RichTextInput via forwardRef
 */
interface RichTextInputRef {
  getHTML: () => string;
}

/**
 * Default richtext component appearance configuration
 */
const DEFAULT_RICHTEXT_CONFIG: RichTextConfig = {
  maxWidth: null,
  backgroundColor: '#f5f5f5',
  padding: 16,
  borderRadius: 8,
  border: '1px solid #e0e0e0',
};

/**
 * Modal for creating and editing embedded rich text components.
 *
 * Wraps RichTextInput with a configuration panel for appearance settings.
 * Requires backendHost, user, setUser props
 * (sourced from BackendHostURLState / UserState in the consuming app).
 */
export function RichTextModal({
  isOpen,
  close,
  richtextId,
  initialConfig,
  initialContent,
  onSave,
  backendHost,
  user,
  setUser,
  siteSettings,
  organizationId,
}: RichTextModalProps) {
  const { t } = useTranslation();

  const [content, setContent] = useState('');
  const [config, setConfig] = useState<RichTextConfig>(DEFAULT_RICHTEXT_CONFIG);
  const richTextRef = useRef<RichTextInputRef | null>(null);

  useEffect(() => {
    if (isOpen) {
      setContent(initialContent || '');
      setConfig(initialConfig || DEFAULT_RICHTEXT_CONFIG);
    }
  }, [initialContent, initialConfig, isOpen]);

  /**
   * Save richtext content and close modal
   */
  const handleSave = () => {
    const htmlContent = richTextRef.current ? richTextRef.current.getHTML() : content;
    const id = richtextId || `richtext-${uuidv4()}`;

    onSave({
      richtextId: id,
      content: htmlContent,
      config,
      updateRichText: !!initialContent,
    });

    close();
  };

  return (
    <Modal
      opened={isOpen}
      onClose={close}
      title={t('Edit Rich Text Content')}
      size="xl"
      padding="md"
    >
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">{t('Content')}</h3>
          <div className="border border-gray-200 rounded-md">
            <RichTextInput
              ref={richTextRef}
              content={content}
              onChange={setContent}
              canAddImage={true}
              backendHost={backendHost}
              user={user}
              setUser={setUser}
              siteSettings={siteSettings}
              organizationId={organizationId}
            />
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">{t('Appearance')}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <NumberInput
              label={t('Max Width (px)')}
              placeholder={t('Auto')}
              value={config.maxWidth ?? ''}
              onChange={(value) =>
                setConfig({
                  ...config,
                  maxWidth: typeof value === 'number' ? value : null,
                })
              }
              min={0}
              step={10}
              allowNegative={false}
              allowDecimal={false}
            />
            <ColorInput
              label={t('Background Color')}
              value={config.backgroundColor}
              onChange={(value) => setConfig({ ...config, backgroundColor: value })}
              format="hex"
              swatches={['#f5f5f5', '#ffffff', '#f0f8ff', '#fff8e1', '#f1f8e9', '#fce4ec']}
            />
            <NumberInput
              label={t('Padding (px)')}
              value={config.padding}
              onChange={(value) =>
                setConfig({
                  ...config,
                  padding: typeof value === 'number' ? value : 16,
                })
              }
              min={0}
              max={48}
              step={2}
              allowNegative={false}
              allowDecimal={false}
            />
            <NumberInput
              label={t('Border Radius (px)')}
              value={config.borderRadius}
              onChange={(value) =>
                setConfig({
                  ...config,
                  borderRadius: typeof value === 'number' ? value : 8,
                })
              }
              min={0}
              max={24}
              step={1}
              allowNegative={false}
              allowDecimal={false}
            />
            <TextInput
              label={t('Border')}
              value={config.border}
              onChange={(e) => setConfig({ ...config, border: e.target.value })}
              placeholder="1px solid #e0e0e0"
              className="col-span-1 md:col-span-2"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <Button variant="default" onClick={close}>
            {t('Cancel')}
          </Button>
          <Button onClick={handleSave} color="blue">
            {t('Save')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
