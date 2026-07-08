/**
 * Shared provider-icon registry, used by both the OIDC provider edit form and
 * the login-page chooser buttons. Brand logos are inline SVGs so the package
 * stays self-contained (no image assets in the library build). The default is a
 * generic key icon; custom uploads are stored as "attachment:<name>" and served
 * from the (unauthenticated) attachment endpoint so they render pre-login.
 */
import { IconKey } from '@tabler/icons-react';
import { getAttachmentByNameRelativeUrl } from '@deepsel/cms-utils/common/utils';

export const ATTACHMENT_ICON_PREFIX = 'attachment:';

export function GoogleLogo(props) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" {...props}>
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.14-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"
      />
      <path
        fill="#EA4335"
        d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"
      />
    </svg>
  );
}

export function MicrosoftLogo(props) {
  return (
    <svg viewBox="0 0 23 23" width="20" height="20" {...props}>
      <rect x="1" y="1" width="10" height="10" fill="#F25022" />
      <rect x="12" y="1" width="10" height="10" fill="#7FBA00" />
      <rect x="1" y="12" width="10" height="10" fill="#00A4EF" />
      <rect x="12" y="12" width="10" height="10" fill="#FFB900" />
    </svg>
  );
}

export function OktaLogo(props) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" {...props}>
      <path
        fill="#007DC1"
        d="M12 0C5.389 0 0 5.35 0 12s5.35 12 12 12 12-5.35 12-12S18.611 0 12 0zm0 18c-3.325 0-6-2.675-6-6s2.675-6 6-6 6 2.675 6 6-2.675 6-6 6z"
      />
    </svg>
  );
}

export function KeycloakLogo(props) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" {...props}>
      <path
        fill="#008AAA"
        fillRule="evenodd"
        d="M12 1.8 20.83 6.9v10.2L12 22.2 3.17 17.1V6.9L12 1.8Zm0 5.4a2.7 2.7 0 0 0-1.05 5.19L9.75 17.4h4.5l-1.2-5.01A2.7 2.7 0 0 0 12 7.2Z"
      />
    </svg>
  );
}

export function Auth0Logo(props) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" {...props}>
      <path
        fill="#EB5424"
        d="M21.98 7.448 19.62 0H4.347L2.02 7.448c-1.352 4.312.03 9.206 3.815 12.015L12.007 24l6.157-4.552c3.755-2.81 5.182-7.688 3.815-12.015l-6.16 4.58 2.343 7.45-6.157-4.597-6.158 4.58 2.358-7.433-6.188-4.55 7.63-.045L12.008 0l2.356 7.404 7.615.044Z"
      />
    </svg>
  );
}

export function CognitoLogo(props) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" {...props}>
      <rect x="1.5" y="1.5" width="21" height="21" rx="4.5" fill="#DD344C" />
      <circle cx="12" cy="9.3" r="3.3" fill="#fff" />
      <path fill="#fff" d="M12 14c-3.7 0-6.2 1.9-6.2 4.6v.4h12.4v-.4c0-2.7-2.5-4.6-6.2-4.6z" />
    </svg>
  );
}

function KeyLogo({ width = 22, height = 22, ...props }) {
  return <IconKey width={width} height={height} className="text-gray-500" {...props} />;
}

/** Preset key → icon component. `key` is the generic default. */
export const PROVIDER_ICONS = {
  key: KeyLogo,
  google: GoogleLogo,
  entra: MicrosoftLogo,
  okta: OktaLogo,
  keycloak: KeycloakLogo,
  auth0: Auth0Logo,
  cognito: CognitoLogo,
};

/** Preset keys shown as selectable swatches in the edit form, in display order. */
export const PRESET_ICON_KEYS = ['key', 'google', 'entra', 'okta', 'keycloak', 'auth0', 'cognito'];

/**
 * Renders a provider icon from its stored value: a preset key, an
 * "attachment:<name>" custom upload, or the key fallback for null/unknown.
 */
export function ProviderIcon({ icon, size = 20, className }) {
  if (typeof icon === 'string' && icon.startsWith(ATTACHMENT_ICON_PREFIX)) {
    const name = icon.slice(ATTACHMENT_ICON_PREFIX.length);
    return (
      <img
        src={getAttachmentByNameRelativeUrl(name)}
        alt=""
        width={size}
        height={size}
        className={`object-contain ${className || ''}`}
      />
    );
  }
  const Cmp = PROVIDER_ICONS[icon] || PROVIDER_ICONS.key;
  return <Cmp width={size} height={size} className={className} />;
}
