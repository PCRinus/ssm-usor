import { clientConflictReasons, noWorkplace, workplaceConflictReasons } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { toast } from '@ssm-usor/ui/lib/toast';
import { cn } from '@ssm-usor/ui/lib/utils';
import { useNavigate, useRouteContext } from '@tanstack/react-router';
import { useCallback, useMemo, useRef, useState } from 'react';

import {
  type ApiErrorResponse,
  type ClientResponse,
  getListFireEquipmentQueryKey,
  getListFireInstallationsQueryKey,
  getListWorkplacesQueryKey,
  useArchiveWorkplace,
  useListFireEquipment,
  useListFireInstallations,
  useListWorkplaces,
  useUpdateWorkplace,
} from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import { openedHere } from '@/app/opener';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataTable } from '@/components/data-table/data-table';
import { Notice } from '@/components/notice';
import { SectionCard } from '@/components/section-card';
import { useFocusRequest, type WorkplacesFocus } from '@/features/missing-data/focus';
import { dateToIso } from '@/lib/dates';

import { SheetAction } from './details/sheet-action';
import { workplaceColumns } from './workplace-columns';
import {
  WorkplaceDialog,
  type WorkplaceEditing,
  workplacesOfArchivedClientMessage,
} from './workplace-dialog';
import { type WorkplaceRow, workplaceRows } from './workplace-list';
import {
  type differingClientAddress,
  firstMissingFireField,
  type Workplace,
  workplaceRequestOf,
} from './workplace-schema';

function reasonOf(cause: unknown) {
  return cause instanceof ApiHttpError
    ? (cause.body as Partial<ApiErrorResponse> | undefined)?.reason
    : undefined;
}

const workplaceRowId = (id: string) => `workplace-${id}`;

const rowKey = (row: WorkplaceRow) => (row.kind === 'workplace' ? row.workplace.id : 'unassigned');

const rowTestId = (row: WorkplaceRow) =>
  row.kind === 'workplace' ? 'workplace-row' : 'workplace-unassigned-row';

