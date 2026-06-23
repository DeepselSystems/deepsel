import React, { useEffect, useState } from 'react';
import { Button, Group, Modal, Textarea } from '@mantine/core';
import { useTranslation } from 'react-i18next';

interface DescriptionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (description: string) => void;
  initialDescription?: string;
}

/**
 * Modal component for editing image description
 * Allows users to add or edit optional description text for images
 */
const DescriptionModal = ({
  isOpen,
  onClose,
  onSave,
  initialDescription = '',
}: DescriptionModalProps) => {
  const { t } = useTranslation();

  const [description, setDescription] = useState(initialDescription);

  const handleSave = () => {
    onSave(description.trim());
  };

  const handleCancel = () => {
    setDescription(initialDescription);
    onClose();
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      handleSave();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      handleCancel();
    }
  };

  useEffect(() => {
    setDescription(initialDescription);
  }, [initialDescription]);

  return (
    <Modal
      opened={isOpen}
      onClose={handleCancel}
      title={t('Edit Image Description')}
      size="md"
      centered
      closeOnClickOutside={false}
      closeOnEscape={true}
    >
      <div className="space-y-4">
        <div>
          <Textarea
            label={t('Description (Optional)')}
            placeholder={t('Enter a description for this image...')}
            value={description}
            onChange={(event) => setDescription(event.currentTarget.value)}
            onKeyDown={handleKeyDown}
            minRows={3}
            maxRows={6}
            autosize
            autoFocus
            description={t(
              'This description will appear below the image. Leave empty to hide description.',
            )}
          />
        </div>

        <Group justify="flex-end" gap="sm">
          <Button variant="subtle" onClick={handleCancel}>
            {t('Cancel')}
          </Button>
          <Button onClick={handleSave} variant="filled">
            {t('Save')}
          </Button>
        </Group>
      </div>
    </Modal>
  );
};

export default DescriptionModal;
