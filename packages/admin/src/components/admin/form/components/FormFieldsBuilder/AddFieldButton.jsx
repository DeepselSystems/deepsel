import { Menu, Text } from '@mantine/core';
import Button from '../../../../../common/ui/Button.jsx';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus } from '@fortawesome/free-solid-svg-icons';
import { useTranslation } from 'react-i18next';
import { FORM_FIELD_TYPE as FormFieldType } from '@deepsel/cms-utils';

/**
 * Reusable button component for adding new form fields
 *
 * @param {Object} props
 * @param {Function} props.onAddField - Callback function when field type is selected
 * @param {string} props.variant - Button variant (default: 'filled')
 * @param {string} props.size - Button size (default: 'md')
 * @param {string} props.buttonText - Custom button text
 * @returns {JSX.Element}
 */
const AddFieldButton = ({ onAddField, variant = 'filled', size = 'md', buttonText }) => {
  const { t } = useTranslation();

  const fieldTypeMenuItems = [
    {
      value: FormFieldType.ShortAnswer,
      label: t('Short Answer'),
      description: t('Single line text input for brief responses'),
    },
    {
      value: FormFieldType.Paragraph,
      label: t('Paragraph'),
      description: t('Multi-line text area for longer responses'),
    },
    {
      value: FormFieldType.Number,
      label: t('Number'),
      description: t('Numeric input with validation'),
    },
    {
      value: FormFieldType.MultipleChoice,
      label: t('Multiple Choice'),
      description: t('Single selection from predefined options'),
    },
    {
      value: FormFieldType.Checkboxes,
      label: t('Checkboxes'),
      description: t('Multiple selections from predefined options'),
    },
    {
      value: FormFieldType.Dropdown,
      label: t('Dropdown'),
      description: t('Single selection from dropdown menu'),
    },
    {
      value: FormFieldType.Date,
      label: t('Date'),
      description: t('Date picker for selecting dates'),
    },
    {
      value: FormFieldType.Datetime,
      label: t('Date & Time'),
      description: t('Date and time picker for precise timestamps'),
    },
    {
      value: FormFieldType.Time,
      label: t('Time'),
      description: t('Time picker for selecting time'),
    },
    {
      value: FormFieldType.Files,
      label: t('Files'),
      description: t('File upload with drag and drop support'),
    },
  ];

  return (
    <Menu shadow="md" width={280} classNames={{ dropdown: 'max-h-96 overflow-y-auto' }}>
      <Menu.Target>
        <Button leftSection={<FontAwesomeIcon icon={faPlus} />} variant={variant} size={size}>
          {buttonText || t('Add Field')}
        </Button>
      </Menu.Target>

      <Menu.Dropdown>
        <Menu.Label>{t('Select Field Type')}</Menu.Label>
        {fieldTypeMenuItems.map((item) => (
          <Menu.Item key={item.value} onClick={() => onAddField(item.value)}>
            <div>
              <Text size="sm" fw={500}>
                {item.label}
              </Text>
              <Text size="xs" c="dimmed">
                {item.description}
              </Text>
            </div>
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
};

export default AddFieldButton;
