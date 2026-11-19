import {
  clientConflictReasons,
  isLegalRepresentative,
  requiredWorkersRepresentatives,
  type ResponsiblePersonRole,
} from '@ssm-usor/contracts';
import { toast } from '@ssm-usor/ui/lib/toast';
import { cn } from '@ssm-usor/ui/lib/utils';
import { useRouteContext } from '@tanstack/react-router';
import { Fragment, type ReactNode, useCallback, useMemo, useRef, useState } from 'react';

import {
  getListResponsiblePersonsQueryKey,
  getListWorkplacesQueryKey,
  useArchiveResponsiblePerson,
  useListResponsiblePersons,
  useListWorkplaces,
  useUpdateResponsiblePerson,
} from '@/api/generated/api';
import { apiErrorReason, ApiHttpError } from '@/api/http';
import { replayMask } from '@/app/observability/replay-masking';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DataTable } from '@/components/data-table/data-table';
import { LoadFailed } from '@/components/load-failed';
import { maskPeople } from '@/components/mask-people';
import { Notice } from '@/components/notice';
import { SectionCard } from '@/components/section-card';
import { SheetAction } from '@/features/clients/details/sheet-action';
import { useDocumentDetails } from '@/features/clients/document-details/use-document-details-form';
import { type ResponsiblePersonFocus, useFocusRequest } from '@/features/missing-data/focus';
import { commonFailure } from '@/lib/api-errors';

import { responsiblePersonColumns } from './responsible-person-columns';
import {
  ResponsiblePersonDialog,
  type ResponsiblePersonEditing,
  responsiblePersonsOfArchivedClientMessage,
} from './responsible-person-dialog';
import { missingRoles, type ResponsiblePerson } from './responsible-person-schema';

const focusRoles: Record<ResponsiblePersonFocus, ResponsiblePersonRole> = {
  'workplace-manager': 'workplace_manager',
  'first-aid': 'first_aid',
  'risk-evaluation-team': 'risk_evaluation_team',
  'imminent-danger': 'imminent_danger',
  'workers-representative': 'workers_representative',
  'workers-representative-clash': 'workers_representative',
  'fire-safety-coordinator': 'fire_safety_coordinator',
  'fire-intervention-leader': 'fire_intervention_leader',
};

const personRowId = (id: string) => `responsible-person-${id}`;

const rowKey = (person: ResponsiblePerson) => person.id;

