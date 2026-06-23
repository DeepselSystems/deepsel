import { useState } from 'react';
import {
  Paper,
  TextInput,
  Textarea,
  Select,
  Switch,
  Group,
  ActionIcon,
  Box,
  Collapse,
  NumberInput,
  Text,
  Divider,
  Button,
} from '@mantine/core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTrash, faCopy, faGripHorizontal, faAngleUp } from '@fortawesome/free-solid-svg-icons';
import { useTranslation } from 'react-i18next';
import {
  FORM_FIELD_TYPE as FormFieldType,
  TIME_FORMAT as TimeFormat,
  TIME_FORMAT_OPTIONS as TimeFormatOptions,
} from '@deepsel/cms-utils';
import OptionsEditor from './OptionsEditor.jsx';
import useUploadSizeLimit from '../../../../../common/api/useUploadSizeLimit.js';
import clsx from 'clsx';

/**
 * Individual field editor component
 *
 * @param {Object} props
 * @param {FormField} props.field - The field being edited
 * @param {number} props.index - Field index in the array
 * @param {Function} props.onUpdate - Callback when field is updated
 * @param {Function} props.onDelete - Callback when field is deleted
 * @param {Function} props.onDuplicate - Callback when field is duplicated
 * @param {Object} props.dragHandleProps - Props for drag handle
 * @returns {JSX.Element}
 */
