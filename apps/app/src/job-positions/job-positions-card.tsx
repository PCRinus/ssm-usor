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
import { Link, useNavigate, useRouteContext } from '@tanstack/react-router';
import { BriefcaseBusiness, MoreHorizontal, Plus } from 'lucide-react';
import { useState } from 'react';

import {
  type ApiErrorResponse,
  getListJobPositionsQueryKey,
  useListJobPositions,
  useRemoveJobPosition,
} from '../api/generated/api';
import { ApiHttpError } from '../api/http';
import { rowClickProps } from '../components/data-table/row-click';
import { Notice } from '../components/notice';
import { instructionStateLabel } from '../instructions/instruction-schema';
import { equipmentStateLabel } from '../protective-equipment/equipment-schema';
import { JobPositionDialog, type JobPositionEditing } from './job-position-dialog';
import {
  employeeCountLabel,
  intervalLabel,
  type JobPosition,
  staffCategoryLabels,
  staffCategoryShortLabels,
} from './job-position-schema';

// The posts a client employs people in (ADR 006). `readOnly` is an archived client.
export function JobPositionsCard({
  clientId,
  userId,
  readOnly,
}: {
  clientId: string;
  userId: string;
  readOnly: boolean;
}) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const positions = useListJobPositions(clientId, {
    request: apiRequest,
    query: { queryKey: [...getListJobPositionsQueryKey(clientId), userId] },
  });
  const remove = useRemoveJobPosition({ request: apiRequest });
  const navigate = useNavigate();
  const [editing, setEditing] = useState<JobPositionEditing>(null);
  const [removing, setRemoving] = useState<JobPosition | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function removePosition(position: JobPosition) {
    setError(null);
    try {
      await remove.mutateAsync({ clientId, jobPositionId: position.id });
      toast.success(`Postul „${position.name}” a fost șters.`);
    } catch (cause) {
      const body = cause instanceof ApiHttpError ? (cause.body as Partial<ApiErrorResponse>) : null;
      setError(
        body?.reason === 'job_position_held'
          ? `Pe postul „${position.name}” mai sunt angajați. Mută-i pe alt post înainte să îl ștergi.`
          : cause instanceof ApiHttpError && cause.status === 404
            ? `Postul „${position.name}” nu mai există la acest client.`
            : 'Nu am putut șterge postul de lucru. Verifică conexiunea și încearcă din nou.'
      );
    }
    setRemoving(null);
    // Also after a failure: the list on screen may be out of date.
    await queryClient.invalidateQueries({ queryKey: getListJobPositionsQueryKey(clientId) });
  }

  return (
    <Card data-testid="job-positions-card">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-semibold">Posturi de lucru</h2>
        {!readOnly && (
          <Button data-testid="job-position-add" onClick={() => setEditing('new')}>
            <Plus aria-hidden="true" />
            Adaugă un post
          </Button>
        )}
      </CardHeader>
      <CardContent className="grid gap-4">
        {error && (
          <Notice variant="destructive" data-testid="job-positions-error">
            {error}
          </Notice>
        )}
        {positions.isPending ? (
          <Skeleton className="h-32 w-full" />
        ) : positions.isError ? (
          <Notice
            variant="destructive"
            action={
              <Button
                variant="outline"
                disabled={positions.isFetching}
                onClick={() => void positions.refetch()}
              >
                Încearcă din nou
              </Button>
            }
          >
            Nu am putut încărca posturile de lucru.
          </Notice>
        ) : positions.data.items.length === 0 ? (
          <div data-testid="job-positions-empty" className="grid justify-items-center gap-2 py-10">
            <BriefcaseBusiness className="size-8 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm font-medium">Niciun post de lucru încă</p>
            <p className="max-w-md text-center text-sm text-muted-foreground">
              {readOnly
                ? 'Clientul este arhivat, așa că nu i se mai adaugă posturi.'
                : 'Adaugă posturile clientului sau începe cu angajații. Fiecare funcție nouă devine un post.'}
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Post</TableHead>
                <TableHead>Categorie de personal</TableHead>
                <TableHead>Instruire</TableHead>
                <TableHead>Zona de lucru</TableHead>
                <TableHead>Angajați</TableHead>
                <TableHead>EIP</TableHead>
                <TableHead>Instrucțiuni</TableHead>
                {!readOnly && (
                  <TableHead className="w-12">
                    <span className="sr-only">Acțiuni</span>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {positions.data.items.map((position) => (
                <TableRow
                  key={position.id}
                  data-testid="job-position-row"
                  {...rowClickProps(
                    () =>
                      void navigate({
                        to: '/clients/$clientId/job-positions/$jobPositionId',
                        params: { clientId, jobPositionId: position.id },
                      })
                  )}
                >
                  <TableCell>
                    <Link
                      to="/clients/$clientId/job-positions/$jobPositionId"
                      params={{ clientId, jobPositionId: position.id }}
                      data-testid="job-position-open"
                      className="font-medium hover:underline"
                    >
                      {position.name}
                    </Link>
                    {position.activities && (
                      <span className="mt-0.5 line-clamp-2 block max-w-xl text-xs whitespace-normal text-muted-foreground">
                        {position.activities}
                      </span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={position.staffCategory === 'execution' ? 'secondary' : 'outline'}
                      title={staffCategoryLabels[position.staffCategory]}
                      data-testid="job-position-category-badge"
                    >
                      {staffCategoryShortLabels[position.staffCategory]}
                    </Badge>
                  </TableCell>
                  <TableCell data-testid="job-position-interval-cell">
                    {position.trainingIntervalMonths ? (
                      intervalLabel(position.trainingIntervalMonths)
                    ) : (
                      <span className="text-muted-foreground">ca restul categoriei</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {position.workZone ?? '—'}
                  </TableCell>
                  <TableCell
                    data-testid="job-position-employees"
                    className="text-muted-foreground tabular-nums"
                  >
                    {employeeCountLabel(position.employeeCount)}
                  </TableCell>
                  <TableCell
                    data-testid="job-position-equipment"
                    className={
                      position.needsProtectiveEquipment === null
                        ? 'text-amber-700 dark:text-amber-400'
                        : 'text-muted-foreground'
                    }
                  >
                    {equipmentStateLabel(position)}
                  </TableCell>
                  <TableCell
                    data-testid="job-position-instructions"
                    className={
                      position.needsInstructions === null
                        ? 'text-amber-700 dark:text-amber-400'
                        : 'text-muted-foreground'
                    }
                  >
                    {instructionStateLabel(position)}
                  </TableCell>
                  {!readOnly && (
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            data-testid="job-position-actions"
                            aria-label={`Acțiuni pentru ${position.name}`}
                          >
                            <MoreHorizontal aria-hidden="true" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            data-testid="job-position-edit"
                            onSelect={() => setEditing(position)}
                          >
                            Modifică
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            data-testid="job-position-remove"
                            variant="destructive"
                            onSelect={() => setRemoving(position)}
                          >
                            Șterge
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
      <JobPositionDialog clientId={clientId} editing={editing} onClose={() => setEditing(null)} />
      <Dialog
        open={removing !== null}
        onOpenChange={(open) => !open && !remove.isPending && setRemoving(null)}
      >
        {removing && (
          <DialogContent data-testid="job-position-remove-dialog" className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Ștergi postul de lucru?</DialogTitle>
              <DialogDescription>
                <span className="font-medium text-foreground">{removing.name}</span>
                {removing.employeeCount > 0
                  ? ` este ocupat acum: ${employeeCountLabel(removing.employeeCount).toLowerCase()}. Un post se poate șterge doar după ce oamenii de pe el trec pe alt post sau pleacă.`
                  : ' nu va mai apărea în listă și nu va mai putea fi ales pentru un angajat. Dacă l-au ocupat oameni care au plecat, istoricul lor îl păstrează.'}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="mt-2">
              <Button variant="ghost" disabled={remove.isPending} onClick={() => setRemoving(null)}>
                Renunță
              </Button>
              <Button
                variant="destructive"
                data-testid="job-position-remove-confirm"
                disabled={remove.isPending || removing.employeeCount > 0}
                onClick={() => void removePosition(removing)}
              >
                {remove.isPending ? 'Se șterge…' : 'Șterge'}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </Card>
  );
}
