import { type ClientEmployeeListItem, formatEmployeeName } from '@ssm-usor/contracts';
import { Link } from '@tanstack/react-router';

import { openedHere } from '@/app/opener';
import { CellEmpty, CellNote } from '@/components/data-table/cell-note';
import { createDataTableColumns } from '@/components/data-table/columns';
import { Masked } from '@/components/replay';

import { PortalAccessBadge } from './portal-access';
import { accessDateLine, channelLine, shownAddress } from './portal-access-format';
import { RowActions } from './portal-roster-cells';
import type { PortalAccessActions } from './use-portal-access-actions';

export type RosterRow = ClientEmployeeListItem;

// Sortable column ids are the API sort keys.
export function portalRosterColumns({
  readOnly,
  actions,
  onInvite,
}: {
  readOnly: boolean;
  actions: PortalAccessActions;
  onInvite: (row: RosterRow) => void;
}) {
  const helper = createDataTableColumns<RosterRow>();
  return helper.columns([
    helper.accessor((row) => formatEmployeeName(row), {
      id: 'name',
      header: 'Lucrător',
      enableSorting: true,
      meta: {
        headerClassName: 'md:w-[30%]',
        cellClassName: 'font-medium',
        skeletonClassName: 'w-40',
        personal: true,
      },
      cell: ({ row, getValue }) => (
        <>
          <Link
            to="/clienti/$clientId/angajati/$employeeId"
            state={openedHere}
            params={{ clientId: row.original.clientId, employeeId: row.original.id }}
            data-testid="portal-roster-open"
            className="hover:underline"
          >
            {getValue()}
          </Link>
          <CellNote>{row.original.jobPosition.name}</CellNote>
        </>
      ),
    }),
    helper.accessor((row) => row.portal.state, {
      id: 'portal',
      header: 'Acces',
      enableSorting: true,
      meta: { headerClassName: 'md:w-[22%]', skeletonClassName: 'w-24' },
      cell: ({ row }) => {
        const line = accessDateLine(row.original.portal);
        return (
          <>
            <PortalAccessBadge state={row.original.portal.state} archived={readOnly} />
            {line && (
              <CellNote className="tabular-nums" data-testid="portal-access-date">
                {line}
              </CellNote>
            )}
          </>
        );
      },
    }),
    helper.display({
      id: 'address',
      header: 'Intră cu',
      meta: { skeletonClassName: 'w-40' },
      cell: ({ row }) => {
        const { address, channel, language, administrator, state } = row.original.portal;
        if (!address || !channel) return <CellEmpty />;
        return (
          <>
            <Masked className="block">{shownAddress(channel, address)}</Masked>
            <CellNote data-testid="portal-access-channel">
              {channelLine({
                channel,
                language: state === 'active' ? language : null,
                administrator,
              })}
            </CellNote>
          </>
        );
      },
    }),
    helper.display({
      id: 'actions',
      header: () => <span className="sr-only">Acțiuni</span>,
      meta: { headerClassName: 'w-px', cellClassName: 'text-right', skeletonClassName: 'hidden' },
      cell: ({ row }) => (
        <RowActions row={row.original} readOnly={readOnly} actions={actions} onInvite={onInvite} />
      ),
    }),
  ]);
}