// `readOnly` is an archived client.
export function ResponsiblePersonsCard({
  clientId,
  userId,
  readOnly,
  currentEmployeeCount,
  focus,
}: {
  clientId: string;
  userId: string;
  readOnly: boolean;
  currentEmployeeCount: number;
  focus?: ResponsiblePersonFocus;
}) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const persons = useListResponsiblePersons(clientId, {
    request: apiRequest,
    query: { queryKey: [...getListResponsiblePersonsQueryKey(clientId), userId] },
  });
  const workplaces = useListWorkplaces(clientId, {
    request: apiRequest,
    query: { queryKey: [...getListWorkplacesQueryKey(clientId), userId] },
  });
  const workplaceItems = workplaces.data?.items;
  const workplaceNames = useMemo(
    () =>
      workplaceItems && new Map(workplaceItems.map((workplace) => [workplace.id, workplace.name])),
    [workplaceItems]
  );
  const archive = useArchiveResponsiblePerson({ request: apiRequest });
  const update = useUpdateResponsiblePerson({ request: apiRequest });
  const [editing, setEditing] = useState<ResponsiblePersonEditing>(null);
  const [pointedRole, setPointedRole] = useState<ResponsiblePersonRole | null>(null);
  const details = useDocumentDetails(clientId, userId);
  const [archiving, setArchiving] = useState<ResponsiblePerson | null>(null);
  const [error, setError] = useState<ReactNode>(null);

  const missing = persons.data ? missingRoles(persons.data.items, currentEmployeeCount) : [];

  const addRef = useRef<HTMLButtonElement>(null);

  const saved = details.data?.documentDetails;
  const clashing =
    saved?.legalRepresentativeName && requiredWorkersRepresentatives(currentEmployeeCount) > 0
      ? persons.data?.items.find(
          (person) =>
            person.roles.includes('workers_representative') &&
            person.currentEmployee &&
            isLegalRepresentative(person, {
              employeeId: saved.legalRepresentativeEmployeeId ?? null,
              fullName: saved.legalRepresentativeName,
            })
        )
      : undefined;

  // Opening the representative who clashes lets the role be taken off them; adding someone
  // else would leave the clash in place.
  const clashingPerson = () => (focus === 'workers-representative-clash' ? clashing : undefined);

  useFocusRequest(focus !== undefined, {
    ready: !persons.isPending && !details.isPending,
    anchor: () => {
      const clashing = clashingPerson();
      return clashing ? document.getElementById(personRowId(clashing.id)) : addRef.current;
    },
    open:
      readOnly || !focus
        ? undefined
        : () => {
            setPointedRole(focusRoles[focus]);
            setEditing(clashingPerson() ?? 'new');
          },
  });

  const updatePerson = update.mutateAsync;
  const adoptContractTitle = useCallback(
    async (person: ResponsiblePerson, jobTitle: string) => {
      setError(null);
      try {
        await updatePerson({
          clientId,
          responsiblePersonId: person.id,
          data: {
            employeeId: person.employeeId,
            workplaceId: person.workplaceId,
            fullName: person.fullName,
            jobTitle,
            roles: person.roles,
          },
        });
        toast.success(maskPeople`Funcția lui ${person.fullName} a fost actualizată.`);
      } catch (cause) {
        setError(
          commonFailure(cause) ??
            (apiErrorReason(cause) === clientConflictReasons.clientArchived
              ? responsiblePersonsOfArchivedClientMessage
              : 'Nu am putut actualiza funcția. Verifică conexiunea și încearcă din nou.')
        );
      }
      await queryClient.invalidateQueries({
        queryKey: getListResponsiblePersonsQueryKey(clientId),
      });
    },
    [clientId, queryClient, updatePerson]
  );

  const columns = useMemo(
    () =>
      responsiblePersonColumns({
        clientId,
        readOnly,
        clashId: clashing?.id,
        workplaceNames,
        adopting: update.isPending,
        onAdoptTitle: (person, jobTitle) => void adoptContractTitle(person, jobTitle),
        onEdit: setEditing,
        onArchive: setArchiving,
      }),
    [clientId, readOnly, clashing?.id, workplaceNames, update.isPending, adoptContractTitle]
  );

  function addFor(role: ResponsiblePersonRole) {
    setPointedRole(role);
    setEditing('new');
  }

  async function archivePerson(person: ResponsiblePerson) {
    setError(null);
    try {
      await archive.mutateAsync({ clientId, responsiblePersonId: person.id });
      toast.success(maskPeople`${person.fullName} a fost scos din listă.`);
    } catch (cause) {
      setError(
        commonFailure(cause) ??
          (apiErrorReason(cause) === clientConflictReasons.clientArchived
            ? responsiblePersonsOfArchivedClientMessage
            : cause instanceof ApiHttpError && cause.status === 404
              ? maskPeople`${person.fullName} nu mai este în lista acestui client.`
              : 'Nu am putut scoate persoana din listă. Verifică conexiunea și încearcă din nou.')
      );
    }
    setArchiving(null);
    // Also after a failure: a 404 means the list on screen is out of date.
    await queryClient.invalidateQueries({ queryKey: getListResponsiblePersonsQueryKey(clientId) });
  }

  const empty = persons.isSuccess && persons.data.items.length === 0;
  const showMissing = persons.isSuccess && !empty && missing.length > 0;

  return (
    <SectionCard
      data-testid="responsible-persons-card"
      className={cn('gap-4', !empty && !persons.isError && 'overflow-hidden pb-0')}
      title="Persoane responsabile"
      help="instruire.persoane-responsabile"
      actionClassName="max-sm:contents"
      action={
        (showMissing || !readOnly) && (
          <>
            {showMissing && (
              <p
                data-testid="responsible-missing"
                className="self-center text-sm font-medium text-warning-foreground max-sm:order-last max-sm:basis-full sm:mr-2"
              >
                Fără persoană numită:{' '}
                {missing.map(({ role, label }, index) => (
                  <Fragment key={role}>
                    {index > 0 && ', '}
                    {readOnly ? (
                      label
                    ) : (
                      <button
                        type="button"
                        data-testid={`responsible-missing-${role}`}
                        className="underline underline-offset-2 hover:no-underline"
                        onClick={() => addFor(role)}
                      >
                        {label}
                      </button>
                    )}
                  </Fragment>
                ))}
              </p>
            )}
            {!readOnly && (
              <SheetAction
                ref={addRef}
                adding
                subject="o persoană responsabilă"
                data-testid="responsible-add"
                onClick={() => setEditing('new')}
              />
            )}
          </>
        )
      }
    >
      {error && (
        <Notice variant="destructive" data-testid="responsible-persons-error">
          {error}
        </Notice>
      )}
      {empty ? (
        <p data-testid="responsible-persons-empty" className="text-sm text-muted-foreground">
          {readOnly
            ? 'Nu au fost desemnate persoane responsabile pentru acest client.'
            : 'Nicio persoană responsabilă încă.'}
        </p>
      ) : persons.isError ? (
        <LoadFailed
          error={persons.error}
          busy={persons.isFetching}
          onRetry={() => void persons.refetch()}
        >
          Nu am putut încărca persoanele responsabile.
        </LoadFailed>
      ) : (
        <DataTable
          testId="responsible-persons-table"
          rowTestId="responsible-row"
          rowElementId={(person) => personRowId(person.id)}
          label="Persoanele responsabile ale clientului"
          columns={columns}
          data={persons.data?.items}
          rowKey={rowKey}
          status={persons.isSuccess ? 'success' : 'pending'}
          onRowClick={readOnly ? undefined : setEditing}
          empty={null}
        />
      )}
      <ResponsiblePersonDialog
        clientId={clientId}
        userId={userId}
        editing={editing}
        pointedRole={pointedRole}
        onClose={() => {
          setEditing(null);
          setPointedRole(null);
        }}
      />
      {archiving && (
        <ConfirmDialog
          open
          busy={archive.isPending}
          destructive={false}
          testId="responsible-archive"
          title="Scoți persoana din listă?"
          confirmLabel="Scoate din listă"
          pendingLabel="Se scoate…"
          onConfirm={() => void archivePerson(archiving)}
          onClose={() => setArchiving(null)}
        >
          <span className="font-medium text-foreground" {...replayMask}>
            {archiving.fullName}
          </span>{' '}
          nu va mai fi numită în documentele generate de acum înainte. Documentele deja emise rămân
          neschimbate, iar lucrătorul rămâne în lista de lucrători.
        </ConfirmDialog>
      )}
    </SectionCard>
  );
}
