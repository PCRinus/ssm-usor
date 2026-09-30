import { type ResponsiblePersonRole, samePersonName } from '@ssm-usor/contracts';
import { Badge } from '@ssm-usor/ui/components/badge';
import { Button } from '@ssm-usor/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ssm-usor/ui/components/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@ssm-usor/ui/components/dropdown-menu';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ssm-usor/ui/components/table';
import { toast } from '@ssm-usor/ui/lib/toast';
import { cn } from '@ssm-usor/ui/lib/utils';
import { useRouteContext } from '@tanstack/react-router';
import { MoreHorizontal, Plus } from 'lucide-react';
import { useRef, useState } from 'react';

import {
  getListResponsiblePersonsQueryKey,
  useArchiveResponsiblePerson,
  useListResponsiblePersons,
  useUpdateResponsiblePerson,
} from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import { rowClickProps } from '@/components/data-table/row-click';
import { Notice } from '@/components/notice';
import { SectionCard } from '@/components/section-card';
import { type TrainingFocus, useFocusRequest } from '@/features/missing-data/focus';

import {
  ResponsiblePersonDialog,
  type ResponsiblePersonEditing,
} from './responsible-person-dialog';
import {
  alwaysRequiredRoles,
  type ResponsiblePerson,
  responsibleRoleLabels,
  responsibleRoleOrder,
} from './responsible-person-schema';
import { useDocumentDetails } from './use-document-details-form';

const focusRoles: Record<Exclude<TrainingFocus, 'training-schedule'>, ResponsiblePersonRole> = {
  'workplace-manager': 'workplace_manager',
  'first-aid': 'first_aid',
  'risk-evaluation-team': 'risk_evaluation_team',
  'imminent-danger': 'imminent_danger',
  'workers-representative': 'workers_representative',
  'workers-representative-clash': 'workers_representative',
};

const personRowId = (id: string) => `responsible-person-${id}`;

