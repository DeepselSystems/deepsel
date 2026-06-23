import { Avatar } from '@mantine/core';
import type { AvatarProps } from '@mantine/core';
import { getAttachmentByNameRelativeUrl, stringAvatar } from '@deepsel/cms-utils';

/**
 * Authenticated user with an optional attached image
 */
interface AvatarUser {
  name?: string;
  email?: string;
  username?: string;
  image?: { name: string };
  [key: string]: unknown;
}

/**
 * External (non-local) user data, e.g. from a social provider
 */
interface ExternalUserData {
  name?: string;
  email?: string;
  username?: string;
  avatar_url?: string;
  [key: string]: unknown;
}

export interface UserAvatarProps extends Omit<AvatarProps, 'src' | 'alt' | 'children' | 'style'> {
  /** Local user object — used for image attachment and initials fallback */
  user?: AvatarUser | null;

  /** External user data — takes precedence over local user image */
  externalUserData?: ExternalUserData | null;
}

/**
 * Displays a user avatar — external avatar URL, local attachment image,
 * or auto-generated initials with a deterministic background color.
 */
export function UserAvatar({ user, externalUserData, ...props }: UserAvatarProps) {
  const getAvatarProps = (): AvatarProps => {
    if (externalUserData?.avatar_url) {
      const displayName =
        externalUserData.name || externalUserData.email || externalUserData.username;
      return { src: externalUserData.avatar_url, alt: displayName, ...props };
    }

    if (user?.image) {
      const displayName = user.name || user.email || user.username;
      return {
        src: getAttachmentByNameRelativeUrl(user.image.name),
        alt: displayName,
        ...props,
      };
    }

    const displayName =
      user?.name ||
      user?.email ||
      user?.username ||
      externalUserData?.name ||
      externalUserData?.email ||
      externalUserData?.username ||
      '';

    const { color, children } = stringAvatar(displayName);
    return { style: { backgroundColor: color }, children, ...props };
  };

  return <Avatar {...getAvatarProps()} />;
}
