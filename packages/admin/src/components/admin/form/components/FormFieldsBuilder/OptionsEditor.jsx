import { useCallback, useState } from 'react';
import { Box, TextInput, Button, Group, ActionIcon, Text, Stack, Paper } from '@mantine/core';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faPlus, faTrash, faGripVertical } from '@fortawesome/free-solid-svg-icons';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { useTranslation } from 'react-i18next';
import { v4 as uuidv4 } from 'uuid';
import { FORM_FIELD_TYPE as FormFieldType } from '@deepsel/cms-utils';

/**
 * Generates a unique option ID
 * @returns {string}
 */
const generateOptionId = () => `${uuidv4()}`;

/**
 * Component for managing field options (for MultipleChoice, Checkboxes, and Dropdown)
 *
 * @param {Object} props
 * @param {Array<{id: string, label: string, value: string}>} props.options - Current options
 * @param {Function} props.onChange - Callback when options change
 * @param {string} props.fieldType - Field type (multiple_choice, checkboxes, or dropdown)
 * @returns {JSX.Element}
 */
const OptionsEditor = ({ options = [], onChange, fieldType }) => {
  const { t } = useTranslation();
  const [newOptionLabel, setNewOptionLabel] = useState('');

  /**
   * Generates option value slug from label
   * @param {string} label - Option label
   * @returns {string}
   */
  const generateOptionValue = useCallback((label) => {
    return label
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, '_')
      .trim();
  }, []);

  /**
   * Ensures the value is unique among current options.
   * If a collision exists, appends _2, _3, etc.
   * @param {string} baseValue - Generated slug value
   * @param {number} excludeIndex - Index to exclude from collision check (when updating)
   * @returns {string}
   */
  const ensureUniqueValue = useCallback(
    (baseValue, excludeIndex = -1) => {
      const existing = options.filter((_, i) => i !== excludeIndex).map((o) => o.value);
      if (!existing.includes(baseValue)) return baseValue;
      let i = 2;
      while (existing.includes(`${baseValue}_${i}`)) i++;
      return `${baseValue}_${i}`;
    },
    [options],
  );

  /**
   * Adds a new option
   */
  const addOption = useCallback(() => {
    if (!newOptionLabel.trim()) return;

    const baseValue = generateOptionValue(newOptionLabel.trim());
    const newOption = {
      id: generateOptionId(),
      label: newOptionLabel.trim(),
      value: ensureUniqueValue(baseValue),
    };

    onChange([...options, newOption]);
    setNewOptionLabel('');
  }, [ensureUniqueValue, generateOptionValue, newOptionLabel, onChange, options]);

  /**
   * Updates an option
   * @param {number} index - Option index
   * @param {Object} updatedOption - Updated option data
   */
  const updateOption = useCallback(
    (index, updatedOption) => {
      const baseValue = generateOptionValue(updatedOption.label);
      const newOptions = [...options];
      newOptions[index] = {
        ...updatedOption,
        value: ensureUniqueValue(baseValue, index),
      };
      onChange(newOptions);
    },
    [ensureUniqueValue, generateOptionValue, onChange, options],
  );

  /**
   * Removes an option
   * @param {number} index - Option index to remove
   */
  const removeOption = useCallback(
    (index) => {
      const newOptions = options.filter((_, i) => i !== index);
      onChange(newOptions);
    },
    [onChange, options],
  );

  /**
   * Handles drag end for reordering options
   * @param {Object} result - Drag result
   */
  const handleDragEnd = useCallback(
    (result) => {
      if (!result.destination) return;

      const { source, destination } = result;
      if (source.index === destination.index) return;

      const newOptions = Array.from(options);
      const [reorderedOption] = newOptions.splice(source.index, 1);
      newOptions.splice(destination.index, 0, reorderedOption);

      onChange(newOptions);
    },
    [onChange, options],
  );

  /**
   * Handles Enter key press in new option input
   * @param {KeyboardEvent} e - Keyboard event
   */
  const handleKeyPress = useCallback(
    (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addOption();
      }
    },
    [addOption],
  );

  return (
    <Box>
      <Text size="sm" fw={500} mb="md">
        {fieldType === 'multiple_choice'
          ? t('Multiple Choice Options')
          : fieldType === FormFieldType.Checkboxes
            ? t('Checkbox Options')
            : fieldType === 'dropdown'
              ? t('Dropdown Options')
              : t('Options')}
      </Text>

      {/* Existing Options */}
      {options.length > 0 && (
        <DragDropContext onDragEnd={handleDragEnd}>
          <Droppable droppableId="options">
            {(provided) => (
              <Stack gap="xs" mb="md" {...provided.droppableProps} ref={provided.innerRef}>
                {options.map((option, index) => (
                  <Draggable key={option.id} draggableId={option.id} index={index}>
                    {(provided, snapshot) => (
                      <Paper
                        ref={provided.innerRef}
                        {...provided.draggableProps}
                        p="xs"
                        withBorder
                        style={{
                          ...provided.draggableProps.style,
                          opacity: snapshot.isDragging ? 0.8 : 1,
                        }}
                      >
                        <Group gap="xs">
                          <ActionIcon
                            variant="subtle"
                            size="sm"
                            {...provided.dragHandleProps}
                            className="cursor-grab active:cursor-grabbing"
                          >
                            <FontAwesomeIcon icon={faGripVertical} size="sm" />
                          </ActionIcon>

                          <TextInput
                            placeholder={t('Option label')}
                            value={option.label}
                            onChange={(e) =>
                              updateOption(index, {
                                ...option,
                                label: e.target.value,
                              })
                            }
                            size="sm"
                            style={{ flex: 1 }}
                          />

                          <ActionIcon
                            variant="subtle"
                            size="sm"
                            onClick={() => removeOption(index)}
                            title={t('Remove option')}
                          >
                            <FontAwesomeIcon icon={faTrash} size="sm" />
                          </ActionIcon>
                        </Group>
                      </Paper>
                    )}
                  </Draggable>
                ))}
                {provided.placeholder}
              </Stack>
            )}
          </Droppable>
        </DragDropContext>
      )}

      {/* Add New Option */}
      <Group gap="xs">
        <TextInput
          placeholder={t('Add new option')}
          value={newOptionLabel}
          onChange={(e) => setNewOptionLabel(e.target.value)}
          onKeyPress={handleKeyPress}
          size="sm"
          style={{ flex: 1 }}
        />
        <Button
          leftSection={<FontAwesomeIcon icon={faPlus} />}
          onClick={addOption}
          size="sm"
          disabled={!newOptionLabel.trim()}
        >
          {t('Add')}
        </Button>
      </Group>

      {options.length === 0 && (
        <Text size="xs" c="dimmed" mt="xs">
          {t('No options added yet. Add at least one option.')}
        </Text>
      )}
    </Box>
  );
};

export default OptionsEditor;
