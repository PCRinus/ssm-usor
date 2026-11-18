import { noWorkplace } from '@ssm-usor/contracts';
import { Link } from '@tanstack/react-router';

import { openedHere } from '@/app/opener';
import { CellEmpty, CellNote } from '@/components/data-table/cell-note';
import { createDataTableColumns } from '@/components/data-table/columns';
import { workerNoun } from '@/features/employees/employee-format';

import { amber, MeansCell, WorkplaceMenu } from './workplace-cells';
import { workplaceKindNote, type WorkplaceRow } from './workplace-list';
import {
  differingClientAddress,
  firstMissingFireField,
  type Workplace,
  workplaceAddress,
} from './workplace-schema';

type Address = NonNullable<ReturnType<typeof differingClientAddress>>;

const helper = createDataTableColumns<WorkplaceRow>();

export function workplaceColumns({
  clientId,
  clientAddress,
  readOnly,
  adopting,
  onAdoptAddress,
  onEdit,
  onArchive,
}: {
  clientId: string;
  clientAddress: Parameters<typeof differingClientAddress>[1];
  readOnly: boolean;
  adopting: boolean;
  onAdoptAddress: (workplace: Workplace, address: Address) => void;
  onEdit: (workplace: Workplace) => void;
  onArchive: (workplace: Workplace) => void;
}) {
  return helper.columns([
    helper.display({
      id: 'name',
      header: 'Denumire',
      meta: {
        headerClassName: 'w-52 min-w-44',
        cellClassName: 'whitespace-normal',
        skeletonClassName: 'w-36',
      },
      cell: ({ row }) => {
        if (row.original.kind === 'unassigned') return 'Fără punct de lucru';
        const { workplace } = row.original;
        const kind = workplaceKindNote(workplace);
        return (
          <>
            <span className="font-medium [overflow-wrap:anywhere]">{workplace.name}</span>
            {firstMissingFireField(workplace) !== null ? (
              <CellNote data-testid="workplace-fire-incomplete" className={amber}>
                Date SU incomplete
              </CellNote>
            ) : (
              kind && <CellNote data-testid="workplace-kind">{kind}</CellNote>
            )}
          </>
        );
      },
    }),
    helper.display({
      id: 'address',
      header: 'Adresă',
      meta: {
        headerClassName: 'w-full min-w-55',
        cellClassName: 'whitespace-normal',
        skeletonClassName: 'w-48',
      },
      cell: ({ row }) => {
        if (row.original.kind === 'unassigned') return <CellEmpty />;
        const { workplace } = row.original;
        const office = differingClientAddress(workplace, clientAddress);
        return (
          <>
            {workplaceAddress(workplace) || <CellEmpty />}
            {office && (
              <CellNote data-testid="workplace-address-drift" className={amber}>
                În datele firmei: {workplaceAddress(office)}.{' '}
                {!readOnly && (
                  <button
                    type="button"
                    data-testid="workplace-address-adopt"
                    className="underline underline-offset-2 hover:no-underline disabled:opacity-50"
                    disabled={adopting}
                    onClick={() => onAdoptAddress(workplace, office)}
                  >
                    Folosește această adresă
                  </button>
                )}
              </CellNote>
            )}
          </>
        );
      },
    }),
    helper.display({
      id: 'activity',
      header: 'Activitate',
      meta: {
        headerClassName: 'w-50 min-w-45',
        cellClassName: 'whitespace-normal',
        skeletonClassName: 'w-32',
      },
      cell: ({ row }) =>
        row.original.kind === 'unassigned' || !row.original.workplace.activity ? (
          <CellEmpty data-testid="workplace-activity-cell" />
        ) : (
          <span data-testid="workplace-activity-cell">{row.original.workplace.activity}</span>
        ),
    }),
    helper.display({
      id: 'employees',
      header: 'Lucrători',
      meta: {
        headerClassName: 'w-22 text-right',
        cellClassName: 'text-right',
        skeletonClassName: 'ml-auto w-6',
      },
      cell: ({ row }) => {
        const listed = row.original;
        const unassigned = listed.kind === 'unassigned';
        const count = unassigned ? listed.count : listed.workplace.currentEmployeeCount;
        if (count === 0) {
          return (
            <span data-testid="workplace-employees" className="font-medium tabular-nums">
              0
            </span>
          );
        }
        return (
          <Link
            to="/clienti/$clientId/angajati"
            params={{ clientId }}
            search={{ workplace: [unassigned ? noWorkplace : listed.workplace.id] }}
            state={openedHere}
            aria-label={
              unassigned
                ? `${workerNoun(count)} fără punct de lucru`
                : `${workerNoun(count)} la ${listed.workplace.name}`
            }
            data-testid={unassigned ? 'workplace-unassigned-link' : 'workplace-employees'}
            className="font-medium tabular-nums hover:underline"
          >
            {count}
          </Link>
        );
      },
    }),
    helper.display({
      id: 'means',
      header: 'Mijloace de apărare',
      meta: {
        headerClassName: 'w-44 min-w-44',
        cellClassName: 'whitespace-normal',
        skeletonClassName: 'w-24',
      },
      cell: ({ row }) =>
        row.original.kind === 'unassigned' ? (
          <CellEmpty />
        ) : (
          <MeansCell
            clientId={clientId}
            workplace={row.original.workplace}
            means={row.original.means}
          />
        ),
    }),
    ...(readOnly
      ? []
      : [
          helper.display({
            id: 'actions',
            header: () => <span className="sr-only">Acțiuni</span>,
            meta: {
              headerClassName: 'w-14',
              cellClassName: 'text-right',
              skeletonClassName: 'hidden',
            },
            cell: ({ row }) =>
              row.original.kind === 'workplace' && (
                <WorkplaceMenu
                  workplace={row.original.workplace}
                  onEdit={onEdit}
                  onArchive={onArchive}
                />
              ),
          }),
        ]),
  ]);
}
