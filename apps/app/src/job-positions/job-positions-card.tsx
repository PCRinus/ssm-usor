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
import { Link, useNavigate, useRouteContext } from '@tanstack/react-router';
import { ChevronRight, MoreHorizontal, Plus } from 'lucide-react';
import { Fragment, useState } from 'react';

import {
  type ApiErrorResponse,
  getListJobPositionsQueryKey,
  useListJobPositions,
  useRemoveJobPosition,
} from '../api/generated/api';
import { ApiHttpError } from '../api/http';
import { rowClickProps } from '../components/data-table/row-click';
import { Notice } from '../components/notice';
import { SectionCard } from '../components/section-card';
import { instructionStateLabel, positionCountLabel } from '../instructions/instruction-schema';
import { equipmentStateLabel } from '../protective-equipment/equipment-schema';
import { DecisionBadge } from './decision-badge';
import { JobPositionDialog, type JobPositionEditing } from './job-position-dialog';
import {
  employeeCountLabel,
  intervalLabel,
  type JobPosition,
  staffCategoryLabels,
  staffCategoryShortLabels,
} from './job-position-schema';
import { type PositionSection, positionSections } from './position-sections';

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
    <SectionCard
      data-testid="job-positions-card"
      title="Posturi de lucru"
      description={
        !readOnly &&
        'Deschide un post ca să îi stabilești echipamentul de protecție și instrucțiunile.'
      }
      action={
        !readOnly && (
          <Button
            variant="outline"
            size="sm"
            data-testid="job-position-add"
            onClick={() => setEditing('new')}
          >
            <Plus aria-hidden="true" />
            Adaugă un post
          </Button>
        )
      }
    >
      {error && (
        <Notice variant="destructive" data-testid="job-positions-error">
          {error}
        </Notice>
      )}
      {!readOnly && positions.data && (
        <UndecidedNotice clientId={clientId} positions={positions.data.items} />
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
        <p data-testid="job-positions-empty" className="text-sm text-muted-foreground">
          {readOnly
            ? 'Clientul nu are posturi de lucru și, fiind arhivat, nu i se mai adaugă.'
            : 'Niciun post de lucru încă. Adaugă posturile clientului sau începe cu angajații: fiecare funcție nouă devine un post.'}
        </p>
      ) : (
        <Table className="max-sm:block">
          <TableHeader className="max-sm:sr-only">
            <TableRow>
              <TableHead>Post</TableHead>
              <TableHead>Categorie de personal</TableHead>
              <TableHead>Instruire</TableHead>
              <TableHead>Zona de lucru</TableHead>
              <TableHead>Angajați</TableHead>
              <TableHead>EIP</TableHead>
              <TableHead>Instrucțiuni</TableHead>
              <TableHead className="w-12">
                <span className="sr-only">Acțiuni</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody className="max-sm:block">
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
                className="cursor-pointer max-sm:grid max-sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] max-sm:gap-x-3 max-sm:gap-y-2 max-sm:py-3"
              >
                <TableCell className="max-sm:col-span-2 max-sm:row-start-1 max-sm:p-0 max-sm:whitespace-normal">
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
                <TableCell className="max-sm:col-start-1 max-sm:row-start-2 max-sm:p-0">
                  <Badge
                    variant={position.staffCategory === 'execution' ? 'secondary' : 'outline'}
                    title={staffCategoryLabels[position.staffCategory]}
                    data-testid="job-position-category-badge"
                  >
                    {staffCategoryShortLabels[position.staffCategory]}
                  </Badge>
                </TableCell>
                <TableCell
                  data-testid="job-position-interval-cell"
                  className="max-sm:col-span-2 max-sm:col-start-2 max-sm:row-start-2 max-sm:p-0 max-sm:whitespace-normal"
                >
                  <span className="text-muted-foreground sm:hidden">Instruire </span>
                  {position.trainingIntervalMonths ? (
                    intervalLabel(position.trainingIntervalMonths)
                  ) : (
                    <span className="text-muted-foreground">ca restul categoriei</span>
                  )}
                </TableCell>
                <TableCell
                  className={cn(
                    'text-muted-foreground max-sm:col-start-1 max-sm:row-start-3 max-sm:p-0 max-sm:whitespace-normal',
                    !position.workZone && 'max-sm:hidden'
                  )}
                >
                  {position.workZone ?? '—'}
                </TableCell>
                <TableCell
                  data-testid="job-position-employees"
                  className={cn(
                    'text-muted-foreground tabular-nums max-sm:row-start-3 max-sm:p-0',
                    position.workZone
                      ? 'max-sm:col-span-2 max-sm:col-start-2'
                      : 'max-sm:col-span-3 max-sm:col-start-1'
                  )}
                >
                  {employeeCountLabel(position.employeeCount)}
                </TableCell>
                <TableCell className="max-sm:col-start-1 max-sm:row-start-4 max-sm:grid max-sm:justify-items-start max-sm:gap-1 max-sm:p-0">
                  <span className="text-xs text-muted-foreground sm:hidden">EIP</span>
                  <StateLink
                    clientId={clientId}
                    position={position}
                    section={positionSections.equipment}
                    decision={position.needsProtectiveEquipment}
                    label={equipmentStateLabel(position)}
                    testId="job-position-equipment"
                  />
                </TableCell>
                <TableCell className="max-sm:col-span-2 max-sm:col-start-2 max-sm:row-start-4 max-sm:grid max-sm:justify-items-start max-sm:gap-1 max-sm:p-0">
                  <span className="text-xs text-muted-foreground sm:hidden">Instrucțiuni</span>
                  <StateLink
                    clientId={clientId}
                    position={position}
                    section={positionSections.instructions}
                    decision={position.needsInstructions}
                    label={instructionStateLabel(position)}
                    testId="job-position-instructions"
                  />
                </TableCell>
                <TableCell className="max-sm:col-start-3 max-sm:row-start-1 max-sm:-mt-1.5 max-sm:p-0">
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
                      <DropdownMenuItem asChild data-testid="job-position-menu-equipment">
                        <Link
                          to="/clients/$clientId/job-positions/$jobPositionId"
                          params={{ clientId, jobPositionId: position.id }}
                          hash={positionSections.equipment}
                        >
                          Echipament de protecție
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild data-testid="job-position-menu-instructions">
                        <Link
                          to="/clients/$clientId/job-positions/$jobPositionId"
                          params={{ clientId, jobPositionId: position.id }}
                          hash={positionSections.instructions}
                        >
                          Instrucțiuni
                        </Link>
                      </DropdownMenuItem>
                      {!readOnly && (
                        <>
                          <DropdownMenuSeparator />
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
                        </>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
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
    </SectionCard>
  );
}

function StateLink({
  clientId,
  position,
  section,
  decision,
  label,
  testId,
}: {
  clientId: string;
  position: JobPosition;
  section: PositionSection;
  decision: boolean | null;
  label: string;
  testId: string;
}) {
  return (
    <DecisionBadge asChild decision={decision}>
      <Link
        to="/clients/$clientId/job-positions/$jobPositionId"
        params={{ clientId, jobPositionId: position.id }}
        hash={section}
        data-testid={testId}
      >
        {label}
        <ChevronRight aria-hidden="true" />
      </Link>
    </DecisionBadge>
  );
}

const namesShown = 5;

function UndecidedNotice({ clientId, positions }: { clientId: string; positions: JobPosition[] }) {
  const equipment = positions.filter((position) => position.needsProtectiveEquipment === null);
  const instructions = positions.filter((position) => position.needsInstructions === null);
  if (equipment.length === 0 && instructions.length === 0) return null;
  return (
    <Notice variant="warning" data-testid="job-positions-undecided">
      <ul className="grid gap-1">
        {equipment.length > 0 && (
          <li data-testid="job-positions-undecided-equipment">
            {undecidedSentence(equipment.length, 'echipamentul de protecție stabilit')}{' '}
            <PositionNames
              clientId={clientId}
              positions={equipment}
              section={positionSections.equipment}
            />
          </li>
        )}
        {instructions.length > 0 && (
          <li data-testid="job-positions-undecided-instructions">
            {undecidedSentence(instructions.length, 'instrucțiunile stabilite')}{' '}
            <PositionNames
              clientId={clientId}
              positions={instructions}
              section={positionSections.instructions}
            />
          </li>
        )}
      </ul>
    </Notice>
  );
}

/** "Un post nu are instrucțiunile stabilite:", "3 posturi nu au …". */
function undecidedSentence(count: number, what: string) {
  return `${positionCountLabel(count)} ${count === 1 ? 'nu are' : 'nu au'} ${what}:`;
}

function PositionNames({
  clientId,
  positions,
  section,
}: {
  clientId: string;
  positions: JobPosition[];
  section: PositionSection;
}) {
  const shown = positions.slice(0, namesShown);
  const rest = positions.length - shown.length;
  return (
    <>
      {shown.map((position, index) => (
        <Fragment key={position.id}>
          {index > 0 && (index === shown.length - 1 && rest === 0 ? ' și ' : ', ')}
          <Link
            to="/clients/$clientId/job-positions/$jobPositionId"
            params={{ clientId, jobPositionId: position.id }}
            hash={section}
            className="font-medium underline underline-offset-4"
          >
            {position.name}
          </Link>
        </Fragment>
      ))}
      {rest > 0 && ` și încă ${rest}`}.
    </>
  );
}
