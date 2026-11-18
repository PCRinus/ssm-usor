import type { ClientParticipantsResponse } from '@/api/generated/api';
import { CellNote } from '@/components/data-table/cell-note';
import { createDataTableColumns } from '@/components/data-table/columns';

import { ResponsiblePersonMenu } from './responsible-person-cells';
import {
  personStanding,
  type ResponsiblePerson,
  responsibleRoleLabels,
  responsibleRoleOrder,
} from './responsible-person-schema';

const helper = createDataTableColumns<ResponsiblePerson>();

export function responsiblePersonColumns({
  clientId,
  readOnly,
  portal,
  workplaceNames,
  adopting,
  onAdoptTitle,
  onEdit,
  onArchive,
}: {
  clientId: string;
  readOnly: boolean;
  portal: ClientParticipantsResponse | undefined;
  // Undefined while the workplaces load.
  workplaceNames: ReadonlyMap<string, string> | undefined;
  adopting: boolean;
  onAdoptTitle: (person: ResponsiblePerson, jobTitle: string) => void;
  onEdit: (person: ResponsiblePerson) => void;
  onArchive: (person: ResponsiblePerson) => void;
}) {
  return helper.columns([
    helper.display({
      id: 'name',
      header: 'Nume și prenume',
      meta: {
        headerClassName: 'w-62 min-w-50',
        cellClassName: 'whitespace-normal',
        skeletonClassName: 'w-40',
        personal: true,
      },
      cell: ({ row }) => (
        <>
          <span className="font-medium [overflow-wrap:anywhere]">{row.original.fullName}</span>
          <CellNote data-testid="responsible-standing">
            {personStanding(row.original, portal)}
          </CellNote>
        </>
      ),
    }),
    helper.display({
      id: 'jobTitle',
      header: 'Funcția',
      meta: {
        headerClassName: 'w-54 min-w-44',
        cellClassName: 'whitespace-normal',
        skeletonClassName: 'w-32',
      },
      cell: ({ row }) => {
        const person = row.original;
        const contract = person.employeeJobTitle;
        return (
          <>
            {person.jobTitle}
            {contract && contract !== person.jobTitle && (
              <CellNote
                data-testid="responsible-title-drift"
                className="font-medium text-warning-foreground"
              >
                În contract: {contract}.{' '}
                {!readOnly && (
                  <button
                    type="button"
                    data-testid="responsible-title-adopt"
                    className="underline underline-offset-2 hover:no-underline disabled:opacity-50"
                    disabled={adopting}
                    onClick={() => onAdoptTitle(person, contract)}
                  >
                    Folosește această funcție
                  </button>
                )}
              </CellNote>
            )}
          </>
        );
      },
    }),
    helper.display({
      id: 'roles',
      header: 'Responsabilități',
      meta: {
        headerClassName: 'w-full min-w-60',
        cellClassName: 'whitespace-normal',
        skeletonClassName: 'w-56',
      },
      cell: ({ row }) => {
        const person = row.original;
        return (
          <>
            <span data-testid="responsible-roles">
              {responsibleRoleOrder
                .filter((role) => person.roles.includes(role))
                .map((role) => responsibleRoleLabels[role].label)
                .join(', ')}
            </span>
            {person.workplaceId && workplaceNames && (
              <CellNote data-testid="responsible-workplace-name">
                numai la {workplaceNames.get(person.workplaceId) ?? 'un loc de muncă arhivat'}
              </CellNote>
            )}
          </>
        );
      },
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
            cell: ({ row }) => (
              <ResponsiblePersonMenu
                clientId={clientId}
                person={row.original}
                onEdit={onEdit}
                onArchive={onArchive}
              />
            ),
          }),
        ]),
  ]);
}
