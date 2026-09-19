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
  getListWorkplacesQueryKey,
  useArchiveWorkplace,
  useListWorkplaces,
} from '../api/generated/api';
import { ApiHttpError } from '../api/http';
import { WorkplaceDialog, type WorkplaceEditing } from './workplace-dialog';
import { type Workplace, workplaceAddress } from './workplace-schema';

// `readOnly` is an archived client.
export function WorkplacesCard({
  clientId,
  userId,
  readOnly,
}: {
  clientId: string;
  userId: string;
  readOnly: boolean;
}) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const workplaces = useListWorkplaces(clientId, {
    request: apiRequest,
    query: { queryKey: [...getListWorkplacesQueryKey(clientId), userId] },
  });
  const archive = useArchiveWorkplace({ request: apiRequest });
  const [editing, setEditing] = useState<WorkplaceEditing>(null);
  const [archiving, setArchiving] = useState<Workplace | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function archiveWorkplace(workplace: Workplace) {
    setError(null);
    try {
      await archive.mutateAsync({ clientId, workplaceId: workplace.id });
      toast.success(`${workplace.name} a fost arhivat.`);
    } catch (cause) {
      setError(
        cause instanceof ApiHttpError && cause.status === 404
          ? `${workplace.name} nu mai există la acest client.`
          : 'Nu am putut arhiva punctul de lucru. Verifică conexiunea și încearcă din nou.'
      );
    }
    setArchiving(null);
    // Also after a failure: a 404 means the list on screen is out of date.
    await queryClient.invalidateQueries({ queryKey: getListWorkplacesQueryKey(clientId) });
  }

  return (
    <Card data-testid="workplaces-card">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Sediu și puncte de lucru</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Documentele aparțin clientului, nu unui punct de lucru; ele enumeră locurile în care își
            desfășoară activitatea.
          </p>
        </div>
        {!readOnly && (
          <Button variant="outline" data-testid="workplace-add" onClick={() => setEditing('new')}>
            <Plus aria-hidden="true" />
            Adaugă
          </Button>
        )}
      </CardHeader>
      <CardContent className="grid gap-4">
        {error && (
          <p
            data-testid="workplaces-error"
            role="alert"
            className="rounded-md border border-destructive/30 p-3 text-sm text-destructive"
          >
            {error}
          </p>
        )}
        {workplaces.isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : workplaces.isError ? (
          <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive">
            <p>Nu am putut încărca punctele de lucru.</p>
            <Button
              variant="outline"
              disabled={workplaces.isFetching}
              onClick={() => void workplaces.refetch()}
            >
              Încearcă din nou
            </Button>
          </div>
        ) : workplaces.data.items.length === 0 ? (
          <p data-testid="workplaces-empty" className="text-sm text-muted-foreground">
            Niciun punct de lucru încă. Începe cu sediul social.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Denumire</TableHead>
                <TableHead>Adresă</TableHead>
                {!readOnly && (
                  <TableHead className="w-12">
                    <span className="sr-only">Acțiuni</span>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {workplaces.data.items.map((workplace) => (
                <TableRow key={workplace.id} data-testid="workplace-row">
                  <TableCell className="font-medium">
                    <span className="flex flex-wrap items-center gap-2">
                      {workplace.name}
                      {workplace.isRegisteredOffice && (
                        <Badge variant="secondary">Sediu social</Badge>
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {workplaceAddress(workplace) || '—'}
                  </TableCell>
                  {!readOnly && (
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            data-testid="workplace-actions"
                            aria-label={`Acțiuni pentru ${workplace.name}`}
                          >
                            <MoreHorizontal aria-hidden="true" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            data-testid="workplace-edit"
                            onSelect={() => setEditing(workplace)}
                          >
                            Modifică
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            data-testid="workplace-archive"
                            variant="destructive"
                            onSelect={() => setArchiving(workplace)}
                          >
                            Arhivează
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
      </CardContent>
      <WorkplaceDialog clientId={clientId} editing={editing} onClose={() => setEditing(null)} />
      <Dialog
        open={archiving !== null}
        onOpenChange={(open) => !open && !archive.isPending && setArchiving(null)}
      >
        {archiving && (
          <DialogContent data-testid="workplace-archive-dialog" className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Arhivezi punctul de lucru?</DialogTitle>
              <DialogDescription>
                <span className="font-medium text-foreground">{archiving.name}</span> nu va mai
                apărea în listă și în documentele generate de acum înainte. Documentele deja emise
                rămân neschimbate.
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
                data-testid="workplace-archive-confirm"
                disabled={archive.isPending}
                onClick={() => void archiveWorkplace(archiving)}
              >
                {archive.isPending ? 'Se arhivează…' : 'Arhivează'}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </Card>
  );
}