// `readOnly` is an archived client.
export function ResponsiblePersonsCard({
  clientId,
  userId,
  readOnly,
  focus,
}: {
  clientId: string;
  userId: string;
  readOnly: boolean;
  focus?: Exclude<TrainingFocus, 'training-schedule'>;
}) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const persons = useListResponsiblePersons(clientId, {
    request: apiRequest,
    query: { queryKey: [...getListResponsiblePersonsQueryKey(clientId), userId] },
  });
  const archive = useArchiveResponsiblePerson({ request: apiRequest });
  const update = useUpdateResponsiblePerson({ request: apiRequest });
  const [editing, setEditing] = useState<ResponsiblePersonEditing>(null);
  const [pointedRole, setPointedRole] = useState<ResponsiblePersonRole | null>(null);
  const details = useDocumentDetails(clientId, userId);
  const [archiving, setArchiving] = useState<ResponsiblePerson | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Each decision names someone, so a role nobody holds is what generating will ask for.
  const held = new Set(persons.data?.items.flatMap((person) => person.roles));
  const missing = alwaysRequiredRoles.filter((role) => !held.has(role));

  const addRef = useRef<HTMLButtonElement>(null);

  // Opening the representative who clashes lets the role be taken off them; adding someone
  // else would leave the clash in place.
  function clashingPerson() {
    const legalRepresentative = details.data?.documentDetails.legalRepresentativeName;
    if (focus !== 'workers-representative-clash' || !legalRepresentative) return undefined;
    return persons.data?.items.find(
      (person) =>
        person.roles.includes('workers_representative') &&
        samePersonName(person.fullName, legalRepresentative)
    );
  }

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

  async function adoptContractTitle(person: ResponsiblePerson, jobTitle: string) {
    setError(null);
    try {
      await update.mutateAsync({
        clientId,
        responsiblePersonId: person.id,
        data: {
          employeeId: person.employeeId,
          fullName: person.fullName,
          jobTitle,
          roles: person.roles,
        },
      });
      toast.success(`Funcția lui ${person.fullName} a fost actualizată.`);
    } catch {
      setError('Nu am putut actualiza funcția. Verifică conexiunea și încearcă din nou.');
    }
    await queryClient.invalidateQueries({ queryKey: getListResponsiblePersonsQueryKey(clientId) });
  }

  async function archivePerson(person: ResponsiblePerson) {
    setError(null);
    try {
      await archive.mutateAsync({ clientId, responsiblePersonId: person.id });
      toast.success(`${person.fullName} a fost scos din listă.`);
    } catch (cause) {
      setError(
        cause instanceof ApiHttpError && cause.status === 404
          ? `${person.fullName} nu mai este în lista acestui client.`
          : 'Nu am putut scoate persoana din listă. Verifică conexiunea și încearcă din nou.'
      );
    }
    setArchiving(null);
    // Also after a failure: a 404 means the list on screen is out of date.
    await queryClient.invalidateQueries({ queryKey: getListResponsiblePersonsQueryKey(clientId) });
  }

  return (
    <SectionCard
      data-testid="responsible-persons-card"
      title="Persoane responsabile"
      action={
        !readOnly && (
          <Button
            ref={addRef}
            variant="outline"
            size="sm"
            data-testid="responsible-add"
            onClick={() => setEditing('new')}
          >
            <Plus aria-hidden="true" />
            Adaugă
          </Button>
        )
      }
    >
      {error && (
        <Notice variant="destructive" data-testid="responsible-persons-error">
          {error}
        </Notice>
      )}
      {persons.isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : persons.isError ? (
        <Notice
          variant="destructive"
          action={
            <Button
              variant="outline"
              disabled={persons.isFetching}
              onClick={() => void persons.refetch()}
            >
              Încearcă din nou
            </Button>
          }
        >
          Nu am putut încărca persoanele responsabile.
        </Notice>
      ) : (
        <>
          {persons.data.items.length === 0 ? (
            <p data-testid="responsible-persons-empty" className="text-sm text-muted-foreground">
              {readOnly
                ? 'Nu au fost desemnate persoane responsabile pentru acest client.'
                : 'Nicio persoană responsabilă încă. Începe cu conducătorul locului de muncă. Poți atribui mai multe responsabilități aceleiași persoane.'}
            </p>
          ) : (
            <Table className="max-sm:block">
              <TableHeader className="max-sm:sr-only">
                <TableRow>
                  <TableHead>Nume și prenume</TableHead>
                  <TableHead>Funcția</TableHead>
                  <TableHead>Responsabilități</TableHead>
                  {!readOnly && (
                    <TableHead className="w-12">
                      <span className="sr-only">Acțiuni</span>
                    </TableHead>
                  )}
                </TableRow>
              </TableHeader>
              <TableBody className="max-sm:block">
                {persons.data.items.map((person) => (
                  <TableRow
                    key={person.id}
                    id={personRowId(person.id)}
                    data-testid="responsible-row"
                    {...rowClickProps(readOnly ? undefined : () => setEditing(person))}
                    className={cn(
                      'max-sm:grid max-sm:grid-cols-[minmax(0,1fr)_auto] max-sm:gap-x-2 max-sm:gap-y-1 max-sm:py-3',
                      !readOnly && 'cursor-pointer'
                    )}
                  >
                    <TableCell className="font-medium max-sm:p-0 max-sm:whitespace-normal">
                      {person.fullName}
                    </TableCell>
                    <TableCell className="text-muted-foreground max-sm:col-start-1 max-sm:p-0 max-sm:whitespace-normal">
                      {person.jobTitle}
                      {person.employeeJobTitle && person.employeeJobTitle !== person.jobTitle && (
                        <span
                          data-testid="responsible-title-drift"
                          className="mt-1 flex flex-wrap items-center gap-x-2 text-xs whitespace-normal"
                        >
                          În contractul angajatului: „{person.employeeJobTitle}”.
                          {!readOnly && (
                            <Button
                              variant="link"
                              size="sm"
                              data-testid="responsible-title-adopt"
                              className="h-auto p-0 text-xs"
                              disabled={update.isPending}
                              onClick={() =>
                                void adoptContractTitle(person, person.employeeJobTitle!)
                              }
                            >
                              Folosește această funcție
                            </Button>
                          )}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="max-sm:col-start-1 max-sm:p-0 max-sm:pt-1">
                      <span className="flex flex-wrap gap-1.5">
                        {responsibleRoleOrder
                          .filter((role) => person.roles.includes(role))
                          .map((role) => (
                            <Badge key={role} variant="secondary">
                              {responsibleRoleLabels[role].label}
                            </Badge>
                          ))}
                      </span>
                    </TableCell>
                    {!readOnly && (
                      <TableCell className="max-sm:col-start-2 max-sm:row-span-3 max-sm:row-start-1 max-sm:p-0">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              data-testid="responsible-actions"
                              aria-label={`Acțiuni pentru ${person.fullName}`}
                            >
                              <MoreHorizontal aria-hidden="true" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              data-testid="responsible-edit"
                              onSelect={() => setEditing(person)}
                            >
                              Modifică
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              data-testid="responsible-archive"
                              variant="destructive"
                              onSelect={() => setArchiving(person)}
                            >
                              Scoate din listă
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {missing.length > 0 && persons.data.items.length > 0 && (
            <p data-testid="responsible-missing" className="text-sm text-muted-foreground">
              Fără persoană numită:{' '}
              {missing.map((role) => responsibleRoleLabels[role].label).join(', ')}.
            </p>
          )}
        </>
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
      <Dialog
        open={archiving !== null}
        onOpenChange={(open) => !open && !archive.isPending && setArchiving(null)}
      >
        {archiving && (
          <DialogContent data-testid="responsible-archive-dialog" className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Scoți persoana din listă?</DialogTitle>
              <DialogDescription>
                <span className="font-medium text-foreground">{archiving.fullName}</span> nu va mai
                fi numită în documentele generate de acum înainte. Documentele deja emise rămân
                neschimbate, iar angajatul rămâne în lista de angajați.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="mt-2">
              <Button
                variant="ghost"
                disabled={archive.isPending}
                onClick={() => setArchiving(null)}
              >
                Renunță
              </Button>
              <Button
                variant="destructive"
                data-testid="responsible-archive-confirm"
                disabled={archive.isPending}
                onClick={() => void archivePerson(archiving)}
              >
                {archive.isPending ? 'Se scoate…' : 'Scoate din listă'}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </SectionCard>
  );
}
