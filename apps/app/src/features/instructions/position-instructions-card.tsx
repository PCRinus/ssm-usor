import type { InstructionDomain } from '@ssm-usor/contracts';
import { Badge } from '@ssm-usor/ui/components/badge';
import { Button } from '@ssm-usor/ui/components/button';
import { Checkbox } from '@ssm-usor/ui/components/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ssm-usor/ui/components/dialog';
import { Input } from '@ssm-usor/ui/components/input';
import { NativeSelect, NativeSelectOption } from '@ssm-usor/ui/components/native-select';
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
import { Link, useRouteContext } from '@tanstack/react-router';
import { BookOpenText, Copy, ListChecks, X } from 'lucide-react';
import { useState } from 'react';

import {
  type ApiErrorResponse,
  getListInstructionModulesQueryKey,
  getListJobPositionsQueryKey,
  getListPositionInstructionsQueryKey,
  useApplyPositionInstructions,
  useCopyPositionInstructions,
  useDecidePositionInstructions,
  useListInstructionModules,
  useListJobPositions,
  useListPositionInstructions,
} from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import { EmptyState } from '@/components/empty-state';
import { Field } from '@/components/form-field';
import { Notice } from '@/components/notice';
import { SectionCard } from '@/components/section-card';
import { DecisionBadge } from '@/features/job-positions/decision-badge';
import type { JobPosition } from '@/features/job-positions/job-position-schema';
import { useSavedToast } from '@/features/missing-data/saved-toast';

import {
  type AppliedInstruction,
  byGroup,
  domainDecision,
  groupLabels,
  instructionStateLabel,
  moduleCountLabel,
} from './instruction-schema';

const domainCopy = {
  ssm: {
    title: 'Instrucțiuni specifice SSM',
    testId: 'instructions',
    specific: 'instrucțiuni specifice',
    none: 'Postul nu necesită instrucțiuni specifice dincolo de partea comună. Instrucțiunile proprii nu anexează nimic pentru el.',
    undecided:
      'Instrucțiunile proprii nu se pot genera până nu alegi ce instrucțiuni din bibliotecă privesc postul, sau spui că nu necesită.',
    pickTitle: (name: string) => `Instrucțiunile postului „${name}”`,
    pickDescription:
      'Bifează instrucțiunile din bibliotecă care privesc postul. Instrucțiunile proprii ale clientului le anexează, iar tematica de instruire le citează.',
    libraryEmpty:
      'Biblioteca este goală. Încarcă sau scrie instrucțiunile organizației, apoi alege-le aici.',
    copyTitle: 'Copiază instrucțiunile de la alt post',
    copyDescription:
      'Instrucțiunile celuilalt post se adaugă la ale acestuia; cele deja aplicate rămân.',
    copyEmpty: 'Niciun alt post al clientului nu aplică instrucțiuni încă.',
  },
  psi: {
    title: 'Instrucțiuni specifice PSI',
    testId: 'fire-instructions',
    specific: 'instrucțiuni specifice PSI',
    none: 'Postul nu necesită instrucțiuni specifice PSI dincolo de partea comună. Instrucțiunile proprii PSI nu anexează nimic pentru el.',
    undecided:
      'Documentele PSI nu se pot genera până nu alegi ce instrucțiuni PSI din bibliotecă privesc postul, sau spui că nu necesită.',
    pickTitle: (name: string) => `Instrucțiunile PSI ale postului „${name}”`,
    pickDescription:
      'Bifează instrucțiunile PSI din bibliotecă care privesc postul. Instrucțiunile proprii PSI ale clientului le anexează, iar tematica de instruire PSI le citează.',
    libraryEmpty:
      'Biblioteca nu are instrucțiuni PSI. Încarcă sau scrie instrucțiunile PSI ale organizației, apoi alege-le aici.',
    copyTitle: 'Copiază instrucțiunile PSI de la alt post',
    copyDescription:
      'Instrucțiunile PSI ale celuilalt post se adaugă la ale acestuia; cele deja aplicate rămân.',
    copyEmpty: 'Niciun alt post al clientului nu aplică instrucțiuni PSI încă.',
  },
} satisfies Record<InstructionDomain, unknown>;

