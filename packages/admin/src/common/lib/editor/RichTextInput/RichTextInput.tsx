import React, {
  forwardRef,
  useImperativeHandle,
  useState,
  useEffect,
  useRef,
  useMemo,
} from 'react';
import './extensions/styles/base.css';
import './extensions/styles/custom-paragraph.css';
import './extensions/styles/embed-audio.css';
import './extensions/styles/embed-files.css';
import './extensions/styles/embed-video.css';
import './extensions/styles/enhanced-code-block.css';
import './extensions/styles/enhanced-image.css';
import './extensions/styles/jinja2.css';
import './extensions/styles/prose-mirror-collapse.css';
import './extensions/styles/youtube-jump-marks.css';
import {
  IconPlus,
  IconMinus,
  IconLibraryPhoto,
  IconTable,
  IconArrowLeft,
  IconArrowRight,
  IconArrowUp,
  IconArrowDown,
  IconTrash,
  IconX,
  IconChevronDown,
  IconCube,
  IconBrandYoutube,
  IconDots,
} from '@tabler/icons-react';
import { useDisclosure } from '@mantine/hooks';
import { Link, RichTextEditor as MantineRichTextEditor } from '@mantine/tiptap';
import Highlight from '@tiptap/extension-highlight';
import SubScript from '@tiptap/extension-subscript';
import Superscript from '@tiptap/extension-superscript';
import TextAlign from '@tiptap/extension-text-align';
import Underline from '@tiptap/extension-underline';
import Youtube from '@tiptap/extension-youtube';
import Table from '@tiptap/extension-table';
import TableRow from '@tiptap/extension-table-row';
import TableHeader from '@tiptap/extension-table-header';
import TableCell from '@tiptap/extension-table-cell';
import Placeholder from '@tiptap/extension-placeholder';
import { useEditor, BubbleMenu, FloatingMenu } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import FontSize from 'tiptap-extension-font-size';
import TextStyle from '@tiptap/extension-text-style';
import { Menu, Modal, NumberInput, Tooltip } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { Button } from '../../ui';
import { YoutubeJumpMarks } from './extensions/youtube-jumpmarks-extension';
import { EnhancedDetails, DetailsContent, DetailsSummary } from './extensions/details-extension';
import { AutocompleteExtension } from './extensions/autocomplete-extension';
import { RichText } from './extensions/richtext-extension';
import { Gallery } from './extensions/gallery-extension';
import { EnhancedImage } from './extensions/enhanced-image-extension';
import { EnhancedCodeBlock } from './extensions/enhanced-code-block-extension';
import { PasteHandler } from './extensions/paste-handler-extension';
import { CustomParagraph } from './extensions/custom-paragraph-extension';
import { AuthenticatedContent } from './extensions/authenticated-content-extension';
import { jinja2Markdown } from './extensions/jinja2-markdown-extension';
import { EmbedVideo } from './extensions/embed-video-extension';
import { EmbedAudio } from './extensions/embed-audio-extension';
import { EmbedFiles } from './extensions/embed-files-extension';
import EmbedVideoButton from './extensions/embed-video-extension/components/EmbedVideoButton';
import EmbedAudioButton from './extensions/embed-audio-extension/components/EmbedAudioButton';
import EmbedFilesButton from './extensions/embed-files-extension/components/EmbedFilesButton';
import EnhancedImageButton from './extensions/enhanced-image-extension/components/EnhancedImageButton';
import EnhancedCodeBlockButton from './extensions/enhanced-code-block-extension/components/EnhancedCodeBlockButton';
import AuthenticatedContentButton from './extensions/authenticated-content-extension/components/AuthenticatedContentButton';
import JumpMarksModal from './extensions/youtube-jumpmarks-extension/components/JumpMarksModal';
import { GalleryModal } from './modals/GalleryModal';
import type { GalleryAttachment, GalleryModalSaveData } from './modals/GalleryModal';
import { RichTextModal } from './modals/RichTextModal';
import type { RichTextModalSaveData } from './modals/RichTextModal';
import { HtmlComponentsModal } from '../../ui';
import type { User } from '../../types';
import type { NotifyFn } from '../../types';
import type { JumpMarkData } from './extensions/youtube-jumpmarks-extension/types';
import { Language } from '@deepsel/cms-utils';

/**
 * Optional site settings for AI autocomplete features
 */
interface SiteSettings {
  has_openrouter_api_key?: boolean;
  ai_autocomplete_model_id?: string;
}

