import type { ReactNode } from 'react';

import { CellEmpty } from '@/components/data-table/cell-note';
import { createDataTableColumns, type DataTableColumn } from '@/components/data-table/columns';
import { formatRoDateOf } from '@/lib/dates';

import { InvitationActions } from './invitation-actions';
import { roleLabels } from './labels';
import { MemberActions } from './member-actions';
import { NameCell, StateCell } from './team-cells';
import { memberName, type TeamRow } from './team-list';

const helper = createDataTableColumns<TeamRow>();

const roleOf = (row: TeamRow) => (row.kind === 'member' ? row.member.role : row.invitation.role);

// Sortable column ids are the list's sort keys.
export function teamColumns({
  userId,
  manage,
  onError,
}: {
  userId: string;
  manage: boolean;
  onError: (message: ReactNode) => void;
}): DataTableColumn<TeamRow>[] {
  const name = helper.accessor(
    (row) => (row.kind === 'member' ? memberName(row.member) : row.invitation.email),
    {
      id: 'name',
      header: 'Nume',
      meta: {
        headerClassName: 'w-full min-w-55',
        cellClassName: 'whitespace-normal',
        skeletonClassName: 'w-40',
        personal: true,
      },
      cell: ({ row }) => <NameCell row={row.original} userId={userId} />,
    }
  );
  const role = helper.display({
    id: 'role',
    header: 'Rol',
    meta: { headerClassName: 'min-w-28', skeletonClassName: 'w-20' },
    cell: ({ row }) => roleLabels[roleOf(row.original)],
  });
  const state = helper.display({
    id: 'state',
    header: 'Stare',
    meta: { headerClassName: 'min-w-48', skeletonClassName: 'w-36' },
    cell: ({ row }) => <StateCell row={row.original} />,
  });
  if (!manage) return helper.columns([name, role, state]);

  return helper.columns([
    name,
    role,
    state,
    helper.accessor((row) => (row.kind === 'member' ? row.member.lastActiveAt : null), {
      id: 'lastActive',
      header: 'Ultima activitate',
      meta: { headerClassName: 'min-w-40', skeletonClassName: 'w-20' },
      cell: ({ row }) => {
        const active = row.original.kind === 'member' ? row.original.member.lastActiveAt : null;
        return active ? (
          <span className="tabular-nums">{formatRoDateOf(active)}</span>
        ) : (
          <CellEmpty />
        );
      },
    }),
    helper.display({
      id: 'actions',
      header: () => <span className="sr-only">Acțiuni</span>,
      meta: { headerClassName: 'w-12', cellClassName: 'py-1 text-right' },
      cell: ({ row }) => {
        const team = row.original;
        if (team.kind === 'invitation') {
          return <InvitationActions invitation={team.invitation} onError={onError} />;
        }
        return team.member.userId === userId ? null : (
          <MemberActions member={team.member} onError={onError} />
        );
      },
    }),
  ]);
}