const failureMessage = (cause: unknown, fallback: string) => {
  const body = cause instanceof ApiHttpError ? (cause.body as Partial<ApiErrorResponse>) : null;
  if (body?.reason === 'instructions_applied') {
    return 'Postul aplică instrucțiuni; scoate-le înainte să spui că nu necesită.';
  }
  if (body?.reason === 'instruction_module_archived') {
    return 'O instrucțiune aleasă a fost arhivată între timp. Alege din nou.';
  }
  if (body?.reason === 'instruction_module_other_domain') {
    return 'O instrucțiune aleasă a fost mutată în celălalt domeniu între timp. Alege din nou.';
  }
  if (cause instanceof ApiHttpError && cause.status === 409) {
    return 'Clientul este arhivat; instrucțiunile lui nu se mai schimbă.';
  }
  if (cause instanceof ApiHttpError && cause.status === 404) {
    return 'Postul nu mai există la acest client.';
  }
  return fallback;
};

// The instruction modules of one domain one job position applies (ADR 012). `readOnly` is an
// archived client.
export function PositionInstructionsCard({
  id,
  domain,
  clientId,
  position,
  userId,
  readOnly,
}: {
  id: string;
  domain: InstructionDomain;
  clientId: string;
  position: JobPosition;
  userId: string;
  readOnly: boolean;
}) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const savedToast = useSavedToast();
  const words = domainCopy[domain];
  const testId = (suffix: string) => `${words.testId}-${suffix}`;
  const params = { domain };
  const instructions = useListPositionInstructions(clientId, position.id, params, {
    request: apiRequest,
    query: {
      queryKey: [...getListPositionInstructionsQueryKey(clientId, position.id, params), userId],
    },
  });
  const decide = useDecidePositionInstructions({ request: apiRequest });
  const apply = useApplyPositionInstructions({ request: apiRequest });
  const [picking, setPicking] = useState(false);
  const [copying, setCopying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({
        queryKey: getListPositionInstructionsQueryKey(clientId, position.id),
      }),
      queryClient.invalidateQueries({ queryKey: getListJobPositionsQueryKey(clientId) }),
      queryClient.invalidateQueries({
        predicate: ({ queryKey }) => String(queryKey[0]).startsWith('/instruction-modules'),
      }),
    ]);

  async function decideNone(needsInstructions: false | null) {
    setError(null);
    try {
      await decide.mutateAsync({
        clientId,
        jobPositionId: position.id,
        data: { domain, needsInstructions },
      });
      savedToast(
        needsInstructions === false
          ? `Am notat că postul nu necesită ${words.specific}.`
          : 'Decizia a fost reluată.'
      );
    } catch (cause) {
      setError(
        failureMessage(cause, 'Nu am putut salva decizia. Verifică conexiunea și încearcă din nou.')
      );
    }
    await refresh();
  }

  async function remove(item: AppliedInstruction) {
    setError(null);
    const moduleIds = items
      .filter((other) => other.moduleId !== item.moduleId)
      .map((other) => other.moduleId);
    try {
      await apply.mutateAsync({
        clientId,
        jobPositionId: position.id,
        data: { domain, moduleIds },
      });
      toast.success(`„${item.title}” nu se mai aplică postului.`);
    } catch (cause) {
      setError(
        failureMessage(
          cause,
          'Nu am putut salva schimbarea. Verifică conexiunea și încearcă din nou.'
        )
      );
    }
    await refresh();
  }

  const decision =
    instructions.data?.needsInstructions ?? domainDecision(position, domain).needsInstructions;
  const items = instructions.data?.items ?? [];

  const pickAction = !readOnly && decision !== false && (
    <Button variant="tonal" size="sm" data-testid={testId('pick')} onClick={() => setPicking(true)}>
      <ListChecks aria-hidden="true" />
      Alege instrucțiunile
    </Button>
  );

  const copyAction = !readOnly && (
    <Button
      variant="outline"
      size="sm"
      data-testid={testId('copy')}
      onClick={() => setCopying(true)}
    >
      <Copy aria-hidden="true" />
      Copiază de la alt post
    </Button>
  );

  return (
    <SectionCard
      id={id}
      headingLevel={3}
      data-testid={testId('card')}
      title={
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          {words.title}
          {instructions.data && (
            <DecisionBadge decision={decision} data-testid={testId('state')}>
              {instructionStateLabel({
                needsInstructions: decision,
                instructionCount: items.length,
              })}
            </DecisionBadge>
          )}
        </span>
      }
      action={items.length > 0 && pickAction}
    >
      {error && (
        <Notice variant="destructive" data-testid={testId('error')}>
          {error}
        </Notice>
      )}
      {instructions.isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : instructions.isError ? (
        <Notice
          variant="destructive"
          action={
            <Button
              variant="outline"
              disabled={instructions.isFetching}
              onClick={() => void instructions.refetch()}
            >
              Încearcă din nou
            </Button>
          }
        >
          Nu am putut încărca instrucțiunile postului.
        </Notice>
      ) : decision === false ? (
        <Notice
          variant="info"
          data-testid={testId('none')}
          action={
            !readOnly && (
              <Button
                variant="outline"
                size="sm"
                data-testid={testId('undecide')}
                disabled={decide.isPending}
                onClick={() => void decideNone(null)}
              >
                Reia decizia
              </Button>
            )
          }
        >
          {words.none}
        </Notice>
      ) : items.length === 0 ? (
        <EmptyState
          data-testid={testId('empty')}
          icon={BookOpenText}
          actions={
            !readOnly && (
              <>
                {pickAction}
                <Button
                  variant="outline"
                  size="sm"
                  data-testid={testId('decide-none')}
                  disabled={decide.isPending}
                  onClick={() => void decideNone(false)}
                >
                  Postul nu necesită instrucțiuni specifice
                </Button>
                {copyAction}
              </>
            )
          }
        >
          {readOnly
            ? 'Nu s-a stabilit ce instrucțiuni privesc postul. Clientul este arhivat, așa că instrucțiunile lui nu se mai completează.'
            : words.undecided}
        </EmptyState>
      ) : (
        <>
          <Table className="max-sm:block">
            <TableHeader className="max-sm:sr-only">
              <TableRow>
                <TableHead>Instrucțiune</TableHead>
                <TableHead>Grup</TableHead>
                {!readOnly && (
                  <TableHead className="w-12">
                    <span className="sr-only">Acțiuni</span>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody className="max-sm:block">
              {items.map((item) => (
                <TableRow
                  key={item.moduleId}
                  data-testid={testId('row')}
                  className="max-sm:grid max-sm:grid-cols-[minmax(0,1fr)_auto] max-sm:gap-x-3 max-sm:gap-y-1 max-sm:py-3"
                >
                  <TableCell className="font-medium whitespace-normal max-sm:col-start-1 max-sm:row-start-1 max-sm:p-0">
                    <Link
                      to="/instructions/$moduleId"
                      params={{ moduleId: item.moduleId }}
                      className="hover:underline"
                      data-testid={testId('open')}
                    >
                      {item.title}
                    </Link>
                    {item.archivedAt && (
                      <Badge variant="outline" className="ml-2">
                        Arhivată
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground max-sm:col-start-1 max-sm:row-start-2 max-sm:p-0 max-sm:whitespace-normal">
                    {groupLabels[item.group]}
                  </TableCell>
                  {!readOnly && (
                    <TableCell className="max-sm:col-start-2 max-sm:row-span-2 max-sm:row-start-1 max-sm:p-0">
                      <Button
                        variant="ghost"
                        size="icon"
                        data-testid={testId('remove')}
                        aria-label={`Scoate ${item.title}`}
                        disabled={apply.isPending}
                        onClick={() => void remove(item)}
                      >
                        <X aria-hidden="true" />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {copyAction && <div>{copyAction}</div>}
        </>
      )}
      <PickInstructionsDialog
        domain={domain}
        clientId={clientId}
        position={position}
        userId={userId}
        applied={items}
        open={picking}
        onClose={() => setPicking(false)}
        onApplied={refresh}
      />
      <CopyInstructionsDialog
        domain={domain}
        clientId={clientId}
        position={position}
        userId={userId}
        open={copying}
        onClose={() => setCopying(false)}
        onCopied={refresh}
      />
    </SectionCard>
  );
}

function PickInstructionsDialog({
  domain,
  clientId,
  position,
  userId,
  applied,
  open,
  onClose,
  onApplied,
}: {
  domain: InstructionDomain;
  clientId: string;
  position: JobPosition;
  userId: string;
  applied: AppliedInstruction[];
  open: boolean;
  onClose: () => void;
  onApplied: () => Promise<unknown>;
}) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const savedToast = useSavedToast();
  const words = domainCopy[domain];
  const testId = (suffix: string) => `${words.testId}-${suffix}`;
  const params = { archived: 'false' as const, domain };
  const modules = useListInstructionModules(params, {
    request: apiRequest,
    query: { queryKey: [...getListInstructionModulesQueryKey(params), userId], enabled: open },
  });
  const apply = useApplyPositionInstructions({ request: apiRequest });
  const [chosen, setChosen] = useState<Set<string> | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  // What the position applies now, until the person changes it in this opening of the dialog.
  const selected = chosen ?? new Set(applied.map((item) => item.moduleId));
  const needle = query.trim().toLocaleLowerCase('ro');
  const items = (modules.data?.items ?? []).filter(
    (module) => !needle || module.title.toLocaleLowerCase('ro').includes(needle)
  );

  function toggle(moduleId: string, checked: boolean) {
    const next = new Set(selected);
    if (checked) next.add(moduleId);
    else next.delete(moduleId);
    setChosen(next);
  }

  function close() {
    setChosen(null);
    setQuery('');
    setError(null);
    onClose();
  }

  async function save() {
    setError(null);
    try {
      const result = await apply.mutateAsync({
        clientId,
        jobPositionId: position.id,
        data: { domain, moduleIds: [...selected] },
      });
      await onApplied();
      savedToast(
        result.items.length === 0
          ? 'Postul nu mai aplică nicio instrucțiune și a rămas nedecis.'
          : `Postul aplică acum ${moduleCountLabel(result.items.length).toLowerCase()}.`
      );
      close();
    } catch (cause) {
      setError(
        failureMessage(
          cause,
          'Nu am putut salva alegerea. Verifică conexiunea și încearcă din nou.'
        )
      );
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && !apply.isPending && close()}>
      <DialogContent data-testid={testId('pick-dialog')} className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{words.pickTitle(position.name)}</DialogTitle>
          <DialogDescription>{words.pickDescription}</DialogDescription>
        </DialogHeader>
        <div className="mt-4 grid gap-4">
          {error && (
            <Notice variant="destructive" data-testid={testId('pick-error')}>
              {error}
            </Notice>
          )}
          {modules.isPending ? (
            <Skeleton className="h-32 w-full" />
          ) : modules.isError ? (
            <Notice variant="destructive">Nu am putut încărca biblioteca.</Notice>
          ) : (modules.data?.items.length ?? 0) === 0 ? (
            <Notice
              variant="info"
              data-testid={testId('pick-empty')}
              action={
                <Button asChild variant="outline">
                  <Link to={domain === 'psi' ? '/instructions/psi' : '/instructions/ssm'}>
                    Deschide biblioteca
                  </Link>
                </Button>
              }
            >
              {words.libraryEmpty}
            </Notice>
          ) : (
            <>
              <Input
                data-testid={testId('pick-search')}
                placeholder="Caută după titlu…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                aria-label="Caută o instrucțiune"
              />
              <div className="grid max-h-[50vh] gap-4 overflow-y-auto pr-1">
                {byGroup(items).map(({ group, items: grouped }) => (
                  <fieldset key={group} className="grid gap-2">
                    <legend className="mb-1 text-xs font-medium text-muted-foreground uppercase">
                      {groupLabels[group]}
                    </legend>
                    {grouped.map((module) => (
                      <label
                        key={module.id}
                        className="flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm hover:bg-muted/50"
                      >
                        <Checkbox
                          data-testid={testId('pick-option')}
                          checked={selected.has(module.id)}
                          onCheckedChange={(checked) => toggle(module.id, checked === true)}
                          disabled={apply.isPending}
                        />
                        <span className="min-w-0 flex-1">{module.title}</span>
                        <Link
                          to="/instructions/$moduleId"
                          params={{ moduleId: module.id }}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs text-muted-foreground hover:underline"
                          onClick={(event) => event.stopPropagation()}
                        >
                          Vezi
                        </Link>
                      </label>
                    ))}
                  </fieldset>
                ))}
                {items.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    Nicio instrucțiune nu se potrivește.
                  </p>
                )}
              </div>
            </>
          )}
        </div>
        <DialogFooter className="mt-4">
          <Button variant="ghost" disabled={apply.isPending} onClick={close}>
            Renunță
          </Button>
          <Button
            data-testid={testId('pick-save')}
            disabled={apply.isPending || modules.isPending}
            onClick={() => void save()}
          >
            {apply.isPending ? 'Se salvează…' : 'Salvează'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CopyInstructionsDialog({
  domain,
  clientId,
  position,
  userId,
  open,
  onClose,
  onCopied,
}: {
  domain: InstructionDomain;
  clientId: string;
  position: JobPosition;
  userId: string;
  open: boolean;
  onClose: () => void;
  onCopied: () => Promise<unknown>;
}) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const savedToast = useSavedToast();
  const words = domainCopy[domain];
  const testId = (suffix: string) => `${words.testId}-${suffix}`;
  const countOf = (candidate: JobPosition) => domainDecision(candidate, domain).instructionCount;
  const positions = useListJobPositions(clientId, {
    request: apiRequest,
    query: { queryKey: [...getListJobPositionsQueryKey(clientId), userId], enabled: open },
  });
  const copy = useCopyPositionInstructions({ request: apiRequest });
  const [source, setSource] = useState('');
  const [error, setError] = useState<string | null>(null);
  const sources = (positions.data?.items ?? []).filter(
    (candidate) => candidate.id !== position.id && countOf(candidate) > 0
  );

  async function copyModules() {
    setError(null);
    try {
      const result = await copy.mutateAsync({
        clientId,
        jobPositionId: position.id,
        data: { domain, fromJobPositionId: source },
      });
      await onCopied();
      savedToast(`Postul aplică acum ${moduleCountLabel(result.items.length).toLowerCase()}.`);
      onClose();
    } catch (cause) {
      setError(
        failureMessage(
          cause,
          'Nu am putut copia instrucțiunile. Verifică conexiunea și încearcă din nou.'
        )
      );
    }
  }

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && !copy.isPending && onClose()}>
      <DialogContent data-testid={testId('copy-dialog')} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{words.copyTitle}</DialogTitle>
          <DialogDescription>{words.copyDescription}</DialogDescription>
        </DialogHeader>
        <div className="mt-4 grid gap-4">
          {error && <Notice variant="destructive">{error}</Notice>}
          {positions.isSuccess && sources.length === 0 ? (
            <Notice variant="info" data-testid={testId('copy-empty')}>
              {words.copyEmpty}
            </Notice>
          ) : (
            <Field id={testId('copy-source')} label="Postul de la care copiezi" mark="required">
              <NativeSelect
                id={testId('copy-source')}
                data-testid={testId('copy-source')}
                value={source}
                disabled={copy.isPending || positions.isPending}
                onChange={(event) => setSource(event.target.value)}
              >
                <NativeSelectOption value="">Alege un post…</NativeSelectOption>
                {sources.map((candidate) => (
                  <NativeSelectOption key={candidate.id} value={candidate.id}>
                    {`${candidate.name} (${moduleCountLabel(countOf(candidate)).toLowerCase()})`}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
          )}
        </div>
        <DialogFooter className="mt-4">
          <Button variant="ghost" disabled={copy.isPending} onClick={onClose}>
            Renunță
          </Button>
          <Button
            data-testid={testId('copy-confirm')}
            disabled={!source || copy.isPending}
            onClick={() => void copyModules()}
          >
            {copy.isPending ? 'Se copiază…' : 'Copiază'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
