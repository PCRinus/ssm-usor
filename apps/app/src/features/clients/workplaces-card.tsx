import { clientConflictReasons, noWorkplace, workplaceConflictReasons } from '@ssm-usor/contracts';
import { toast } from '@ssm-usor/ui/lib/toast';
import { cn } from '@ssm-usor/ui/lib/utils';
import { useNavigate } from '@tanstack/react-router';
import { useCallback, useMemo, useRef, useState } from 'react';

import {
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
import { apiErrorReason, ApiHttpError } from '@/api/http';
import { useApi } from '@/api/use-api';
import { openedHere } from '@/app/opener';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataTable } from '@/components/data-table/data-table';
import { LoadFailed } from '@/components/load-failed';
import { Notice } from '@/components/notice';
import { SectionCard } from '@/components/section-card';
import { useFocusRequest, type WorkplacesFocus } from '@/features/missing-data/focus';
import { commonFailure } from '@/lib/api-errors';
import { todayIso } from '@/lib/dates';

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

const workplaceRowId = (id: string) => `workplace-${id}`;

const rowKey = (row: WorkplaceRow) => (row.kind === 'workplace' ? row.workplace.id : 'unassigned');

const rowTestId = (row: WorkplaceRow) =>
  row.kind === 'workplace' ? 'workplace-row' : 'workplace-unassigned-row';

// `readOnly` is an archived client.
export function WorkplacesCard({
  client,
  readOnly,
  focus,
}: {
  client: ClientResponse['client'];
  readOnly: boolean;
  focus?: WorkplacesFocus;
}) {
  const clientId = client.id;
  const { request, queryClient, key } = useApi();
  const navigate = useNavigate();
  // The counts move with every change to the client's workers, made on other tabs.
  const workplaces = useListWorkplaces(clientId, {
    request,
    query: { queryKey: key(getListWorkplacesQueryKey(clientId)), staleTime: 0 },
  });
  const equipment = useListFireEquipment(clientId, {
    request,
    query: { queryKey: key(getListFireEquipmentQueryKey(clientId)) },
  });
  const installations = useListFireInstallations(clientId, {
    request,
    query: { queryKey: key(getListFireInstallationsQueryKey(clientId)) },
  });
  const archive = useArchiveWorkplace({ request });
  const update = useUpdateWorkplace({ request });
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
            todayIso()
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
          commonFailure(cause) ??
            (apiErrorReason(cause) === clientConflictReasons.clientArchived
              ? workplacesOfArchivedClientMessage
              : 'Nu am putut actualiza adresa. Verifică conexiunea și încearcă din nou.')
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
      const reason = apiErrorReason(cause);
      setError(
        commonFailure(cause) ??
          (reason === workplaceConflictReasons.officeNeedsWorkplace
            ? `${workplace.name} este singurul punct de lucru activ, iar la sediul social nu se desfășoară activitate. Bifează activitatea la sediu sau adaugă punctul de lucru care îi ia locul, apoi arhivează-l.`
            : reason === clientConflictReasons.clientArchived
              ? workplacesOfArchivedClientMessage
              : cause instanceof ApiHttpError && cause.status === 404
                ? `${workplace.name} nu mai există la acest client.`
                : 'Nu am putut arhiva punctul de lucru. Verifică conexiunea și încearcă din nou.')
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
        <LoadFailed
          error={workplaces.error}
          busy={workplaces.isFetching}
          onRetry={() => void workplaces.refetch()}
        >
          Nu am putut încărca punctele de lucru.
        </LoadFailed>
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
          destructive={false}
          testId="workplace-archive"
          title="Arhivezi punctul de lucru?"
          confirmLabel="Arhivează"
          pendingLabel="Se arhivează…"
          onConfirm={() => archiveWorkplace(archiving)}
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