// `readOnly` is an archived client.
export function WorkplacesCard({
  client,
  userId,
  readOnly,
  focus,
}: {
  client: ClientResponse['client'];
  userId: string;
  readOnly: boolean;
  focus?: WorkplacesFocus;
}) {
  const clientId = client.id;
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const navigate = useNavigate();
  // The counts move with every change to the client's workers, made on other tabs.
  const workplaces = useListWorkplaces(clientId, {
    request: apiRequest,
    query: { queryKey: [...getListWorkplacesQueryKey(clientId), userId], staleTime: 0 },
  });
  const equipment = useListFireEquipment(clientId, {
    request: apiRequest,
    query: { queryKey: [...getListFireEquipmentQueryKey(clientId), userId] },
  });
  const installations = useListFireInstallations(clientId, {
    request: apiRequest,
    query: { queryKey: [...getListFireInstallationsQueryKey(clientId), userId] },
  });
  const archive = useArchiveWorkplace({ request: apiRequest });
  const update = useUpdateWorkplace({ request: apiRequest });
  const [editing, setEditing] = useState<WorkplaceEditing>(null);
  const [archiving, setArchiving] = useState<Workplace | null>(null);
  const [error, setError] = useState<string | null>(null);
  const addRef = useRef<HTMLButtonElement>(null);

  const fireSettled = !equipment.isPending && !installations.isPending;
  const rows = useMemo(
    () =>
      workplaces.data && fireSettled
        ? workplaceRows(
            workplaces.data,
            equipment.data && installations.data
              ? { equipment: equipment.data.items, installations: installations.data.items }
              : null,
            dateToIso(new Date())
          )
        : undefined,
    [workplaces.data, fireSettled, equipment.data, installations.data]
  );
  const incomplete =
    focus === 'workplace-fire-data'
      ? workplaces.data?.items.find((workplace) => firstMissingFireField(workplace) !== null)
      : undefined;
  const nothingYet = workplaces.data?.items.length === 0;
  useFocusRequest(focus !== undefined, {
    // The rows the anchor scrolls to wait for the equipment lists too.
    ready: workplaces.isError || rows !== undefined,
    anchor: () =>
      incomplete ? document.getElementById(workplaceRowId(incomplete.id)) : addRef.current,
    open:
      readOnly || (focus === 'workplace-fire-data' && !incomplete && !nothingYet)
        ? undefined
        : () => setEditing(incomplete ?? 'new'),
    field: readOnly
      ? undefined
      : incomplete
        ? (firstMissingFireField(incomplete) ?? undefined)
        : 'workplace-name',
  });

  const updateWorkplace = update.mutateAsync;
  const adoptClientAddress = useCallback(
    async (
      workplace: Workplace,
      address: NonNullable<ReturnType<typeof differingClientAddress>>
    ) => {
      setError(null);
      try {
        await updateWorkplace({
          clientId,
          workplaceId: workplace.id,
          data: { ...workplaceRequestOf(workplace), isRegisteredOffice: true, ...address },
        });
        toast.success(`Adresa pentru ${workplace.name} a fost actualizată.`);
      } catch (cause) {
        setError(
          reasonOf(cause) === clientConflictReasons.clientArchived
            ? workplacesOfArchivedClientMessage
            : 'Nu am putut actualiza adresa. Verifică conexiunea și încearcă din nou.'
        );
      }
      await queryClient.invalidateQueries({ queryKey: getListWorkplacesQueryKey(clientId) });
    },
    [clientId, queryClient, updateWorkplace]
  );

  async function archiveWorkplace(workplace: Workplace) {
    setError(null);
    try {
      await archive.mutateAsync({ clientId, workplaceId: workplace.id });
      toast.success(`${workplace.name} a fost arhivat.`);
    } catch (cause) {
      const reason = reasonOf(cause);
      setError(
        reason === workplaceConflictReasons.officeNeedsWorkplace
          ? `${workplace.name} este singurul punct de lucru activ, iar la sediul social nu se desfășoară activitate. Bifează activitatea la sediu sau adaugă punctul de lucru care îi ia locul, apoi arhivează-l.`
          : reason === clientConflictReasons.clientArchived
            ? workplacesOfArchivedClientMessage
            : cause instanceof ApiHttpError && cause.status === 404
              ? `${workplace.name} nu mai există la acest client.`
              : 'Nu am putut arhiva punctul de lucru. Verifică conexiunea și încearcă din nou.'
      );
    }
    setArchiving(null);
    // Also after a failure: a 404 means the list on screen is out of date.
    await queryClient.invalidateQueries({ queryKey: getListWorkplacesQueryKey(clientId) });
  }

  const columns = useMemo(
    () =>
      workplaceColumns({
        clientId,
        clientAddress: client,
        readOnly,
        adopting: update.isPending,
        onAdoptAddress: (workplace, address) => void adoptClientAddress(workplace, address),
        onEdit: setEditing,
        onArchive: setArchiving,
      }),
    [clientId, client, readOnly, update.isPending, adoptClientAddress]
  );

  const empty = workplaces.isSuccess && workplaces.data.items.length === 0;

  return (
    <SectionCard
      data-testid="workplaces-card"
      className={cn('gap-4', !empty && !workplaces.isError && 'overflow-hidden pb-0')}
      title="Sediu și puncte de lucru"
      help="detalii.puncte-de-lucru"
      action={
        !readOnly && (
          <SheetAction
            ref={addRef}
            adding
            subject="un punct de lucru"
            data-testid="workplace-add"
            onClick={() => setEditing('new')}
          />
        )
      }
    >
      {error && (
        <Notice variant="destructive" data-testid="workplaces-error">
          {error}
        </Notice>
      )}
      {empty ? (
        <p data-testid="workplaces-empty" className="text-sm text-muted-foreground">
          {readOnly
            ? 'Nu sunt puncte de lucru înregistrate pentru acest client.'
            : 'Niciun punct de lucru încă.'}
        </p>
      ) : workplaces.isError ? (
        <Notice
          variant="destructive"
          action={
            <Button
              variant="outline"
              disabled={workplaces.isFetching}
              onClick={() => void workplaces.refetch()}
            >
              Încearcă din nou
            </Button>
          }
        >
          Nu am putut încărca punctele de lucru.
        </Notice>
      ) : (
        <DataTable
          testId="workplaces-table"
          rowTestId={rowTestId}
          rowElementId={(row) =>
            row.kind === 'workplace' ? workplaceRowId(row.workplace.id) : undefined
          }
          label="Sediul și punctele de lucru"
          columns={columns}
          data={rows}
          rowKey={rowKey}
          status={rows ? 'success' : 'pending'}
          canClickRow={(row) => row.kind === 'unassigned' || !readOnly}
          onRowClick={(row) =>
            row.kind === 'workplace'
              ? setEditing(row.workplace)
              : void navigate({
                  to: '/clienti/$clientId/angajati',
                  params: { clientId },
                  search: { workplace: [noWorkplace] },
                  state: openedHere,
                })
          }
          empty={null}
        />
      )}
      <WorkplaceDialog clientId={clientId} editing={editing} onClose={() => setEditing(null)} />
      {archiving && (
        <ConfirmDialog
          open
          busy={archive.isPending}
          destructive={false}
          testId="workplace-archive"
          title="Arhivezi punctul de lucru?"
          confirmLabel="Arhivează"
          pendingLabel="Se arhivează…"
          onConfirm={() => void archiveWorkplace(archiving)}
          onClose={() => setArchiving(null)}
        >
          <span className="font-medium text-foreground">{archiving.name}</span> nu va mai apărea în
          listă și în documentele generate de acum înainte. Documentele deja emise rămân
          neschimbate.
        </ConfirmDialog>
      )}
    </SectionCard>
  );
}
