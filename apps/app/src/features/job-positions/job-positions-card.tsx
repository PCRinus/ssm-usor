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
import { Link, useNavigate, useRouteContext } from '@tanstack/react-router';
import { ChevronRight, MoreHorizontal, Plus } from 'lucide-react';
import { Fragment, useRef, useState } from 'react';

import {
  type ApiErrorResponse,
  getListJobPositionsQueryKey,
  getListRiskEvaluationsQueryKey,
  useListJobPositions,
  useListRiskEvaluations,
  useRemoveJobPosition,
} from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import { rowClickProps } from '@/components/data-table/row-click';
import { Notice } from '@/components/notice';
import { SectionCard } from '@/components/section-card';
import {
  domainDecision,
  domainLabels,
  instructionStateLabel,
  positionCountLabel,
} from '@/features/instructions/instruction-schema';
import { useFocusRequest } from '@/features/missing-data/focus';
import { equipmentStateLabel } from '@/features/protective-equipment/equipment-schema';
import {
  evaluationStateLabel,
  type RiskEvaluationSummary,
} from '@/features/risk-evaluations/risk-evaluation-schema';

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
  focus,
}: {
  clientId: string;
  userId: string;
  readOnly: boolean;
  focus?: 'add-position';
}) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const positions = useListJobPositions(clientId, {
    request: apiRequest,
    query: { queryKey: [...getListJobPositionsQueryKey(clientId), userId] },
  });
  const evaluations = useListRiskEvaluations(clientId, {
    request: apiRequest,
    query: { queryKey: [...getListRiskEvaluationsQueryKey(clientId), userId] },
  });
  const evaluationOf = new Map(
    (evaluations.data?.items ?? []).flatMap((evaluation) =>
      evaluation.jobPosition ? [[evaluation.jobPosition.id, evaluation] as const] : []
    )
  );
  const remove = useRemoveJobPosition({ request: apiRequest });
  const navigate = useNavigate();
  const [editing, setEditing] = useState<JobPositionEditing>(null);
  const [removing, setRemoving] = useState<JobPosition | null>(null);
  const [error, setError] = useState<string | null>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  useFocusRequest(focus === 'add-position', {
    anchor: () => addRef.current,
    open: readOnly ? undefined : () => setEditing('new'),
  });

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
        'Deschide un post ca să îi stabilești echipamentul de protecție și instrucțiunile și să îi evaluezi riscurile.'
      }
      action={
        !readOnly && (
          <Button
            ref={addRef}
            variant="tonal"
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
              <TableHead>Fișa de evaluare</TableHead>
              <TableHead className="w-12">
                <span className="sr-only">Acțiuni</span>
              </TableHead>
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
                      to: '/clienti/$clientId/posturi/$jobPositionId',
                      params: { clientId, jobPositionId: position.id },
                    })
                )}
                className="cursor-pointer"
              >
                <TableCell>
                  <Link
                    to="/clienti/$clientId/posturi/$jobPositionId"
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
                <TableCell className="text-muted-foreground">{position.workZone ?? '—'}</TableCell>
                <TableCell
                  data-testid="job-position-employees"
                  className="text-muted-foreground tabular-nums"
                >
                  {employeeCountLabel(position.employeeCount)}
                </TableCell>
                <TableCell>
                  <StateLink
                    clientId={clientId}
                    position={position}
                    section={positionSections.equipment}
                    decision={position.needsProtectiveEquipment}
                    label={equipmentStateLabel(position)}
                    testId="job-position-equipment"
                  />
                </TableCell>
                <TableCell>
                  <span className="grid grid-cols-[auto_auto] items-center justify-start gap-x-1.5 gap-y-1">
                    {(['ssm', 'su'] as const).map((domain) => (
                      <Fragment key={domain}>
                        <span className="text-xs text-muted-foreground">
                          {domainLabels[domain]}
                        </span>
                        <StateLink
                          clientId={clientId}
                          position={position}
                          section={
                            domain === 'ssm'
                              ? positionSections.instructions
                              : positionSections.fireInstructions
                          }
                          decision={domainDecision(position, domain).needsInstructions}
                          label={instructionStateLabel(domainDecision(position, domain))}
                          testId={
                            domain === 'ssm'
                              ? 'job-position-instructions'
                              : 'job-position-fire-instructions'
                          }
                        />
                      </Fragment>
                    ))}
                  </span>
                </TableCell>
                <TableCell>
                  {evaluations.data ? (
                    <RiskEvaluationLink
                      clientId={clientId}
                      position={position}
                      evaluation={evaluationOf.get(position.id) ?? null}
                    />
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </TableCell>
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
                      <DropdownMenuItem asChild data-testid="job-position-menu-equipment">
                        <Link
                          to="/clienti/$clientId/posturi/$jobPositionId"
                          params={{ clientId, jobPositionId: position.id }}
                          hash={positionSections.equipment}
                        >
                          Echipament de protecție
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild data-testid="job-position-menu-instructions">
                        <Link
                          to="/clienti/$clientId/posturi/$jobPositionId"
                          params={{ clientId, jobPositionId: position.id }}
                          hash={positionSections.instructions}
                        >
                          Instrucțiuni SSM
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild data-testid="job-position-menu-fire-instructions">
                        <Link
                          to="/clienti/$clientId/posturi/$jobPositionId"
                          params={{ clientId, jobPositionId: position.id }}
                          hash={positionSections.fireInstructions}
                        >
                          Instrucțiuni SU
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild data-testid="job-position-menu-risk">
                        <Link
                          to="/clienti/$clientId/posturi/$jobPositionId/fisa-de-evaluare"
                          params={{ clientId, jobPositionId: position.id }}
                        >
                          Fișa de evaluare
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
        to="/clienti/$clientId/posturi/$jobPositionId"
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

function RiskEvaluationLink({
  clientId,
  position,
  evaluation,
}: {
  clientId: string;
  position: JobPosition;
  evaluation: RiskEvaluationSummary | null;
}) {
  return (
    <DecisionBadge asChild decision={(evaluation && evaluation.factorCount > 0) || null}>
      <Link
        to="/clienti/$clientId/posturi/$jobPositionId/fisa-de-evaluare"
        params={{ clientId, jobPositionId: position.id }}
        data-testid="job-position-risk"
      >
        {evaluationStateLabel(evaluation)}
        <ChevronRight aria-hidden="true" />
      </Link>
    </DecisionBadge>
  );
}

const namesShown = 5;

function UndecidedNotice({ clientId, positions }: { clientId: string; positions: JobPosition[] }) {
  const equipment = positions.filter((position) => position.needsProtectiveEquipment === null);
  const instructions = positions.filter((position) => position.needsInstructions === null);
  const fireInstructions = positions.filter((position) => position.needsFireInstructions === null);
  if (equipment.length === 0 && instructions.length === 0 && fireInstructions.length === 0) {
    return null;
  }
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
            {undecidedSentence(instructions.length, 'instrucțiunile SSM stabilite')}{' '}
            <PositionNames
              clientId={clientId}
              positions={instructions}
              section={positionSections.instructions}
            />
          </li>
        )}
        {fireInstructions.length > 0 && (
          <li data-testid="job-positions-undecided-fire-instructions">
            {undecidedSentence(fireInstructions.length, 'instrucțiunile SU stabilite')}{' '}
            <PositionNames
              clientId={clientId}
              positions={fireInstructions}
              section={positionSections.fireInstructions}
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
            to="/clienti/$clientId/posturi/$jobPositionId"
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
