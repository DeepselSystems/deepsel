import React from 'react';
import { Box, Button, TextInput, Group, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { IconCheck, IconEdit, IconRefresh } from '@tabler/icons-react';

interface LabelAndDescriptionProps {
  label?: React.ReactNode;
  description?: React.ReactNode;
  required?: boolean;
}

/** Renders label and description for SecretInput */
const LabelAndDescription = React.memo(
  ({ label, description, required = false }: LabelAndDescriptionProps) => {
    return (
      <>
        {label && (
          <Text size="sm" fw={500} mb={0}>
            {label}{' '}
            {required && (
              <Box component="span" className="text-danger-main">
                {' '}
                *
              </Box>
            )}
          </Text>
        )}
        {description && (
          <Text size="xs" c="dimmed" mb={8}>
            {description}
          </Text>
        )}
      </>
    );
  },
);

LabelAndDescription.displayName = 'LabelAndDescription';

export interface SecretInputRef {
  setDone: () => void;
}

interface SecretInputProps {
  truncateSecret?: string;
  editingValue?: string;
  setEditingValue?: React.Dispatch<React.SetStateAction<string>>;
  label?: string;
  description?: string;
  required?: boolean;
}

/**
 * Secret input control - displays truncated secrets with edit/reset capability
 */
export const SecretInput = React.forwardRef<SecretInputRef, SecretInputProps>(
  (
    { truncateSecret, editingValue, setEditingValue, label, description, required = false },
    ref,
  ) => {
    const { t } = useTranslation();
    const [isEditing, setIsEditing] = React.useState(false);

    /** Switches to edit mode */
    const handleEditClick = React.useCallback(() => {
      setIsEditing(true);
    }, []);

    /** Confirms changes and exits edit mode */
    const handleDoneClick = React.useCallback(() => {
      setIsEditing(false);
    }, []);

    /** Clears value and exits edit mode without saving */
    const handleResetClick = React.useCallback(() => {
      setEditingValue?.('');
      setIsEditing(false);
    }, [setEditingValue]);

    React.useImperativeHandle(ref, () => ({ setDone: handleDoneClick }), [handleDoneClick]);

    if (isEditing) {
      return (
        <Box>
          <LabelAndDescription required={required} label={label} description={description} />
          <Group gap="sm" className="w-full">
            <TextInput
              autoFocus
              required={required}
              value={editingValue}
              onChange={({ target: { value } }) => setEditingValue?.(value)}
              placeholder={t('Enter new secret...')}
              className="flex-1"
              size="sm"
            />
            <Button
              size="sm"
              variant="filled"
              color="blue"
              leftSection={<IconCheck size={16} />}
              disabled={!editingValue}
              onClick={handleDoneClick}
              className="shrink-0"
            >
              {t('Done')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              color="blue"
              leftSection={<IconRefresh size={16} />}
              onClick={handleResetClick}
              className="shrink-0"
            >
              {t('Reset')}
            </Button>
          </Group>
        </Box>
      );
    }

    return (
      <Box>
        <LabelAndDescription required={required} label={label} description={description} />
        <Group gap="sm" className="w-full" wrap="nowrap">
          <Box className="flex-1 px-3 py-2 bg-gray-50 rounded-md border border-gray-200 truncate">
            <span className="text-sm text-gray-700 font-mono">
              {editingValue || truncateSecret || t('No secret available')}
            </span>
          </Box>
          <Box>
            <Button
              size="sm"
              variant="outline"
              color="blue"
              leftSection={<IconEdit size={16} />}
              onClick={handleEditClick}
              className="shrink-0"
            >
              {t('Edit')}
            </Button>
          </Box>
        </Group>
      </Box>
    );
  },
);

SecretInput.displayName = 'SecretInput';
