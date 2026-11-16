import { sortOrderSchema } from '@ssm-usor/contracts';
import { z } from 'zod';

import type { InvitationResponse, OrganizationMemberListResponse } from '@/api/generated/api';
import type { DataTableSort } from '@/components/data-table/columns';

export type Member = OrganizationMemberListResponse['items'][number];

export type TeamRow =
  { kind: 'member'; member: Member } | { kind: 'invitation'; invitation: InvitationResponse };

export const teamSortKeys = ['name', 'lastActive'] as const;
export type TeamSortKey = (typeof teamSortKeys)[number];

export const defaultTeamSort: DataTableSort & { sort: TeamSortKey } = {
  sort: 'name',
  order: 'asc',
};

// The team is read whole, so it sorts here; the address keeps the choice as on every list.
export const teamListSearch = {
  sort: z.enum(teamSortKeys).optional().catch(undefined),
  order: sortOrderSchema.optional().catch(undefined),
};

export type TeamListSearch = {
  sort?: TeamSortKey;
  order?: DataTableSort['order'];
};

const byName = new Intl.Collator('ro', { sensitivity: 'base', numeric: true });

export const memberName = (member: Member) => member.fullName ?? member.email ?? '';

// Never signed in reads as the oldest activity, the first an owner looking for an unused place
// wants to see.
const activityOf = (member: Member) =>
  member.lastActiveAt ? Date.parse(member.lastActiveAt) : Number.NEGATIVE_INFINITY;

// Members, then open invitations, then expired ones, whatever the sort: an invitation is a place
// held, not a person, and has neither a name of its own nor an activity.
export function teamRows(
  members: readonly Member[],
  invitations: readonly InvitationResponse[],
  { sort, order }: DataTableSort & { sort: TeamSortKey }
): TeamRow[] {
  const direction = order === 'asc' ? 1 : -1;
  const names = (a: Member, b: Member) => byName.compare(memberName(a), memberName(b));
  const sortedMembers = [...members].sort((a, b) => {
    if (sort === 'name') return names(a, b) * direction;
    const active = activityOf(a) - activityOf(b);
    return (active ? Math.sign(active) * direction : 0) || names(a, b);
  });
  const newestFirst = (a: InvitationResponse, b: InvitationResponse) =>
    Date.parse(b.createdAt) - Date.parse(a.createdAt);
  const open = invitations.filter((invitation) => invitation.status === 'open').sort(newestFirst);
  const expired = invitations
    .filter((invitation) => invitation.status === 'expired')
    .sort(newestFirst);
  return [
    ...sortedMembers.map((member) => ({ kind: 'member' as const, member })),
    ...[...open, ...expired].map((invitation) => ({ kind: 'invitation' as const, invitation })),
  ];
}
