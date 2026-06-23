import { useTranslation } from 'react-i18next';
import { Menu } from '@mantine/core';
import SitePublicSettingsState from '../../stores/SitePublicSettingsState.js';
import { useMemo } from 'react';

export default function LangSwitcher() {
  const { i18n } = useTranslation();
  const { settings } = SitePublicSettingsState();

  const currentLocale = useMemo(
    () => settings?.available_languages?.find((lang) => lang.iso_code === i18n.language),
    [settings, i18n.language],
  );

  return (
    <Menu trapFocus position="bottom" shadow="md" padding={'xs'}>
      {/*{i18n.language}*/}
      <Menu.Target>
        <div className={`cursor-pointer`}>{currentLocale?.emoji_flag}</div>
      </Menu.Target>
      <Menu.Dropdown>
        {settings?.available_languages
          ?.filter((lang) => lang.iso_code !== i18n.language)
          .map((lang) => (
            <Menu.Item key={lang.name}>
              <div className={'text-[14px]'} onClick={() => i18n.changeLanguage(lang.iso_code)}>
                {lang.emoji_flag} {lang.name}
              </div>
            </Menu.Item>
          ))}
      </Menu.Dropdown>
    </Menu>
  );
}
