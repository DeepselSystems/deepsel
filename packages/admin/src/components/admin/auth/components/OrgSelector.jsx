import { Badge, Select, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';

/** Minimum number of orgs required to show a dropdown instead of a badge */
const MULTI_ORG_THRESHOLD = 1;

/**
 * Displays the organization selector for the login flow.
 * Shows a dropdown when the user belongs to multiple orgs, a badge for a single org,
 * or nothing if no orgs are available.
 *
 * @param {Array} organizations - List of {id, name} org objects.
 * @param {number|null} organizationId - Currently selected org ID.
 * @param {function} onChange - Called with the new org ID (number) when selection changes.
 */
export default function OrgSelector({ organizations, organizationId, onChange }) {
  const { t } = useTranslation();

  if (organizations.length === 0) {
    return null;
  }

  if (organizations.length > MULTI_ORG_THRESHOLD) {
    const selectData = organizations.map((org) => ({
      value: String(org.id),
      label: org.name,
    }));
    return (
      <Select
        label={t('Organization')}
        data={selectData}
        value={String(organizationId)}
        onChange={(val) => {
          if (val) {
            onChange(parseInt(val, 10));
          }
        }}
        allowDeselect={false}
      />
    );
  }

  // Single org — show badge
  const singleOrg = organizations[0];
  return (
    <div className="flex flex-col gap-1">
      <Text size="sm" fw={500}>
        {t('Organization')}
      </Text>
      <Badge variant="light" size="lg" className="self-start">
        {singleOrg.name}
      </Badge>
    </div>
  );
}
