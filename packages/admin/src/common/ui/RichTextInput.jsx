import React from 'react';
import { RichTextInput as BaseRichTextInput } from '../lib/editor/RichTextInput/RichTextInput';
import BackendHostURLState from '../stores/BackendHostURLState.js';
import UserState from '../stores/UserState.js';
import NotificationState from '../stores/NotificationState.js';
import SitePublicSettingsState from '../stores/SitePublicSettingsState.js';
import OrganizationIdState from '../stores/OrganizationIdState.js';

const RichTextInput = React.forwardRef(function RichTextInput(props, ref) {
  const { backendHost } = BackendHostURLState();
  const { user, setUser } = UserState();
  const { notify } = NotificationState();
  const { settings: siteSettings } = SitePublicSettingsState();
  const { organizationId } = OrganizationIdState();

  return (
    <BaseRichTextInput
      ref={ref}
      backendHost={backendHost}
      user={user}
      setUser={setUser}
      notify={notify}
      siteSettings={siteSettings}
      organizationId={organizationId}
      {...props}
    />
  );
});

export default RichTextInput;
