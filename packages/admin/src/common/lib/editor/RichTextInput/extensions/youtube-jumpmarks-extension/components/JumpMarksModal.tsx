import React, { useEffect, useState } from 'react';
import {
  ActionIcon,
  Alert,
  Box,
  Button,
  Collapse,
  Group,
  Modal,
  Stack,
  Switch,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import {
  IconArrowDown,
  IconArrowUp,
  IconInfoCircle,
  IconPlus,
  IconTrash,
} from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { YOUTUBE_REG_EXP } from '../utils';
import type { JumpMark, JumpMarkData } from '../types';

interface JumpMarksModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: JumpMarkData) => void;
  initialData?: JumpMarkData | null;
}

/**
 * Modal component for inserting YouTube videos with jump marks
 * Provides interface for URL input and jump marks management
 *
 * @constructor
 */
const JumpMarksModal = ({ isOpen, onClose, onSave, initialData = null }: JumpMarksModalProps) => {
  const { t } = useTranslation();

  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [videoTitle, setVideoTitle] = useState('');
  const [jumpMarks, setJumpMarks] = useState<JumpMark[]>([]);
  const [showJumpMarks, setShowJumpMarks] = useState(true);

  const [urlError, setUrlError] = useState('');

  useEffect(() => {
    if (initialData) {
      setYoutubeUrl(initialData.src || '');
      setVideoTitle(initialData.title || '');
      setJumpMarks(initialData.jumpMarks || []);
      setShowJumpMarks(initialData.showJumpMarks !== false);
    } else {
      resetForm();
    }
  }, [initialData, isOpen]);

  /**
   * Reset form to initial state
   */
  const resetForm = () => {
    setYoutubeUrl('');
    setVideoTitle('');
    setJumpMarks([]);
    setShowJumpMarks(true);
    setUrlError('');
  };

  /**
   * Validate YouTube URL
   * @param {string} url - URL to validate
   * @returns {boolean} Is valid
   */
  const validateYouTubeUrl = (url: string): boolean => {
    if (!url.trim()) {
      setUrlError(t('YouTube URL is required'));
      return false;
    }

    const isValid = YOUTUBE_REG_EXP.test(url);

    if (!isValid) {
      setUrlError(t('Please enter a valid YouTube URL'));
      return false;
    }

    setUrlError('');
    return true;
  };

  /**
   * Add new jump mark
   */
  const addJumpMark = () => {
    const newJumpMark: JumpMark = {
      time: 0,
      label: '',
      description: '',
    };
    setJumpMarks([...jumpMarks, newJumpMark]);
  };

  /**
   * Update jump mark
   * @param {number} index - Jump mark index
   * @param {string} field - Field to update
   * @param {any} value - New value
   */
  const updateJumpMark = (index: number, field: keyof JumpMark, value: string | number) => {
    setJumpMarks((prevState) => {
      const newState = [...prevState];
      if (newState[index]) {
        newState[index] = {
          ...newState[index],
          [field]: value,
        };
      }
      return newState;
    });
  };

  /**
   * Remove jump mark
   * @param {number} index - Jump mark index
   */
  const removeJumpMark = (index: number) => {
    setJumpMarks((prevState) => {
      const newState = [...prevState];
      newState.splice(index, 1);
      return newState;
    });
  };

  /**
   * Move jump mark up/down
   * @param {number} index - Jump mark index
   * @param {string} direction - 'up' or 'down'
   */
  const moveJumpMark = (index: number, direction: 'up' | 'down') => {
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= jumpMarks.length) return;

    setJumpMarks((prevState) => {
      const newState = [...prevState];
      [newState[index], newState[newIndex]] = [newState[newIndex], newState[index]];
      return newState;
    });
  };

  /**
   * Convert time input (MM:SS) to seconds
   * @param {string} timeStr - Time string in MM:SS format
   * @returns {number} Time in seconds
   */
  const parseTimeInput = (timeStr: string): number => {
    if (!timeStr) return 0;

    const parts = timeStr.split(':');
    if (parts.length === 1) {
      return parseInt(parts[0]) || 0;
    }

    const minutes = parseInt(parts[0]) || 0;
    const seconds = parseInt(parts[1]) || 0;
    return minutes * 60 + seconds;
  };

  /**
   * Convert seconds to MM:SS format
   * @param {number} seconds - Time in seconds
   * @returns {string} Formatted time
   */
  const formatTimeInput = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  /**
   * Handle form submission
   */
  const handleSave = () => {
    if (!validateYouTubeUrl(youtubeUrl)) {
      return;
    }

    const validJumpMarks = jumpMarks
      .filter((mark) => mark.label.trim())
      .map((mark) => ({
        time: mark.time,
        label: mark.label?.trim(),
        description: mark.description.trim(),
      }));

    const data: JumpMarkData = {
      src: youtubeUrl.trim(),
      title: videoTitle?.trim(),
      jumpMarks: validJumpMarks,
      showJumpMarks: showJumpMarks && validJumpMarks.length > 0,
    };

    onSave(data);
    onClose();
    resetForm();
  };

  /**
   * Handle modal close
   */
  const handleClose = () => {
    onClose();
    resetForm();
  };

  return (
    <Modal
      opened={isOpen}
      onClose={handleClose}
      title={
        initialData
          ? t('Update YouTube Video with Jump Marks')
          : t('Insert YouTube Video with Jump Marks')
      }
      size="lg"
      centered
    >
      <Stack>
        {/* YouTube URL Input */}
        <TextInput
          label={t('YouTube URL')}
          placeholder={t('Enter YouTube URL')}
          value={youtubeUrl}
          onChange={(e) => {
            setYoutubeUrl(e.target.value);
            if (urlError) validateYouTubeUrl(e.target.value);
          }}
          error={urlError}
          required
        />

        {/* Video Title Input */}
        <TextInput
          label={t('Video Title')}
          placeholder={t('Enter title for the video')}
          value={videoTitle}
          onChange={(e) => setVideoTitle(e.target.value)}
          description={t('If left empty, no title will be displayed above the video')}
        />

        <Alert icon={<IconInfoCircle size={16} />} color="blue">
          {t('Supported formats: youtube.com/watch?v=ID, youtu.be/ID, youtube.com/embed/ID')}
        </Alert>

        {/* Show Jump Marks Checkbox */}
        <Switch
          label={t('Show jump marks list below video')}
          checked={showJumpMarks}
          onChange={(e) => setShowJumpMarks(e.currentTarget.checked)}
        />

        {/* Jump Marks Section - Collapsible */}
        <Collapse in={showJumpMarks}>
          <Stack>
            <Group>
              <Text size="sm">
                {t('Jump Marks')} ({jumpMarks.length})
              </Text>
              <Button size="xs" leftSection={<IconPlus size={16} />} onClick={addJumpMark}>
                {t('Add Jump Mark')}
              </Button>
            </Group>

            {jumpMarks.length === 0 ? (
              <Text size="sm" ta="center" py="xl">
                {t('No jump marks added yet.')}
              </Text>
            ) : (
              <Stack>
                {jumpMarks.map((mark, index) => (
                  <div
                    key={index}
                    className="border border-gray-200 rounded-lg p-3 bg-gray-50 space-y-3"
                  >
                    <Group>
                      <TextInput
                        placeholder="0:30"
                        value={formatTimeInput(mark.time)}
                        onChange={(e) => {
                          const seconds = parseTimeInput(e.target.value);
                          updateJumpMark(index, 'time', seconds);
                        }}
                        size="xs"
                        w={80}
                      />

                      <TextInput
                        placeholder={t('Jump mark title')}
                        value={mark.label}
                        onChange={(e) => updateJumpMark(index, 'label', e.target.value)}
                        size="xs"
                        style={{ flex: 1 }}
                      />

                      <ActionIcon
                        size="sm"
                        onClick={() => moveJumpMark(index, 'up')}
                        disabled={index === 0}
                      >
                        <IconArrowUp size={18} />
                      </ActionIcon>

                      <ActionIcon
                        size="sm"
                        onClick={() => moveJumpMark(index, 'down')}
                        disabled={index === jumpMarks.length - 1}
                      >
                        <IconArrowDown size={18} />
                      </ActionIcon>

                      <ActionIcon size="sm" color="red" onClick={() => removeJumpMark(index)}>
                        <IconTrash size={18} />
                      </ActionIcon>
                    </Group>

                    <Textarea
                      hidden
                      placeholder={t('Optional description')}
                      value={mark.description}
                      onChange={(e) => updateJumpMark(index, 'description', e.target.value)}
                      size="xs"
                      minRows={1}
                      maxRows={3}
                    />
                  </div>
                ))}
              </Stack>
            )}
          </Stack>
        </Collapse>
      </Stack>

      <Box className="flex justify-end gap-1 mt-3">
        <Button variant="outline" onClick={handleClose}>
          {t('Cancel')}
        </Button>
        <Button onClick={handleSave}>{initialData ? t('Update') : t('Insert Video')}</Button>
      </Box>
    </Modal>
  );
};

export default JumpMarksModal;
