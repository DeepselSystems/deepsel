import React from 'react';
import { Modal, Image } from '@mantine/core';

interface ImageViewModalProps {
  isOpen: boolean;
  close: () => void;
  imageUrl?: string;
}

/**
 * Modal for viewing a full-size image
 */
export const ImageViewModal = ({ isOpen, close, imageUrl }: ImageViewModalProps) => {
  return (
    <Modal opened={isOpen} onClose={close} size="xl" centered>
      <Image src={imageUrl} alt="" />
    </Modal>
  );
};
