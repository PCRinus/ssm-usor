import type { ReactNode } from 'react';

import { CellNote } from '@/components/data-table/cell-note';
import { Masked } from '@/components/replay';
import { formatRoDateOf } from '@/lib/dates';

import type { TeamRow } from './team-list';

// On a phone the table scrolls sideways; a long name or address ends in an ellipsis rather than
// widening the first column past the screen or making its row taller.
const phoneWidth = 'max-md:max-w-55';
const address = `block truncate ${phoneWidth}`;

export function NameCell({ row, userId }: { row: TeamRow; userId: string }) {
  if (row.kind === 'invitation') {
    return <span className={`${address} font-medium`}>{row.invitation.email}</span>;
  }
  const { member } = row;
  return (
    <>
      <span className={`flex font-medium ${phoneWidth}`}>
        {member.fullName ? (
          <Masked className="truncate">{member.fullName}</Masked>
        ) : (
          <span className="truncate">{member.email}</span>
        )}
        {member.userId === userId && (
          <span className="shrink-0 font-normal whitespace-pre"> (tu)</span>
        )}
      </span>
      {member.fullName && member.email && <CellNote className={address}>{member.email}</CellNote>}
    </>
  );
}

export function StateCell({ row }: { row: TeamRow }) {
  let value: ReactNode;
  let note: string;
  if (row.kind === 'member') {
    value = 'Membru';
    note = `din ${formatRoDateOf(row.member.joinedAt)}`;
  } else if (row.invitation.status === 'open') {
    value = 'Invitație în așteptare';
    note = `expiră pe ${formatRoDateOf(row.invitation.expiresAt)}`;
  } else {
    value = <span className="font-medium text-warning-foreground">Invitație expirată</span>;
    note = `pe ${formatRoDateOf(row.invitation.expiresAt)}`;
  }
  return (
    <>
      {value}
      <CellNote>{note}</CellNote>
    </>
  );
}