/**
 * Ref handle exposed by RichTextInput via forwardRef
 */
export interface RichTextInputRef {
  getHTML: () => string;
}

export interface RichTextInputProps {
  /** Initial HTML content for the editor. */
  content?: string;

  /** Optional label rendered above the editor. */
  label?: string;

  /** Called whenever the editor content changes, with the new HTML string. */
  onChange?: (html: string) => void;

  /** Whether to show image/media/table insert toolbar buttons. */
  canAddImage?: boolean;

  /** Override callback for image insertion (also called alongside default behavior). */
  onAddImageOverride?: (url: string) => void;

  /** Mantine RichTextEditor variant. */
  variant?: string;

  /** Current locale */
  locale?: Language;

  /** Whether to enable AI autocomplete (requires siteSettings with API key). */
  autoComplete?: boolean;

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
   * When provided, enables AI autocomplete if has_openrouter_api_key and ai_autocomplete_model_id are set.
   * Sourced from SitePublicSettingsState in the consuming app.
   */
  siteSettings?: SiteSettings;

  /**
   * Organization ID for filtering HTML template components in HtmlComponentsModal.
   * Defaults to 0 (no filter).
   */
  organizationId?: number;

  /** Additional className passed to the Mantine RichTextEditor. */
  className?: string;

  /**
   * Callback to display toast/snackbar notifications (e.g. upload progress/errors).
   * Passed through to the PasteHandler extension for file-paste upload feedback.
   * Sourced from the consuming app's notification store
   * (e.g. `NotificationState.getState().notify`).
   */
  notify?: NotifyFn;
}

/**
 * Default font size value
 */
const DEFAULT_FONT_SIZE = '12';

/**
 * Default table dimensions for insertion
 */
const DEFAULT_TABLE_ROWS = 3;
const DEFAULT_TABLE_COLS = 3;

/**
 * Delay in ms before creating a paragraph near inserted content
 */
const PARAGRAPH_CREATION_DELAY_MS = 300;

/**
 * Gallery state for the gallery modal (includes optional updateGallery function from node view)
 */
interface GalleryState {
  galleryId?: string | number | null;
  config?: GalleryModalSaveData['config'];
  attachments?: GalleryAttachment[];
  updateGallery?: (data: Partial<GalleryModalSaveData>) => void;
}

/**
 * RichText state for the richtext modal (includes optional updateRichText function from node view)
 */
interface RichTextState {
  richtextId?: string;
  config?: RichTextModalSaveData['config'];
  content?: string;
  updateRichText?: (data: Partial<RichTextModalSaveData>) => void;
}

/**
 * Full-featured rich text editor with image, gallery, video, audio, file, YouTube,
 * collapsible sections, code blocks, tables, and AI autocomplete support.
 *
 * Requires backendHost, user, setUser props
 * (sourced from BackendHostURLState / UserState in the consuming app).
 */
