import type { OrganizationRole } from '@ssm-usor/contracts';

// "Owner" is the database's word; people in the app read "admin", since testers took "administrator"
// for the client's legal representative.
export const roleLabels: Record<OrganizationRole, string> = {
  owner: 'Admin',
  specialist: 'Specialist',
};

const dayFormat = new Intl.DateTimeFormat('ro-RO', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

export const formatDay = (isoTimestamp: string) => dayFormat.format(new Date(isoTimestamp));
