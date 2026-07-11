import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronDown, faCheck } from '@fortawesome/free-solid-svg-icons';
import { useClickOutside } from '@mantine/hooks';

/** Minimum number of orgs required to show a dropdown instead of a static row */
const MULTI_ORG_THRESHOLD = 1;

const FIELD_LABEL_CLASS = 'mb-1.5 block text-[12px] font-semibold text-[#6b7385]';
const ROW_CLASS =
  'flex items-center gap-3 rounded-[10px] border border-[#e6e9f0] bg-[#f7f9fc] px-3 py-2';

/** Derives up-to-two-letter initials from an org name. */
function orgInitials(name) {
  if (!name) return '?';
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) {
    return (words[0][0] + words[1][0]).toUpperCase();
  }
  return name.trim().slice(0, 2).toUpperCase();
}

/** Round avatar showing an org's initials — mirrors the portal's entity avatars. */
function OrgAvatar({ name }) {
  return (
    <div className="flex h-8 w-8 flex-none items-center justify-center rounded-full bg-[linear-gradient(135deg,#374151,#111827)] text-[12px] font-bold text-white">
      {orgInitials(name)}
    </div>
  );
}

/**
 * Displays the organization selector for the login flow.
 * A custom portal-styled visualizer (avatar + name): a static row for a single
 * org, a dropdown for multiple orgs, or nothing when no orgs are available.
 *
 * @param {Array} organizations - List of {id, name} org objects.
 * @param {number|null} organizationId - Currently selected org ID.
 * @param {function} onChange - Called with the new org ID (number) when selection changes.
 */
export default function OrgSelector({ organizations, organizationId, onChange }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const dropdownRef = useClickOutside(() => setOpen(false));

  if (organizations.length === 0) {
    return null;
  }

  // Single org — static visualizer row
  if (organizations.length <= MULTI_ORG_THRESHOLD) {
    const singleOrg = organizations[0];
    return (
      <div>
        <span className={FIELD_LABEL_CLASS}>{t('Organization')}</span>
        <div className={ROW_CLASS}>
          <OrgAvatar name={singleOrg.name} />
          <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-[#0f1420]">
            {singleOrg.name}
          </span>
        </div>
      </div>
    );
  }

  // Multiple orgs — custom dropdown
  const selectedOrg = organizations.find((org) => org.id === organizationId) ?? organizations[0];

  return (
    <div>
      <span className={FIELD_LABEL_CLASS}>{t('Organization')}</span>
      <div className="relative" ref={dropdownRef}>
        <button
          type="button"
          className={`${ROW_CLASS} w-full cursor-pointer hover:border-[#c3cad8]`}
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          onKeyDown={(e) => {
            if (e.key === 'Escape') setOpen(false);
          }}
        >
          <OrgAvatar name={selectedOrg.name} />
          <span className="min-w-0 flex-1 truncate text-left text-[13.5px] font-semibold text-[#0f1420]">
            {selectedOrg.name}
          </span>
          <FontAwesomeIcon
            icon={faChevronDown}
            size="xs"
            className={`flex-none text-[#9aa2b3] transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </button>

        {open && (
          <ul
            role="listbox"
            className="absolute left-0 right-0 z-10 mt-1 max-h-64 list-none overflow-auto rounded-[10px] border border-[#e6e9f0] bg-white py-1 shadow-[0_12px_30px_rgba(20,30,60,0.12)]"
          >
            {organizations.map((org) => {
              const selected = org.id === organizationId;
              return (
                <li
                  key={org.id}
                  role="option"
                  aria-selected={selected}
                  className={`flex cursor-pointer items-center gap-3 px-3 py-2 hover:bg-[#f4f6fa] ${
                    selected ? 'bg-[#eef1f6]' : ''
                  }`}
                  onClick={() => {
                    onChange(Number(org.id));
                    setOpen(false);
                  }}
                >
                  <OrgAvatar name={org.name} />
                  <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-[#0f1420]">
                    {org.name}
                  </span>
                  {selected && (
                    <FontAwesomeIcon
                      icon={faCheck}
                      size="xs"
                      className="flex-none text-[#0f1420]"
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
