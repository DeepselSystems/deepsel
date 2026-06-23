import { Tooltip, Avatar } from '@mantine/core';
import BackendHostURLState from '../stores/BackendHostURLState.js';
import useAuthentication from '../api/useAuthentication.js';
import { getAttachmentUrl } from '../utils/index.js';

/**
 * Ambient presence indicator — renders an avatar row for everyone currently
 * editing the same record, including the current user. Fed by useEditSession's
 * activeEditors list.
 */
export default function ActiveEditorsAvatars({ editors }) {
  const { backendHost } = BackendHostURLState();
  const { user } = useAuthentication();

  const selfEditor = user
    ? {
        user_id: user.id,
        display_name:
          user.display_name ||
          [user.first_name, user.last_name].filter(Boolean).join(' ') ||
          user.username ||
          user.email,
        username: user.username,
        image: user.image,
        self: true,
      }
    : null;

  const others = (editors || []).filter((e) => !selfEditor || e.user_id !== selfEditor.user_id);
  const combined = selfEditor ? [selfEditor, ...others] : others;
  if (!combined.length) return null;

  const MAX_VISIBLE = 4;
  const visible = combined.slice(0, MAX_VISIBLE);
  const overflow = combined.length - visible.length;

  const names = combined.map((e) => e.display_name || e.username).filter(Boolean);
  const nameList =
    names.length <= 1
      ? names.join('')
      : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  const verb = names.length === 1 ? 'is' : 'are';
  const label = names.length ? `${nameList} ${verb} here` : null;

  return (
    <Tooltip label={label} disabled={!label}>
      <Avatar.Group spacing="xs">
        {visible.map((editor) => (
          <Avatar
            key={editor.user_id}
            name={editor.display_name || editor.username || ''}
            color="initials"
            src={editor?.image?.name ? getAttachmentUrl(backendHost, editor.image.name) : null}
            size="md"
          />
        ))}
        {overflow > 0 && (
          <Avatar size="md" radius="xl">
            +{overflow}
          </Avatar>
        )}
      </Avatar.Group>
    </Tooltip>
  );
}
