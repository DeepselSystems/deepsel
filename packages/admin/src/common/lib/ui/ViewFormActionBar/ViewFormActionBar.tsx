import React from 'react';
import { useTranslation } from 'react-i18next';

import { useNavigate } from 'react-router-dom';
import { Button } from '../Button';
import { useBack } from '../../hooks';
import type { User } from '../../types';
import type { NotifyFn } from '../../types';
import { IconArrowLeft, IconPencil, IconTrash } from '@tabler/icons-react';

/** Subset of useModel return values used by this component */
interface ViewFormQuery {
  /** Whether an async operation is in progress */
  loading: boolean;
  /** The currently loaded record */
  record: Record<string, unknown> | null;
  /** Opens a confirmation dialog then deletes the given record IDs */
  deleteWithConfirm: (
    recordIds: Array<string | number>,
    callback?: (() => void) | null,
    onErr?: ((e: unknown) => void) | null,
  ) => Promise<void>;
  /** Archives the given record */
  archive?: (record: Record<string, unknown>) => Promise<void>;
}

export interface ViewFormActionBarProps {
  /** Query object from useModel */
  query: ViewFormQuery;

  /**
   * Currently authenticated user.
   * Typically sourced from UserState.
   */
  user: User | null;

  /** Whether the Edit button is shown. Defaults to true */
  allowEdit?: boolean;

  /** Whether the Delete button is shown. Defaults to true */
  allowDelete?: boolean;

  /** Role string_ids that may edit. Empty array means all roles can edit */
  allowEditRoleIds?: string[];

  /** Role string_ids that may delete. Empty array means all roles can delete */
  allowDeleteRoleIds?: string[];

  /** Replaces the default Edit/Delete button group */
  customActions?: React.ReactNode;

  /** Optional title (reserved for future use, not rendered) */
  title?: string;

  /**
   * Callback to display toast/snackbar notifications.
   * Sourced from the consuming app's notification store
   * (e.g. `NotificationState.getState().notify`).
   */
  notify: NotifyFn;
}

/**
 * Action bar for view/detail forms with a Back button and Edit/Delete actions.
 * Role-based visibility is controlled via allowEditRoleIds / allowDeleteRoleIds.
 * Requires user prop (sourced from UserState in the consuming app).
 */
export function ViewFormActionBar({
  query,
  user,
  allowEdit = true,
  allowDelete = true,
  allowEditRoleIds = [],
  allowDeleteRoleIds = [],
  customActions,
  notify,
}: ViewFormActionBarProps) {
  const { t } = useTranslation();
  const { loading, deleteWithConfirm, record, archive } = query;
  const navigate = useNavigate();
  const { back } = useBack();

  const userRoleIds =
    (user?.all_roles as Array<{ string_id: string }> | undefined)?.map((rec) => rec.string_id) ??
    [];
  const roleCanEdit = allowEditRoleIds.some((roleId) => userRoleIds.includes(roleId));
  const roleCanDelete = allowDeleteRoleIds.some((roleId) => userRoleIds.includes(roleId));

  const canEdit =
    allowEdit && (allowEditRoleIds.length > 0 ? roleCanEdit : true) && !record?.system;
  const canDelete =
    allowDelete && (allowDeleteRoleIds.length > 0 ? roleCanDelete : true) && !record?.system;

  function handleDelete() {
    try {
      void deleteWithConfirm(
        [record!.id as string | number],
        () => {
          void navigate(-1);
        },
        (error) =>
          notify({
            message: (error as Error).message,
            type: 'error',
          }),
      );
    } catch (e) {
      console.error(e);
      notify({
        message: (e as Error).message,
        type: 'error',
      });
    }
  }

  async function handleArchive() {
    try {
      await archive!(record!);
      notify({
        message: 'Archived successfully!',
        type: 'success',
      });
      void navigate(-1);
    } catch (e) {
      console.error(e);
      notify({
        message: (e as Error).message,
        type: 'error',
      });
    }
  }

  // Suppress unused warning — archive is exposed via query but not wired to a button
  void handleArchive;

  return (
    <div className="flex w-full justify-between roles-end mb-[12px] flex-wrap gap-2">
      <div className="flex items-center">
        <Button
          className="shadow text-[14px] font-[600] mr-2"
          variant="outline"
          onClick={() => back()}
        >
          <IconArrowLeft size={18} className="mr-1" />
          <span className="hidden sm:block">{t('Back')}</span>
        </Button>
      </div>

      {customActions ? (
        customActions
      ) : (
        <div className="flex items-center gap-1">
          {canEdit && (
            <Button
              className="shadow text-[14px] font-[600]"
              onClick={() => void navigate('edit')}
              disabled={loading}
              loading={loading}
              variant="filled"
            >
              <IconPencil size={18} className="mr-2" />
              {t('Edit')}
            </Button>
          )}
          {canDelete && (
            <Button variant="outline" onClick={handleDelete}>
              <IconTrash size={18} className="mr-2" />
              {t('Delete')}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