const FieldEditor = ({ field, index, onUpdate, onDelete, onDuplicate, dragHandleProps }) => {
  const { t } = useTranslation();
  const [showAdvanced, setShowAdvanced] = useState(false);
  const { uploadSizeLimit } = useUploadSizeLimit();

  /**
   * Updates a field property
   * @param {string} property - Property name to update
   * @param {any} value - New value
   */
  const updateField = (property, value) => {
    onUpdate(index, { ...field, [property]: value });
  };

  /**
   * Updates field configuration
   * @param {string} configKey - Configuration key
   * @param {any} value - New value
   */
  const updateFieldConfig = (configKey, value) => {
    const newConfig = { ...field.field_config, [configKey]: value };
    updateField('field_config', newConfig);
  };

  const fieldTypeOptions = [
    {
      value: FormFieldType.ShortAnswer,
      label: t('Short Answer'),
    },
    { value: FormFieldType.Paragraph, label: t('Paragraph') },
    { value: FormFieldType.Number, label: t('Number') },
    { value: FormFieldType.MultipleChoice, label: t('Multiple Choice') },
    { value: FormFieldType.Checkboxes, label: t('Checkboxes') },
    { value: FormFieldType.Dropdown, label: t('Dropdown') },
    { value: FormFieldType.Date, label: t('Date') },
    { value: FormFieldType.Datetime, label: t('Date & Time') },
    { value: FormFieldType.Time, label: t('Time') },
    { value: FormFieldType.Files, label: t('Files') },
  ];

  return (
    <Paper shadow="sm" p="md" withBorder className="group hover:shadow-md transition-shadow">
      {/* Header with drag handle and actions */}
      <Group justify="space-between" mb="md">
        <Group gap="xs">
          <button {...dragHandleProps}>
            <div className="py-2 transition-colors text-gray-pale-sky hover:text-gray-shark active:text-gray-shark">
              <FontAwesomeIcon icon={faGripHorizontal} size="xl" />
            </div>
          </button>
        </Group>

        <Group gap="xs">
          <ActionIcon
            variant="subtle"
            size="sm"
            onClick={() => onDuplicate(index)}
            title={t('Duplicate Field')}
          >
            <FontAwesomeIcon icon={faCopy} size="sm" />
          </ActionIcon>
          <ActionIcon
            variant="subtle"
            size="sm"
            onClick={() => onDelete(index)}
            title={t('Delete Field')}
          >
            <FontAwesomeIcon icon={faTrash} size="sm" />
          </ActionIcon>
        </Group>
      </Group>

      {/* Field Type Selection */}
      <Select
        label={t('Field Type')}
        data={fieldTypeOptions}
        value={field.field_type}
        onChange={(value) => updateField('field_type', value)}
        mb="md"
        required
      />

      {/* Basic Field Configuration */}
      <TextInput
        label={t('Field Label')}
        placeholder={t('Enter field label')}
        value={field.label || ''}
        onChange={(e) => updateField('label', e.target.value)}
        error={field._errors?.label}
        mb="md"
        required
      />

      <Textarea
        label={t('Field Description')}
        placeholder={t('Enter field description (optional)')}
        value={field.description || ''}
        onChange={(e) => updateField('description', e.target.value)}
        mb="md"
        minRows={2}
        autosize
      />

      <TextInput
        label={t('Placeholder Text')}
        placeholder={t('Enter placeholder text (optional)')}
        value={field.placeholder || ''}
        onChange={(e) => updateField('placeholder', e.target.value)}
        mb="md"
      />

      {/* Required Toggle */}
      <Switch
        label={t('Required Field')}
        checked={field.required || false}
        onChange={(e) => updateField('required', e.currentTarget.checked)}
        mb="md"
      />

      {/* Options configuration for MultipleChoice, Checkboxes, and Dropdown */}
      {(field.field_type === FormFieldType.MultipleChoice ||
        field.field_type === FormFieldType.Checkboxes ||
        field.field_type === FormFieldType.Dropdown) && (
        <Box mb="md">
          <OptionsEditor
            options={field.field_config?.options || []}
            onChange={(options) => updateFieldConfig('options', options)}
            fieldType={field.field_type}
          />
        </Box>
      )}

      {/* Advanced Configuration */}
      <Box className="mt-6">
        <Button
          className="px-0"
          variant="transparent"
          fw={600}
          fz="lg"
          onClick={() => setShowAdvanced(!showAdvanced)}
          title={t('Advanced Settings')}
          rightSection={
            <FontAwesomeIcon
              icon={faAngleUp}
              className={clsx('transition', {
                'rotate-180': showAdvanced,
              })}
            />
          }
        >
          {t('Advanced Settings')}
        </Button>
        <Collapse in={showAdvanced}>
          <Divider mb="md" />
          <Text size="sm" fw={500} mb="md">
            {t('Advanced Configuration')}
          </Text>

          {/* Field-specific configurations */}
          {(field.field_type === FormFieldType.ShortAnswer ||
            field.field_type === FormFieldType.Paragraph) && (
            <Group grow mb="md">
              <NumberInput
                label={t('Minimum Length')}
                placeholder="0"
                min={0}
                value={field.field_config?.min_length || ''}
                onChange={(value) => updateFieldConfig('min_length', value)}
              />
              <NumberInput
                label={t('Maximum Length')}
                placeholder="255"
                min={1}
                value={field.field_config?.max_length || ''}
                onChange={(value) => updateFieldConfig('max_length', value)}
              />
            </Group>
          )}

          {field.field_type === FormFieldType.Number && (
            <>
              <Group grow mb="md">
                <NumberInput
                  label={t('Minimum Value')}
                  value={field.field_config?.min_value || ''}
                  onChange={(value) => updateFieldConfig('min_value', value)}
                />
                <NumberInput
                  label={t('Maximum Value')}
                  value={field.field_config?.max_value || ''}
                  onChange={(value) => updateFieldConfig('max_value', value)}
                />
              </Group>
            </>
          )}

          {/* Additional settings for Checkboxes */}
          {field.field_type === FormFieldType.Checkboxes && (
            <Group grow mb="md">
              <NumberInput
                label={t('Minimum Selections')}
                placeholder="0"
                min={0}
                value={field.field_config?.min_selections || ''}
                onChange={(value) => updateFieldConfig('min_selections', value)}
              />
              <NumberInput
                label={t('Maximum Selections')}
                placeholder={t('No limit')}
                min={1}
                value={field.field_config?.max_selections || ''}
                onChange={(value) => updateFieldConfig('max_selections', value)}
              />
            </Group>
          )}

          {/* Date/Time field configurations */}
          {[FormFieldType.Date, FormFieldType.Datetime].includes(field.field_type) && (
            <Group grow mb="md">
              <TextInput
                label={t('Minimum Date/Time')}
                placeholder={
                  field.field_type === FormFieldType.Time
                    ? '09:00'
                    : field.field_type === FormFieldType.Date
                      ? '2024-01-01'
                      : '2024-01-01T09:00'
                }
                value={field.field_config?.min_value || ''}
                onChange={(e) => updateFieldConfig('min_value', e.target.value)}
              />
              <TextInput
                label={t('Maximum Date/Time')}
                placeholder={
                  field.field_type === FormFieldType.Time
                    ? '17:00'
                    : field.field_type === FormFieldType.Date
                      ? '2024-12-31'
                      : '2024-12-31T17:00'
                }
                value={field.field_config?.max_value || ''}
                onChange={(e) => updateFieldConfig('max_value', e.target.value)}
              />
            </Group>
          )}
          {[FormFieldType.Datetime, FormFieldType.Time].includes(field.field_type) && (
            <Group grow mb="md">
              <NumberInput
                label={t('Step (minutes)')}
                placeholder="15"
                min={1}
                max={60}
                value={field.field_config?.step || ''}
                onChange={(value) => updateFieldConfig('step', value)}
              />
              <Select
                label={t('Time Format')}
                placeholder={t('Select format')}
                data={TimeFormatOptions.map((option) => ({
                  value: option.value,
                  label: t(option.label),
                }))}
                value={field.field_config?.time_format || TimeFormat.TWENTY_FOUR_HOUR}
                onChange={(value) => updateFieldConfig('time_format', value)}
              />
            </Group>
          )}

          {/* Files field configuration */}
          {field.field_type === FormFieldType.Files && (
            <>
              <Group grow mb="md">
                <NumberInput
                  label={t('Maximum Files')}
                  placeholder="3"
                  min={1}
                  max={10}
                  value={field.field_config?.max_files || 3}
                  onChange={(value) => updateFieldConfig('max_files', value)}
                />
                <NumberInput
                  label={t('Max File Size (MB)')}
                  placeholder={uploadSizeLimit.toString()}
                  min={1}
                  max={uploadSizeLimit}
                  step={1}
                  value={field.field_config?.max_file_size || uploadSizeLimit}
                  onChange={(value) => updateFieldConfig('max_file_size', value)}
                />
              </Group>
              <Select
                label={t('Allowed File Types')}
                placeholder={t('Select allowed file types')}
                data={[
                  { value: 'image/*', label: t('Images (JPG, PNG, GIF, etc.)') },
                  {
                    value: 'application/pdf',
                    label: t('PDF Documents'),
                  },
                  {
                    value:
                      'application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document',
                    label: t('Word Documents'),
                  },
                  {
                    value:
                      'application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                    label: t('Excel Spreadsheets'),
                  },
                  { value: 'text/*', label: t('Text Files') },
                  { value: '*', label: t('All File Types') },
                ]}
                value={field.field_config?.allowed_file_types || 'image/*'}
                onChange={(value) => updateFieldConfig('allowed_file_types', value)}
                mb="md"
              />
            </>
          )}

          <TextInput
            label={t('Validation Message')}
            placeholder={t('Enter custom validation error message')}
            value={field.field_config?.validation_message || ''}
            onChange={(e) => updateFieldConfig('validation_message', e.target.value)}
            mb="md"
          />
        </Collapse>
      </Box>
    </Paper>
  );
};

export default FieldEditor;