export const RichTextInput = forwardRef<RichTextInputRef, RichTextInputProps>((props, ref) => {
  const {
    content = '',
    label,
    onChange = () => {},
    canAddImage = true,
    onAddImageOverride = () => {},
    variant = 'subtle',
    locale,
    autoComplete = false,
    backendHost,
    user,
    setUser,
    siteSettings,
    organizationId = 0,
    className,
    notify,
    ...restProps
  } = props;
  const { t } = useTranslation();

  const [isGalleryModalOpened, { open: openGalleryModal, close: closeGalleryModal }] =
    useDisclosure(false);

  const [fontSize, setFontSize] = useState(DEFAULT_FONT_SIZE);
  const [galleryData, setGalleryData] = useState<GalleryState | null>(null);
  const [richTextData, setRichTextData] = useState<RichTextState | null>(null);
  const [isInsideCollapse, setIsInsideCollapse] = useState(false);

  const [isRichTextModalOpened, { open: openRichTextModal, close: closeRichTextModal }] =
    useDisclosure(false);

  const [isTableModalOpened, { open: openTableModal, close: closeTableModal }] =
    useDisclosure(false);
  const [tableRows, setTableRows] = useState(DEFAULT_TABLE_ROWS);
  const [tableCols, setTableCols] = useState(DEFAULT_TABLE_COLS);

  const [isJumpMarksModalOpened, { open: openJumpMarksModal, close: closeJumpMarksModal }] =
    useDisclosure(false);
  const [jumpMarksData, setJumpMarksData] = useState<JumpMarkData | null>(null);
  const [showInsertTools, setShowInsertTools] = useState(false);

  const [
    isHtmlComponentsModalOpened,
    { open: openHtmlComponentsModal, close: closeHtmlComponentsModal },
  ] = useDisclosure(false);

  // Check if AI features are available
  const isAIAvailable = useMemo(() => {
    return (
      autoComplete &&
      siteSettings?.has_openrouter_api_key &&
      siteSettings?.ai_autocomplete_model_id &&
      user?.token &&
      backendHost
    );
  }, [autoComplete, siteSettings, user, backendHost]);

  const editorRef = useRef<ReturnType<typeof useEditor>>(null);

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({
          paragraph: false,
          codeBlock: false,
        }),
        CustomParagraph,
        Underline,
        Link,
        Superscript,
        SubScript,
        Highlight,
        TextAlign.configure({ types: ['heading', 'paragraph'] }),
        EnhancedImage.configure({ locale: locale?.iso_code }),
        EnhancedCodeBlock,
        Youtube,
        YoutubeJumpMarks,
        FontSize,
        TextStyle,
        Gallery.configure({ backendHost, locale: locale?.iso_code }),
        RichText,
        Table.configure({
          resizable: true,
        }),
        TableRow,
        TableHeader,
        TableCell,
        EnhancedDetails,
        DetailsSummary,
        DetailsContent,
        Placeholder,
        EmbedVideo,
        EmbedAudio,
        EmbedFiles.configure({
          backendHost,
          user,
          setUser,
          locale: locale?.iso_code,
        }),
        PasteHandler.configure({
          backendHost,
          token: user?.token,
          organizationId,
          notify,
          locale: locale?.iso_code,
          currentLocaleId: locale?.id,
        }),
        AuthenticatedContent,
        jinja2Markdown,
        ...(isAIAvailable
          ? [
              AutocompleteExtension.configure({
                backendHost,
                token: user?.token,
                enabled: true,
              }),
            ]
          : []),
      ],
      content,
      onUpdate({ editor: e }) {
        if (e) {
          onChange(e.getHTML());
        }
      },
      editorProps: {
        attributes: {
          class: '!p-0',
        },
      },
    },
    [isAIAvailable, backendHost, user?.token],
  );

  // Update editorRef when editor is created
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  /**
   * Get the current HTML content from the editor
   */
  function getHTML() {
    return editor ? editor.getHTML() : '';
  }

  useImperativeHandle(ref, () => ({
    getHTML,
  }));

  // Update font size and collapse state when selection changes
  useEffect(() => {
    if (!editor) return;

    /**
     * Check if the current cursor position is inside a collapse/details element
     */
    const checkIfInsideCollapse = (): boolean => {
      if (!editor) return false;

      const { state } = editor;
      const { selection } = state;
      const { $from } = selection;

      // Walk up the node tree to check if we're inside a details element
      for (let depth = $from.depth; depth > 0; depth--) {
        const node = $from.node(depth);
        if (node.type.name === 'details') {
          return true;
        }
      }

      return false;
    };

    const updateFontSize = () => {
      const attrs = editor.getAttributes('textStyle');
      if (attrs.fontSize) {
        // Remove 'pt' from the fontSize value
        const size = (attrs.fontSize as string).replace('pt', '');
        setFontSize(size);
      }
    };

    const updateCollapseState = () => {
      const insideCollapse = checkIfInsideCollapse();
      setIsInsideCollapse(insideCollapse);
    };

    editor.on('selectionUpdate', updateFontSize);
    editor.on('selectionUpdate', updateCollapseState);

    // Initial check
    updateCollapseState();

    // Add event listener for gallery edit events dispatched by the Gallery node view
    const handleEditGallery = (event: Event) => {
      const { galleryId, config, attachments, updateGallery } = (event as CustomEvent<GalleryState>)
        .detail;
      setGalleryData({ galleryId, config, attachments, updateGallery });
      openGalleryModal();
    };

    // Add event listener for rich text edit events dispatched by the RichText node view
    const handleEditRichText = (event: Event) => {
      const {
        richtextId,
        config,
        content: richContent,
        updateRichText,
      } = (event as CustomEvent<RichTextState & { content: string }>).detail;
      setRichTextData({
        richtextId,
        config,
        content: richContent || '',
        updateRichText,
      });
      openRichTextModal();
    };

    window.addEventListener('editGallery', handleEditGallery);
    window.addEventListener('editRichText', handleEditRichText);

    return () => {
      editor.off('selectionUpdate', updateFontSize);
      editor.off('selectionUpdate', updateCollapseState);
      window.removeEventListener('editGallery', handleEditGallery);
      window.removeEventListener('editRichText', handleEditRichText);
    };
  }, [editor, openGalleryModal, openRichTextModal]);

  // Reset insert tools when cursor moves
  useEffect(() => {
    if (!editor) return;
    const reset = () => setShowInsertTools(false);
    editor.on('selectionUpdate', reset);
    return () => {
      editor.off('selectionUpdate', reset);
    };
  }, [editor]);

  /**
   * Apply the selected font size to the current selection
   */
  const applyFontSize = (size: string) => {
    if (!editor || !size) return;
    editor.chain().focus().setFontSize(`${size}pt`).run();
  };

  return (
    <>
      {label && (
        <div
          style={{
            fontSize: `var(--input-label-size,var(--mantine-font-size-md))`,
            fontWeight: 500,
            marginBottom: '0.25rem',
          }}
        >
          {label}
        </div>
      )}
      {/* CSS for ProseMirror editor - autocomplete styles are added dynamically by the extension */}
      <style>{`
        .ProseMirror {
          outline: none;
          padding: 0;
        }
      `}</style>

      <div className="flex flex-col">
        <MantineRichTextEditor
          editor={editor}
          variant={variant as 'subtle' | 'filled' | 'outline' | 'default'}
          className={`w-full ${className ?? ''}`}
          {...restProps}
        >
          {/* Table styles */}
          <style>{`
            .ProseMirror table {
              border-collapse: collapse;
              table-layout: fixed;
              width: 100%;
              margin: 1rem 0;
              overflow: hidden;
              position: relative;
            }
            .ProseMirror td,
            .ProseMirror th {
              min-width: 1em;
              border: 2px solid #ced4da;
              padding: 8px 12px;
              vertical-align: top;
              box-sizing: border-box;
              position: relative;
            }
            .ProseMirror th {
              font-weight: bold;
              text-align: left;
              background-color: #f8f9fa;
            }
            .ProseMirror .selectedCell:after {
              z-index: 2;
              position: absolute;
              content: '';
              left: 0;
              right: 0;
              top: 0;
              bottom: 0;
              background: rgba(200, 200, 255, 0.4);
              pointer-events: none;
            }
            .ProseMirror .column-resize-handle {
              position: absolute;
              right: -2px;
              top: 0;
              bottom: -2px;
              width: 4px;
              background-color: #adf;
              pointer-events: none;
            }
            .ProseMirror.resize-cursor {
              cursor: ew-resize;
              cursor: col-resize;
            }
            .ProseMirror table:hover .table-controls {
              opacity: 1 !important;
            }
            .ProseMirror tr:hover .table-row-controls {
              opacity: 1 !important;
            }
            .ProseMirror td:hover .table-col-controls,
            .ProseMirror th:hover .table-col-controls {
              opacity: 1 !important;
            }
            .table-controls {
              opacity: 0;
              transition: opacity 0.2s ease-in-out;
            }
            .table-row-controls {
              position: absolute;
              left: -40px;
              top: 50%;
              transform: translateY(-50%);
              display: flex;
              flex-direction: column;
              gap: 3px;
              z-index: 10;
            }
            .table-col-controls {
              position: absolute;
              top: -40px;
              left: 50%;
              transform: translateX(-50%);
              display: flex;
              gap: 3px;
              z-index: 10;
            }
            .table-control-btn {
              width: 28px;
              height: 28px;
              background: white;
              border: 1px solid #dee2e6;
              border-radius: 6px;
              cursor: pointer;
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 14px;
              font-weight: normal;
              box-shadow: 0 2px 6px rgba(0, 0, 0, 0.15);
              transition: all 0.2s ease;
              color: #495057;
              line-height: 1;
            }
            .table-control-btn:hover {
              background: #f8f9fa;
              border-color: #adb5bd;
              transform: scale(1.15);
              box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
            }
            .table-control-btn:active {
              transform: scale(0.95);
            }
            .table-control-btn.delete {
              color: #dc3545;
            }
            .table-control-btn.delete:hover {
              background: #f8d7da;
              border-color: #dc3545;
            }
            .table-control-btn.add {
              color: #28a745;
            }
            .table-control-btn.add:hover {
              background: #d4edda;
              border-color: #28a745;
            }
          `}</style>

          {/* Bubble Menu - formatting controls on text selection */}
          {editor && (
            <BubbleMenu editor={editor} tippyOptions={{ maxWidth: '100%' }}>
              <div className="flex flex-wrap gap-0.5 bg-white rounded-lg shadow-lg border border-gray-200 p-1">
                <MantineRichTextEditor.ControlsGroup>
                  <MantineRichTextEditor.Bold />
                  <MantineRichTextEditor.Italic />
                  <MantineRichTextEditor.Underline />
                </MantineRichTextEditor.ControlsGroup>

                <MantineRichTextEditor.ControlsGroup>
                  <MantineRichTextEditor.H1 />
                  <MantineRichTextEditor.H2 />
                  <MantineRichTextEditor.H3 />
                </MantineRichTextEditor.ControlsGroup>

                <MantineRichTextEditor.ControlsGroup>
                  <MantineRichTextEditor.BulletList />
                  <MantineRichTextEditor.OrderedList />
                </MantineRichTextEditor.ControlsGroup>

                <MantineRichTextEditor.ControlsGroup>
                  <MantineRichTextEditor.Link />
                </MantineRichTextEditor.ControlsGroup>

                {/* Font Size Controls */}
                <MantineRichTextEditor.ControlsGroup>
                  <div className="flex items-center border border-gray-300 rounded">
                    <Tooltip label={t('Decrease font size')}>
                      <button
                        type="button"
                        onClick={() => {
                          if (!editor) return;
                          const newSize = Math.max(8, parseInt(fontSize || '16') - 1);
                          setFontSize(newSize.toString());
                          applyFontSize(newSize.toString());
                        }}
                        className="w-[26px] h-[26px] flex justify-center items-center rounded-[4px] p-1 font-thin cursor-pointer hover:bg-[#e4e6ed]"
                      >
                        <IconMinus size={18} className="text-[#808496]" />
                      </button>
                    </Tooltip>
                    <div className="flex items-center px-1">
                      <NumberInput
                        value={parseInt(fontSize || '16')}
                        min={8}
                        max={200}
                        hideControls
                        variant="unstyled"
                        onChange={(value) => {
                          const next = typeof value === 'number' ? value : parseInt(String(value));
                          if (!isNaN(next) && next >= 8) {
                            const str = next.toString();
                            setFontSize(str);
                            applyFontSize(str);
                          }
                        }}
                        className="w-[44px]"
                        styles={{
                          input: {
                            height: '26px',
                            minHeight: '26px',
                            textAlign: 'center',
                          },
                          wrapper: { height: '26px' },
                        }}
                      />
                    </div>
                    <Tooltip label={t('Increase font size')}>
                      <button
                        type="button"
                        onClick={() => {
                          if (!editor) return;
                          const newSize = parseInt(fontSize || '16') + 1;
                          setFontSize(newSize.toString());
                          applyFontSize(newSize.toString());
                        }}
                        className="w-[26px] h-[26px] flex justify-center items-center rounded-[4px] p-1 font-thin cursor-pointer hover:bg-[#e4e6ed]"
                      >
                        <IconPlus size={18} className="text-[#808496]" />
                      </button>
                    </Tooltip>
                  </div>
                </MantineRichTextEditor.ControlsGroup>

                {/* More formatting options */}
                <Menu shadow="md" position="bottom-start" closeOnItemClick={false} withinPortal>
                  <Menu.Target>
                    <Tooltip label={t('More')}>
                      <button
                        type="button"
                        className="w-[26px] h-[26px] flex justify-center items-center rounded-[4px] p-1 font-thin cursor-pointer hover:bg-[#e4e6ed]"
                      >
                        <IconDots size={18} className="text-[#808496]" />
                      </button>
                    </Tooltip>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <div className="flex flex-wrap gap-0.5 p-1 max-w-[240px]">
                      <MantineRichTextEditor.ControlsGroup>
                        <MantineRichTextEditor.Strikethrough />
                        <MantineRichTextEditor.ClearFormatting />
                        <MantineRichTextEditor.Highlight />
                        <MantineRichTextEditor.Code />
                        <EnhancedCodeBlockButton editor={editor} />
                      </MantineRichTextEditor.ControlsGroup>

                      <MantineRichTextEditor.ControlsGroup>
                        <MantineRichTextEditor.H4 />
                      </MantineRichTextEditor.ControlsGroup>

                      <MantineRichTextEditor.ControlsGroup>
                        <MantineRichTextEditor.Blockquote />
                        <MantineRichTextEditor.Hr />
                        <MantineRichTextEditor.Subscript />
                        <MantineRichTextEditor.Superscript />
                      </MantineRichTextEditor.ControlsGroup>

                      <MantineRichTextEditor.ControlsGroup>
                        <MantineRichTextEditor.Unlink />
                      </MantineRichTextEditor.ControlsGroup>

                      <MantineRichTextEditor.ControlsGroup>
                        <MantineRichTextEditor.AlignLeft />
                        <MantineRichTextEditor.AlignCenter />
                        <MantineRichTextEditor.AlignJustify />
                        <MantineRichTextEditor.AlignRight />
                      </MantineRichTextEditor.ControlsGroup>

                      <MantineRichTextEditor.ControlsGroup>
                        <MantineRichTextEditor.Undo />
                        <MantineRichTextEditor.Redo />
                      </MantineRichTextEditor.ControlsGroup>
                    </div>
                  </Menu.Dropdown>
                </Menu>

                {/* Table Controls - only show when cursor is in a table */}
                {editor?.isActive('table') && (
                  <MantineRichTextEditor.ControlsGroup>
                    <Tooltip label={t('Add Column Before')}>
                      <button
                        type="button"
                        onClick={() => editor.chain().focus().addColumnBefore().run()}
                        className="h-[26px] px-2 flex justify-center items-center gap-1 rounded-[4px] font-thin cursor-pointer hover:bg-[#e4e6ed]"
                      >
                        <IconArrowLeft size={12} className="text-[#808496]" />
                        <IconPlus size={12} className="text-[#808496]" />
                        <span className="text-[#808496] text-xs">Col</span>
                      </button>
                    </Tooltip>
                    <Tooltip label={t('Add Column After')}>
                      <button
                        type="button"
                        onClick={() => editor.chain().focus().addColumnAfter().run()}
                        className="h-[26px] px-2 flex justify-center items-center gap-1 rounded-[4px] font-thin cursor-pointer hover:bg-[#e4e6ed]"
                      >
                        <IconPlus size={12} className="text-[#808496]" />
                        <span className="text-[#808496] text-xs">Col</span>
                        <IconArrowRight size={12} className="text-[#808496]" />
                      </button>
                    </Tooltip>
                    <Tooltip label={t('Delete Column')}>
                      <button
                        type="button"
                        onClick={() => editor.chain().focus().deleteColumn().run()}
                        className="h-[26px] px-2 flex justify-center items-center gap-1 rounded-[4px] font-thin cursor-pointer hover:bg-[#e4e6ed]"
                      >
                        <IconTrash size={12} className="text-red-500" />
                        <span className="text-red-500 text-xs">Col</span>
                      </button>
                    </Tooltip>
                    <Tooltip label={t('Add Row Before')}>
                      <button
                        type="button"
                        onClick={() => editor.chain().focus().addRowBefore().run()}
                        className="h-[26px] px-2 flex justify-center items-center gap-1 rounded-[4px] font-thin cursor-pointer hover:bg-[#e4e6ed]"
                      >
                        <IconPlus size={12} className="text-[#808496]" />
                        <span className="text-[#808496] text-xs">Row</span>
                        <IconArrowUp size={12} className="text-[#808496]" />
                      </button>
                    </Tooltip>
                    <Tooltip label={t('Add Row After')}>
                      <button
                        type="button"
                        onClick={() => editor.chain().focus().addRowAfter().run()}
                        className="h-[26px] px-2 flex justify-center items-center gap-1 rounded-[4px] font-thin cursor-pointer hover:bg-[#e4e6ed]"
                      >
                        <IconPlus size={12} className="text-[#808496]" />
                        <span className="text-[#808496] text-xs">Row</span>
                        <IconArrowDown size={12} className="text-[#808496]" />
                      </button>
                    </Tooltip>
                    <Tooltip label={t('Delete Row')}>
                      <button
                        type="button"
                        onClick={() => editor.chain().focus().deleteRow().run()}
                        className="h-[26px] px-2 flex justify-center items-center gap-1 rounded-[4px] font-thin cursor-pointer hover:bg-[#e4e6ed]"
                      >
                        <IconTrash size={12} className="text-red-500" />
                        <span className="text-red-500 text-xs">Row</span>
                      </button>
                    </Tooltip>
                    <Tooltip label={t('Delete Table')}>
                      <button
                        type="button"
                        onClick={() => editor.chain().focus().deleteTable().run()}
                        className="h-[26px] px-2 flex justify-center items-center gap-1 rounded-[4px] font-thin cursor-pointer hover:bg-[#e4e6ed]"
                      >
                        <IconX size={12} className="text-red-500" />
                        <span className="text-red-500 text-xs">Table</span>
                      </button>
                    </Tooltip>
                  </MantineRichTextEditor.ControlsGroup>
                )}
              </div>
            </BubbleMenu>
          )}

          {/* Floating Menu - insert tools on empty lines */}
          {editor && canAddImage && (
            <FloatingMenu editor={editor} tippyOptions={{ placement: 'left', offset: [0, 150] }}>
              <div className="flex items-center gap-1">
                <Tooltip label={t('Insert')}>
                  <button
                    type="button"
                    onClick={() => setShowInsertTools((prev) => !prev)}
                    className="w-8 h-8 flex justify-center items-center rounded-full border border-gray-300 bg-white shadow-sm cursor-pointer hover:bg-gray-50 transition-all"
                  >
                    <IconPlus
                      size={16}
                      className={`text-gray-500 transition-transform duration-200 ${showInsertTools ? 'rotate-45' : ''}`}
                    />
                  </button>
                </Tooltip>
                {showInsertTools && (
                  <div className="flex items-center gap-0.5 bg-white rounded-lg shadow-lg border border-gray-200 p-1">
                    <EnhancedImageButton
                      editor={editor}
                      onAddImageOverride={onAddImageOverride}
                      backendHost={backendHost}
                      user={user}
                      setUser={setUser}
                      currentLocaleId={locale?.id ?? undefined}
                    />
                    <Tooltip label={t('Insert Gallery')}>
                      <button
                        type="button"
                        onClick={() => {
                          setGalleryData(null);
                          openGalleryModal();
                        }}
                        className="w-8 h-8 flex justify-center items-center rounded-[4px] p-1 font-thin cursor-pointer hover:bg-[#e4e6ed]"
                      >
                        <IconLibraryPhoto size={22} className="text-[#808496]" />
                      </button>
                    </Tooltip>
                    <AuthenticatedContentButton editor={editor} />
                    <EmbedVideoButton
                      editor={editor}
                      backendHost={backendHost}
                      user={user}
                      setUser={setUser}
                    />
                    <EmbedAudioButton
                      editor={editor}
                      backendHost={backendHost}
                      user={user}
                      setUser={setUser}
                    />
                    <EmbedFilesButton
                      backendHost={backendHost}
                      user={user}
                      setUser={setUser}
                      editor={editor}
                    />
                    <Tooltip label={t('Insert Table')}>
                      <button
                        type="button"
                        onClick={openTableModal}
                        className="w-8 h-8 flex justify-center items-center rounded-[4px] p-1 font-thin cursor-pointer hover:bg-[#e4e6ed]"
                      >
                        <IconTable size={22} className="text-[#808496]" />
                      </button>
                    </Tooltip>
                    <Tooltip label={t('Insert HTML Component')}>
                      <button
                        type="button"
                        onClick={openHtmlComponentsModal}
                        className="w-8 h-8 flex justify-center items-center rounded-[4px] p-1 font-thin cursor-pointer hover:bg-[#e4e6ed]"
                      >
                        <IconCube size={22} className="text-[#808496]" />
                      </button>
                    </Tooltip>
                    <Tooltip label={t('Insert Youtube Video with Jump Marks')}>
                      <button
                        type="button"
                        className="w-8 h-8 flex justify-center items-center rounded p-1 font-thin cursor-pointer hover:bg-[#e4e6ed]"
                        onClick={() => {
                          setJumpMarksData(null);
                          openJumpMarksModal();
                        }}
                      >
                        <IconBrandYoutube size={22} className="text-[#808496]" />
                      </button>
                    </Tooltip>
                    {!isInsideCollapse && (
                      <Tooltip label={t('Insert Collapse')}>
                        <button
                          type="button"
                          className="w-8 h-8 flex justify-center items-center rounded p-1 font-thin cursor-pointer hover:bg-[#e4e6ed]"
                          onClick={(event) => {
                            event.preventDefault();
                            editor
                              ?.chain()
                              .focus()
                              .insertContent(
                                `<details><summary>${t('Click to expand')}</summary><div data-type="details-content"><p>${t('Add your content here...')}</p></div></details>`,
                              )
                              .run();
                          }}
                        >
                          <IconChevronDown size={22} className="text-[#808496]" />
                        </button>
                      </Tooltip>
                    )}
                  </div>
                )}
              </div>
            </FloatingMenu>
          )}

          <MantineRichTextEditor.Content />
        </MantineRichTextEditor>
      </div>

      {canAddImage && (
        <>
          <GalleryModal
            isOpen={isGalleryModalOpened}
            close={closeGalleryModal}
            galleryId={galleryData?.galleryId}
            initialConfig={galleryData?.config}
            initialAttachments={galleryData?.attachments}
            backendHost={backendHost}
            user={user}
            setUser={setUser}
            localeISOCode={locale?.iso_code}
            onSave={(savedData) => {
              if (galleryData?.updateGallery) {
                // Update existing gallery node via the function stored in state
                galleryData.updateGallery({
                  config: savedData.config,
                  attachments: savedData.attachments,
                });
              } else {
                // Insert new gallery
                if (editor) {
                  editor
                    .chain()
                    .focus()
                    .setGallery({
                      galleryId: savedData.galleryId != null ? String(savedData.galleryId) : null,
                      config: savedData.config,
                      attachments: savedData.attachments,
                    })
                    .run();
                }
              }
            }}
          />

          <RichTextModal
            isOpen={isRichTextModalOpened}
            close={closeRichTextModal}
            richtextId={richTextData?.richtextId}
            initialConfig={richTextData?.config}
            initialContent={richTextData?.content}
            backendHost={backendHost}
            user={user}
            setUser={setUser}
            siteSettings={siteSettings}
            organizationId={organizationId}
            onSave={(data) => {
              if (data.updateRichText && richTextData?.updateRichText) {
                // Update existing rich text node via the function stored in state
                richTextData.updateRichText({
                  config: data.config,
                  content: data.content,
                });
              } else {
                // Insert new rich text
                if (editor) {
                  editor
                    .chain()
                    .focus()
                    .setRichText({
                      richtextId: data.richtextId,
                      config: data.config,
                      content: data.content,
                    })
                    .run();
                }
              }
            }}
          />

          <Modal
            opened={isTableModalOpened}
            onClose={closeTableModal}
            title={t('Insert Table')}
            size="sm"
          >
            <div className="space-y-4">
              <NumberInput
                label={t('Number of rows')}
                value={tableRows}
                onChange={(v) => {
                  if (typeof v === 'number') setTableRows(v);
                }}
                min={1}
                max={20}
              />
              <NumberInput
                label={t('Number of columns')}
                value={tableCols}
                onChange={(v) => {
                  if (typeof v === 'number') setTableCols(v);
                }}
                min={1}
                max={10}
              />
              <div className="flex gap-2 justify-end">
                <Button variant="outline" onClick={closeTableModal}>
                  {t('Cancel')}
                </Button>
                <Button
                  onClick={() => {
                    if (editor) {
                      editor
                        .chain()
                        .focus()
                        .insertTable({
                          rows: tableRows,
                          cols: tableCols,
                          withHeaderRow: true,
                        })
                        .run();
                    }
                    closeTableModal();
                  }}
                >
                  {t('Insert Table')}
                </Button>
              </div>
            </div>
          </Modal>

          <JumpMarksModal
            isOpen={isJumpMarksModalOpened}
            onClose={closeJumpMarksModal}
            initialData={jumpMarksData}
            onSave={(data) => {
              if (editor) {
                editor.chain().focus().setYoutubeVideoWithJumpMarks(data).run();

                // Add line break after YouTube video
                setTimeout(() => {
                  editor.chain().focus().createParagraphNear().run();
                }, PARAGRAPH_CREATION_DELAY_MS);
              }
            }}
          />

          <HtmlComponentsModal
            isOpen={isHtmlComponentsModalOpened}
            onClose={closeHtmlComponentsModal}
            currentLocaleId={locale?.id}
            organizationId={organizationId}
            backendHost={backendHost}
            user={user}
            setUser={setUser}
            onInsert={(html) => {
              if (editor) {
                editor.chain().focus().insertContent(html).run();
              }
            }}
          />
        </>
      )}
    </>
  );
});

RichTextInput.displayName = 'RichTextInput';
