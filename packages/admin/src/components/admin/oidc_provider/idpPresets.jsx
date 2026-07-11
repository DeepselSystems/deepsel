/**
 * Quick-setup templates for popular OIDC identity providers, used by the
 * create form to prefill issuer/adapter/scopes/icon. Brand logos live in
 * ./providerIcons.jsx (shared with the login-page chooser).
 */
import {
  GoogleLogo,
  MicrosoftLogo,
  OktaLogo,
  KeycloakLogo,
  Auth0Logo,
  CognitoLogo,
} from './providerIcons.jsx';

export const IDP_PRESETS = [
  {
    key: 'google',
    name: 'Google',
    logo: <GoogleLogo />,
    issuerHint: 'Google uses a fixed issuer — no changes needed.',
    values: {
      display_name: 'Google',
      adapter_name: 'oidc',
      issuer_url: 'https://accounts.google.com',
      scopes: 'openid email profile',
      icon: 'google',
    },
  },
  {
    key: 'entra',
    name: 'Microsoft Entra ID',
    logo: <MicrosoftLogo />,
    issuerHint: 'Replace {tenant-id} with your Entra directory (tenant) ID.',
    values: {
      display_name: 'Microsoft',
      adapter_name: 'entra',
      issuer_url: 'https://login.microsoftonline.com/{tenant-id}/v2.0',
      scopes: 'openid email profile',
      icon: 'entra',
    },
  },
  {
    key: 'okta',
    name: 'Okta',
    logo: <OktaLogo />,
    issuerHint: 'Replace {your-domain} with your Okta org domain.',
    values: {
      display_name: 'Okta',
      adapter_name: 'oidc',
      issuer_url: 'https://{your-domain}.okta.com',
      scopes: 'openid email profile',
      icon: 'okta',
    },
  },
  {
    key: 'keycloak',
    name: 'Keycloak',
    logo: <KeycloakLogo />,
    issuerHint: 'Replace {keycloak-host} and {realm} with your server and realm.',
    values: {
      display_name: 'Keycloak',
      adapter_name: 'oidc',
      issuer_url: 'https://{keycloak-host}/realms/{realm}',
      scopes: 'openid email profile',
      icon: 'keycloak',
    },
  },
  {
    key: 'auth0',
    name: 'Auth0',
    logo: <Auth0Logo />,
    issuerHint: 'Replace {your-tenant} with your Auth0 tenant domain.',
    values: {
      display_name: 'Auth0',
      adapter_name: 'auth0',
      issuer_url: 'https://{your-tenant}.auth0.com',
      scopes: 'openid email profile',
      icon: 'auth0',
    },
  },
  {
    key: 'cognito',
    name: 'AWS Cognito',
    logo: <CognitoLogo />,
    issuerHint: 'Replace {region} and {user-pool-id} with your Cognito pool values.',
    values: {
      display_name: 'AWS Cognito',
      adapter_name: 'cognito',
      issuer_url: 'https://cognito-idp.{region}.amazonaws.com/{user-pool-id}',
      scopes: 'openid email profile',
      icon: 'cognito',
    },
  },
];
