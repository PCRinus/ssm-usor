import { Badge } from '@ssm-usor/ui/components/badge';
import { Button } from '@ssm-usor/ui/components/button';
import { Card, CardContent, CardHeader } from '@ssm-usor/ui/components/card';
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
import { useRouteContext } from '@tanstack/react-router';
import { MoreHorizontal, Plus } from 'lucide-react';
import { useState } from 'react';

import {
  getListResponsiblePersonsQueryKey,
  useArchiveResponsiblePerson,
  useListResponsiblePersons,
} from '../api/generated/api';
import { ApiHttpError } from '../api/http';
import { rowClickProps } from '../components/data-table/row-click';
import {
  ResponsiblePersonDialog,
  type ResponsiblePersonEditing,
} from './responsible-person-dialog';
import {
  type ResponsiblePerson,
  responsibleRoleLabels,
  responsibleRoleOrder,
} from './responsible-person-schema';

// `readOnly` is an archived client.
export function ResponsiblePersonsCard({
  clientId,
  userId,
  readOnly,
}: {
  clientId: string;
  userId: string;
  readOnly: boolean;
}) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const persons = useListResponsiblePersons(clientId, {
    request: apiRequest,
    query: { queryKey: [...getListResponsiblePersonsQueryKey(clientId), userId] },
  });
  const archive = useArchiveResponsiblePerson({ request: apiRequest });
  const [editing, setEditing] = useState<ResponsiblePersonEditing>(null);
  const [archiving, setArchiving] = useState<ResponsiblePerson | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Each decision names someone, so a role nobody holds is what generating will ask for.
  const held = new Set(persons.data?.items.flatMap((person) => person.roles));
  const missing = responsibleRoleOrder.filter((role) => !held.has(role));

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
    <Card data-testid="responsible-persons-card">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Persoane responsabile</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Persoanele pe care angajatorul le numește prin decizie. De multe ori aceeași persoană
            are toate responsabilitățile.
          </p>
        </div>
        {!readOnly && (
          <Button variant="outline" data-testid="responsible-add" onClick={() => setEditing('new')}>
            <Plus aria-hidden="true" />
            Adaugă
          </Button>
        )}
      </CardHeader>
      <CardContent className="grid gap-4">
        {error && (
          <p
            data-testid="responsible-persons-error"
            role="alert"
            className="rounded-md border border-destructive/30 p-3 text-sm text-destructive"
          >
            {error}
          </p>
        )}
        {persons.isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : persons.isError ? (
          <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive">
            <p>Nu am putut încărca persoanele responsabile.</p>
            <Button
              variant="outline"
              disabled={persons.isFetching}
              onClick={() => void persons.refetch()}
            >
              Încearcă din nou
            </Button>
          </div>
        ) : (
          <>
            {persons.data.items.length === 0 ? (
              <p data-testid="responsible-persons-empty" className="text-sm text-muted-foreground">
                Nicio persoană încă. Începe cu conducătorul locului de muncă.
              </p>
            ) : (
              <Table>
                <TableHeader>
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
                <TableBody>
                  {persons.data.items.map((person) => (
                    <TableRow
                      key={person.id}
                      data-testid="responsible-row"
                      {...rowClickProps(readOnly ? undefined : () => setEditing(person))}
                    >
                      <TableCell className="font-medium">{person.fullName}</TableCell>
                      <TableCell className="text-muted-foreground">{person.jobTitle}</TableCell>
                      <TableCell>
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
                        <TableCell>
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
      </CardContent>
      <ResponsiblePersonDialog
        clientId={clientId}
        userId={userId}
        editing={editing}
        onClose={() => setEditing(null)}
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
    </Card>
  );
}
