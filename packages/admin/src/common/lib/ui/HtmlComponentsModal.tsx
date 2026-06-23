import React from 'react';
import { Modal, Table, Text, Loader, Alert } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { useModel } from '../hooks';
import type { User } from '../types';
import { Button } from './Button';
import { TextInput } from './TextInput';
import { IconAlertTriangle, IconSearch } from '@tabler/icons-react';

interface TemplateContent {
  id?: string | number;
  locale?: {
    name?: string;
    emoji_flag?: string;
  };
}

interface Template {
  id: string | number;
  name?: string;
  contents?: TemplateContent[];
  [key: string]: unknown;
}

export interface HtmlComponentsModalProps {
  /** Controls whether the modal is visible. */
  isOpen: boolean;

  /** Callback to close the modal. */
  onClose: () => void;

  /**
   * Called when the user selects a template to insert.
   * Receives the Jinja2 include snippet (e.g. `{% include 'template_name' %}`).
   */
  onInsert: (html: string) => void;

  /**
   * The locale ID used to filter templates by language.
   * When provided, only templates containing content for this locale are shown.
   */
  currentLocaleId?: string | number;

  /**
   * The active organization ID used to scope template results.
   * Typically sourced from your `OrganizationIdState` store.
   */
  organizationId: number;

  /**
   * Backend host URL (e.g. `https://api.example.com`).
   * Typically sourced from your `BackendHostURLState` store.
   */
  backendHost: string;

  /**
   * The currently authenticated user.
   * Typically sourced from your `UserState` store.
   */
  user: User;

  /**
   * Setter for the user state — used by underlying hooks to clear session on 401.
   * Typically sourced from your `UserState` store.
   */
  setUser: (user: User | null) => void;
}

/**
 * Modal for browsing and inserting HTML/Jinja2 template components into a rich text editor.
 *
 * Requires `backendHost`, `user`, `setUser`, and `organizationId` as props
 * (sourced from BackendHostURLState / UserState / OrganizationIdState stores in the consuming app).
 */
export function HtmlComponentsModal({
  isOpen,
  onClose,
  onInsert,
  currentLocaleId,
  organizationId,
  backendHost,
  user,
  setUser,
}: HtmlComponentsModalProps) {
  const { t } = useTranslation();

  const query = useModel<Template>(
    'template',
    { backendHost, user, setUser },
    {
      autoFetch: isOpen,
      searchFields: ['name'],
      orderBy: { field: 'id', direction: 'desc' },
      filters: [
        ...(organizationId
          ? [
              {
                field: 'organization_id',
                operator: '=',
                value: organizationId,
              },
            ]
          : []),
        ...(currentLocaleId
          ? [
              {
                field: 'contents.locale_id',
                operator: '=',
                value: currentLocaleId,
              },
            ]
          : []),
      ],
    },
  );

  const { data: templates, loading, error } = query;

  function handleInsertTemplate(template: Template) {
    const templateName = template.name || `template_${template.id}`;
    onInsert(`{% include '${templateName}' %}`);
    onClose();
  }

  return (
    <Modal
      opened={isOpen}
      onClose={onClose}
      title={<div className="text-lg font-semibold">{t('Insert HTML Component')}</div>}
      size="lg"
    >
      <div className="space-y-4">
        {/* Search Input */}
        <TextInput
          placeholder={t('Search templates...')}
          value={query.searchTerm || ''}
          onChange={(e) => query.setSearchTerm(e.target.value)}
          leftSection={<IconSearch size={16} className="text-gray-400" />}
        />

        {loading && (
          <div className="flex justify-center py-8">
            <Loader size="md" />
          </div>
        )}

        {error && (
          <Alert icon={<IconAlertTriangle size={16} />} title={t('Error')} color="red">
            {error}
          </Alert>
        )}

        {!loading && !error && templates && templates.length > 0 && (
          <Table highlightOnHover>
            <Table.Thead>
              <Table.Tr>
                <Table.Th>{t('Name')}</Table.Th>
                <Table.Th>{t('Languages')}</Table.Th>
              </Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {templates.map((template) => {
                const templateName = template.name || `template_${template.id}`;

                return (
                  <Table.Tr
                    key={template.id}
                    className="cursor-pointer hover:bg-gray-50"
                    onClick={() => handleInsertTemplate(template)}
                  >
                    <Table.Td>
                      <Text size="sm" fw={500}>
                        {templateName}
                      </Text>
                    </Table.Td>
                    <Table.Td>
                      <div className="flex gap-1 flex-wrap">
                        {template.contents?.map((content, index) => (
                          <span
                            key={content.id ?? index}
                            title={content.locale?.name ?? 'Unknown'}
                            className="text-lg"
                          >
                            {content.locale?.emoji_flag ?? '🏳️'}
                          </span>
                        ))}
                      </div>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        )}

        {!loading && !error && (!templates || templates.length === 0) && (
          <div className="text-center py-8">
            <Text c="dimmed">{t('No templates available')}</Text>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={onClose}>
            {t('Cancel')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
