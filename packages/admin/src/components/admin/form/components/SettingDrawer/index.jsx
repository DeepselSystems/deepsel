import { forwardRef, useImperativeHandle, useState } from 'react';
import { Box, Drawer, TagsInput, Textarea } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import FormContentSlugInput from '../FormContentSlugInput/index.jsx';
import H3 from '../../../../../common/ui/H3.jsx';
import Editor from 'react-simple-code-editor';
import { highlight, languages } from 'prismjs/components/prism-core.js';
import NumberInput from '../../../../../common/ui/NumberInput.jsx';
import Switch from '../../../../../common/ui/Switch.jsx';

/**
 * Form setting drawer
 * @type {React.ForwardRefExoticComponent<React.PropsWithoutRef<{
 * readonly localeId: string | number,
 * readonly form: Form,
 * readonly setForm: import('react').Dispatch<import('react').SetStateAction<Form>>,
 * readonly formContentsMap: Record<number, FormContent>,
 * readonly setFormContentMap: import('react').Dispatch<import('react').SetStateAction<Record<number, FormContent>>>}> &
 * React.RefAttributes<{
 *   open: () => void
 * }>>}
 */
const SettingDrawer = forwardRef(
  ({ localeId, form, setForm, formContentsMap, setFormContentMap }, ref) => {
    // Translation
    const { t } = useTranslation();

    // Init states
    const [opened, setOpened] = useState(false);
    const [emailValidationError, setEmailValidationError] = useState('');

    /**
     * Handle forms notification emails change
     * @param {Array<string>} emails - Array of email addresses
     */
    const handleFormsNotificationEmailsChange = (emails) => {
      // Check for invalid emails to show error
      const invalidEmails = emails.filter((email) => {
        const trimmedEmail = email.trim();
        return trimmedEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail);
      });

      // Set error message if there are invalid emails
      if (invalidEmails.length > 0) {
        setEmailValidationError(
          t('Invalid email format: {{emails}}', {
            emails: invalidEmails.join(', '),
          }),
        );
      } else {
        setEmailValidationError('');
      }

      // Filter out empty strings and validate email format
      const validEmails = emails.filter((email) => {
        const trimmedEmail = email.trim();
        return trimmedEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail);
      });

      // Call parent callback with processed emails
      setFormContentMap((prevState) => ({
        ...prevState,
        [localeId]: {
          ...prevState[localeId],
          notification_admin_emails: validEmails || [],
        },
      }));
    };

    /**
     * Handle ref
     */
    useImperativeHandle(ref, () => ({
      open: () => {
        setOpened(true);
      },
    }));

    return (
      <>
        <Drawer
          keepMounted
          opened={opened}
          onClose={() => setOpened(false)}
          title={<Box className="font-bold text-xl">{t('Settings')}</Box>}
          size="md"
          position="right"
          transitionProps={{ transition: 'slide-left', duration: 200 }}
        >
          {formContentsMap[localeId] && (
            <Box className="space-y-6">
              {/* region Form settings */}
              <div className="space-y-3">
                <H3>{t('Form settings')}</H3>
                <FormContentSlugInput
                  contentId={formContentsMap[localeId].id || null}
                  localeId={localeId}
                  title={formContentsMap[localeId].title}
                  value={formContentsMap[localeId].slug}
                  error={formContentsMap[localeId]?._errors?.slug}
                  onChange={(newSlug) =>
                    setFormContentMap((prevState) => ({
                      ...prevState,
                      [localeId]: {
                        ...prevState[localeId],
                        slug: newSlug,
                        // Clear error when user starts typing
                        ...(prevState[localeId]?._errors?.slug && {
                          _errors: {
                            ...prevState[localeId]._errors,
                            slug: undefined,
                          },
                        }),
                      },
                    }))
                  }
                />

                <Textarea
                  autosize
                  label={t('Form description')}
                  placeholder={t('Enter form title for this language')}
                  description={t('')}
                  minRows={2}
                  maxRows={5}
                  maxLength={1000}
                  value={formContentsMap[localeId].description || ''}
                  onChange={({ target: { value } }) =>
                    setFormContentMap((prevState) => ({
                      ...prevState,
                      [localeId]: {
                        ...prevState[localeId],
                        description: value,
                      },
                    }))
                  }
                />

                <Textarea
                  autosize
                  label={t('Closing remarks')}
                  placeholder={t('Enter closing remarks for this language')}
                  description={t('Closing remarks shown after form')}
                  minRows={2}
                  maxRows={5}
                  maxLength={1000}
                  value={formContentsMap[localeId].closing_remarks || ''}
                  onChange={({ target: { value } }) =>
                    setFormContentMap((prevState) => ({
                      ...prevState,
                      [localeId]: {
                        ...prevState[localeId],
                        closing_remarks: value,
                      },
                    }))
                  }
                />

                <Textarea
                  autosize
                  label={t('Success message')}
                  placeholder={t('Message shown after successful submission')}
                  description={t('Message shown after successful submission')}
                  minRows={2}
                  maxRows={5}
                  maxLength={1000}
                  value={formContentsMap[localeId].success_message || ''}
                  onChange={({ target: { value } }) =>
                    setFormContentMap((prevState) => ({
                      ...prevState,
                      [localeId]: {
                        ...prevState[localeId],
                        success_message: value,
                      },
                    }))
                  }
                />
              </div>
              {/* endregion Form settings */}

              {/* region Submission settings */}
              <div className="space-y-3">
                <H3>{t('Submission settings')}</H3>
                <NumberInput
                  classNames={{
                    label: 'px-0 !text-sm',
                    description: 'px-0 !text-sm',
                  }}
                  allowDecimal={false}
                  allowNegative={false}
                  label={t('Maximum number of submissions')}
                  description={t(
                    'Set a limit on how many responses this form can receive. Once the maximum is reached, the form will automatically close and no longer accept new submissions. Leave this field empty to allow unlimited submissions.',
                  )}
                  value={formContentsMap[localeId].max_submissions}
                  onChange={(value) =>
                    setFormContentMap((prevState) => ({
                      ...prevState,
                      [localeId]: {
                        ...prevState[localeId],
                        max_submissions: value,
                      },
                    }))
                  }
                />
                <Switch
                  classNames={{
                    label: '!px-0 !text-sm',
                    description: '!px-0 !text-sm',
                    body: 'flex-col flex-col-reverse gap-1',
                  }}
                  label={t('Show remaining submissions')}
                  description={t(
                    'Whether to display remaining submission count to visitors. Only applicable when max_submissions is set.',
                  )}
                  checked={formContentsMap[localeId].show_remaining_submissions}
                  onChange={({ currentTarget: { checked } }) =>
                    setFormContentMap((prevState) => ({
                      ...prevState,
                      [localeId]: {
                        ...prevState[localeId],
                        show_remaining_submissions: checked,
                      },
                    }))
                  }
                />
                <Switch
                  classNames={{
                    label: '!px-0 !text-sm',
                    description: '!px-0 !text-sm',
                    body: 'flex-col flex-col-reverse gap-1',
                  }}
                  label={t('Allow edit submission')}
                  description={t(
                    'Allow users to edit their submissions. Previous submissions will be saved in history.',
                  )}
                  checked={formContentsMap[localeId].enable_edit_submission}
                  onChange={({ currentTarget: { checked } }) =>
                    setFormContentMap((prevState) => ({
                      ...prevState,
                      [localeId]: {
                        ...prevState[localeId],
                        enable_edit_submission: checked,
                      },
                    }))
                  }
                />
              </div>
              {/* endregion Submission settings */}

              {/*region notification*/}
              <div className="space-y-3">
                <H3>{t('Notifications')}</H3>

                <div className="space-y-2">
                  <Switch
                    classNames={{
                      label: '!px-0 !text-sm !font-semibold !text-gray-700',
                      description: '!px-0 !my-0 !text-sm',
                      body: 'flex-col flex-col-reverse gap-1',
                    }}
                    checked={formContentsMap[localeId].enable_admin_email_notifications}
                    onChange={({ currentTarget: { checked } }) =>
                      setFormContentMap((prevState) => ({
                        ...prevState,
                        [localeId]: {
                          ...prevState[localeId],
                          enable_admin_email_notifications: checked,
                        },
                      }))
                    }
                    label={t('Notify to admin')}
                    description={t('Send notification to admin(s) when a submission is received.')}
                  />
                  {!!formContentsMap[localeId].enable_admin_email_notifications && (
                    <TagsInput
                      label={t('Admin email(s)')}
                      description={t(
                        'Enter email addresses to receive notifications when new form submissions are received.',
                      )}
                      placeholder={t('Enter email address and press Enter')}
                      value={formContentsMap[localeId].notification_admin_emails || []}
                      onChange={handleFormsNotificationEmailsChange}
                      className="mb-4"
                      clearable
                      splitChars={[',', ' ', ';']}
                      maxDropdownHeight={200}
                      error={emailValidationError || null}
                    />
                  )}
                </div>

                <Switch
                  classNames={{
                    label: '!px-0 !text-sm !font-semibold !text-gray-700',
                    description: '!px-0 !my-0 !text-sm',
                    body: 'flex-col flex-col-reverse gap-1',
                  }}
                  checked={formContentsMap[localeId].enable_submitter_email_notifications}
                  onChange={({ currentTarget: { checked } }) =>
                    setFormContentMap((prevState) => ({
                      ...prevState,
                      [localeId]: {
                        ...prevState[localeId],
                        enable_submitter_email_notifications: checked,
                      },
                    }))
                  }
                  label={t('Notify to submitter')}
                  description={t(
                    'Send confirmation email to logged-in users only. Anonymous submissions will not receive notifications.',
                  )}
                />
              </div>
              {/*endregion notification*/}

              {/*region statistics*/}
              <div className="space-y-3">
                <div>
                  <H3>{t('Statistics')}</H3>
                  <p className="text-gray-pale-sky text-sm">
                    {t(
                      'Form statistics such as number of views, submissions, and distribution of answers.',
                    )}
                  </p>
                </div>
                <Switch
                  classNames={{
                    label: '!px-0 !text-sm !font-semibold !text-gray-700',
                    description: '!px-0 !my-0 !text-sm',
                    body: 'flex-col flex-col-reverse gap-1',
                  }}
                  checked={formContentsMap[localeId].enable_public_statistics}
                  onChange={({ currentTarget: { checked } }) =>
                    setFormContentMap((prevState) => ({
                      ...prevState,
                      [localeId]: {
                        ...prevState[localeId],
                        enable_public_statistics: checked,
                      },
                    }))
                  }
                  label={t('Public')}
                  description={t('Public statistics will be visible to all users.')}
                />
              </div>
              {/*endregion statistics*/}

              {/* region Custom Code Section */}
              <div className="space-y-3">
                <H3>{t('Custom Code')}</H3>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('Language-specific custom code')}
                  </label>
                  <p className="text-xs text-gray-500 mb-2">
                    {t(
                      'This code will be injected only for this language version of the form, after the form content.',
                    )}
                  </p>
                  <div className="bg-gray-50 border border-gray-300 rounded overflow-auto h-36">
                    <Editor
                      className="w-full text-xs"
                      value={formContentsMap[localeId].custom_code || ''}
                      onValueChange={(code) =>
                        setFormContentMap((prevState) => ({
                          ...prevState,
                          [localeId]: {
                            ...prevState[localeId],
                            custom_code: code,
                          },
                        }))
                      }
                      highlight={(code) => highlight(code, languages.markup, 'html')}
                      padding={10}
                      textareaClassName="focus:outline-none"
                      placeholder="<!-- Enter HTML, CSS, or JavaScript code here -->"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    {t('Form custom code (all languages)')}
                  </label>
                  <p className="text-xs text-gray-500 mb-2">
                    {t(
                      'This code will be injected in all language versions of this form, after the form content.',
                    )}
                  </p>
                  <div className="bg-gray-50 border border-gray-300 rounded overflow-auto h-36">
                    <Editor
                      className="w-full text-xs"
                      value={form?.form_custom_code || ''}
                      onValueChange={(code) =>
                        setForm((prevState) => ({
                          ...prevState,
                          form_custom_code: code,
                        }))
                      }
                      highlight={(code) => highlight(code, languages.markup, 'html')}
                      padding={10}
                      textareaClassName="focus:outline-none"
                      placeholder="<!-- Enter HTML, CSS, or JavaScript code here -->"
                    />
                  </div>
                </div>
              </div>
              {/* endregion Custom Code Section */}
            </Box>
          )}
        </Drawer>
      </>
    );
  },
);

SettingDrawer.displayName = 'SettingDrawer';
export default SettingDrawer;
