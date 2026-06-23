import React from 'react';
import { CreateFormActionBar } from '../CreateFormActionBar/CreateFormActionBar';
import { Card } from '../Card';

export interface CreateFormWrapperProps {
  /** When true, hides the Back button and reverses layout (for modal use) */
  modalMode?: boolean;

  /** Form submit handler */
  onSubmit?: React.FormEventHandler<HTMLFormElement>;

  /** Whether the form is currently submitting */
  loading?: boolean;

  /** When true (default), wraps children in a Card. Set to false for a plain layout. */
  cardMode?: boolean;

  /** Additional className applied to the form element */
  className?: string;

  /** Form field content */
  children?: React.ReactNode;

  /** Custom action elements passed through to CreateFormActionBar */
  customActions?: React.ReactNode;

  /** Optional title passed through to CreateFormActionBar */
  title?: string;
}

/**
 * Wrapper for create forms — renders a responsive form with an action bar
 * (Back + Save buttons) and optionally wraps content in a Card.
 */
export function CreateFormWrapper({
  modalMode,
  onSubmit,
  loading,
  cardMode = true,
  className,
  children,
  customActions,
  title,
}: CreateFormWrapperProps) {
  return (
    <form
      onSubmit={onSubmit}
      className={`max-w-screen-xl m-auto flex ${
        modalMode ? 'flex-col-reverse' : 'px-[24px] my-[20px] flex-col'
      } ${className || ''}`}
    >
      <CreateFormActionBar
        loading={loading}
        modalMode={modalMode}
        customActions={customActions}
        title={title}
      />

      {cardMode ? (
        <Card className={modalMode ? 'border-none shadow-none !p-0' : undefined}>{children}</Card>
      ) : (
        children
      )}
    </form>
  );
}
