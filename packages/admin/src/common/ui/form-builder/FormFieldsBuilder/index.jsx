import { useCallback } from 'react';
import { Box, Group, Text, Stack, Center } from '@mantine/core';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { useTranslation } from 'react-i18next';
import FieldEditor from './FieldEditor.jsx';
import AddFieldButton from './AddFieldButton.jsx';
import { v4 as uuidv4 } from 'uuid';
import H3 from '../../../ui/H3.jsx';

/**
 * Form fields builder component with Google Forms-like interface
 *
 * @param {Array<FormField>} fields - Array of form fields
 * @param {(value: Array<FormField>) => void} setFields - Function to update fields
 * @returns {JSX.Element}
 */
/**
 * Form fields builder component with validation support
 *
 * @param {Array<FormField>} fields - Array of form fields
 * @param {Object} fieldErrors - Field-level validation errors
 * @param {(value: Array<FormField>) => void} setFields - Function to update fields
 * @returns {JSX.Element}
 */
const FormFieldsBuilder = ({ fields = [], fieldErrors = {}, setFields = () => {} }) => {
  const { t } = useTranslation();

  /**
   * Creates a new field with default values
   * @param {string} fieldType - Type of field to create
   * @returns {FormField}
   */
  const createNewField = useCallback(
    (fieldType) => {
      return {
        _id: `${uuidv4()}`, // Temporary ID for new fields
        label: '',
        description: '',
        placeholder: '',
        field_type: fieldType,
        sort_order: fields.length,
        required: false,
        field_config: {},
      };
    },
    [fields.length],
  );

  /**
   * Adds a new field of specified type
   * @param {string} fieldType - Type of field to add
   */
  const addField = useCallback(
    (fieldType) => {
      const newField = createNewField(fieldType);
      setFields([...fields, newField]);
    },
    [createNewField, fields, setFields],
  );

  /**
   * Updates a field at specified index
   * @param {number} index - Field index
   * @param {FormField} updatedField - Updated field data
   */
  const updateField = useCallback(
    (index, updatedField) => {
      const newFields = [...fields];
      newFields[index] = updatedField;
      setFields(newFields);
    },
    [fields, setFields],
  );

  /**
   * Deletes a field at specified index
   * @param {number} index - Field index to delete
   */
  const deleteField = useCallback(
    (index) => {
      const newFields = fields.filter((_, i) => i !== index);
      setFields(
        newFields.map((field, i) => ({
          ...field,
          sort_order: i,
        })),
      );
    },
    [fields, setFields],
  );

  /**
   * Duplicates a field at specified index
   * @param {number} index - Field index to duplicate
   */
  const duplicateField = useCallback(
    (index) => {
      const fieldToDuplicate = fields[index];
      const duplicatedField = {
        ...fieldToDuplicate,
        id: undefined,
        _id: uuidv4(), // New temporary ID
        label: `${fieldToDuplicate.label} (Copy)`,
        sort_order: fields.length,
      };
      setFields([...fields, duplicatedField]);
    },
    [fields, setFields],
  );

  /**
   * Handles drag end event for reordering fields
   * @param {Object} result - Drag result from react-beautiful-dnd
   */
  const handleDragEnd = useCallback(
    (result) => {
      if (!result.destination) return;

      const { source, destination } = result;
      if (source.index === destination.index) return;

      const newFields = Array.from(fields);
      const [reorderedField] = newFields.splice(source.index, 1);
      newFields.splice(destination.index, 0, reorderedField);

      // Update sort_order for all fields
      setFields(
        newFields.map((field, index) => ({
          ...field,
          sort_order: index,
        })),
      );
    },
    [fields, setFields],
  );

  return (
    <Box>
      {/* Header */}
      <Group justify="space-between" mb="lg">
        <Box>
          <H3>{t('Form Fields')}</H3>
          <Text size="sm" c="dimmed">
            {t('Create and manage form fields with drag and drop functionality')}
          </Text>
        </Box>
      </Group>

      {/* Fields List */}
      <Box className="p-6 border shadow rounded bg-gray-zumthor">
        {/*region list of form fields*/}
        {fields.length === 0 ? (
          <Center>
            <Stack align="center" gap="md">
              <Box className="text-center text-gray-pale-sky">{t('No fields yet')}</Box>
            </Stack>
          </Center>
        ) : (
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="form-fields">
              {(provided) => (
                <div {...provided.droppableProps} ref={provided.innerRef}>
                  {fields.map((field, index) => (
                    <Draggable
                      key={field.id || field._id || index}
                      draggableId={String(field.id || field._id || index)}
                      index={index}
                    >
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                          style={{
                            ...provided.draggableProps.style,
                            opacity: snapshot.isDragging ? 0.8 : 1,
                          }}
                        >
                          <div className="relative mb-6">
                            <FieldEditor
                              key={field.id || field._id || index}
                              field={{
                                ...field,
                                _errors: fieldErrors[index] || field._errors,
                              }}
                              index={index}
                              onUpdate={(idx, updatedField) => {
                                // Remove _errors from the field when updating
                                const { ...cleanField } = updatedField;
                                updateField(idx, cleanField);
                              }}
                              onDelete={deleteField}
                              onDuplicate={duplicateField}
                              dragHandleProps={provided.dragHandleProps}
                            />
                            {fieldErrors[index]?.label && (
                              <div className="mt-1 text-sm text-red-600">
                                {fieldErrors[index].label}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </Draggable>
                  ))}
                  {provided.placeholder}
                </div>
              )}
            </Droppable>
          </DragDropContext>
        )}
        {/*endregion list of form fields*/}

        {/*region add field button*/}
        <Box className="text-center mt-6">
          <AddFieldButton onAddField={addField} variant="light" />
        </Box>
        {/*endregion add field button*/}
      </Box>
    </Box>
  );
};

export default FormFieldsBuilder;
