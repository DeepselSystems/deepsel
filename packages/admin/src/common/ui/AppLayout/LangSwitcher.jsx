import { useTranslation } from 'react-i18next';
import { Menu } from '@mantine/core';
import { useMemo } from 'react';
import { getFlagUrl } from '@deepsel/cms-utils/flags';
import SitePublicSettingsState from '../../stores/SitePublicSettingsState.js';

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
        <div className={`cursor-pointer`}>
          <img
            src={getFlagUrl(currentLocale?.iso_code ?? '')}
            alt={currentLocale?.name ?? ''}
            className="h-5 w-auto rounded-sm"
          />
        </div>
      </Menu.Target>
      <Menu.Dropdown>
        {settings?.available_languages
          ?.filter((lang) => lang.iso_code !== i18n.language)
          .map((lang) => (
            <Menu.Item key={lang.name}>
              <div className={'text-[14px]'} onClick={() => i18n.changeLanguage(lang.iso_code)}>
                <img
                  src={getFlagUrl(lang.iso_code)}
                  alt={lang.name}
                  className="h-4 w-auto rounded-sm inline-block"
                />{' '}
                {lang.name}
              </div>
            </Menu.Item>
          ))}
      </Menu.Dropdown>
    </Menu>
  );
}
