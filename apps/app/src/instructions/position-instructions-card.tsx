import { Badge } from '@ssm-usor/ui/components/badge';
import { Button } from '@ssm-usor/ui/components/button';
import { Card, CardContent, CardHeader } from '@ssm-usor/ui/components/card';
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
} from '../api/generated/api';
import { ApiHttpError } from '../api/http';
import { Field } from '../components/form-field';
import { Notice } from '../components/notice';
import type { JobPosition } from '../job-positions/job-position-schema';
import {
  type AppliedInstruction,
  byGroup,
  groupLabels,
  moduleCountLabel,
} from './instruction-schema';

const failureMessage = (cause: unknown, fallback: string) => {
  const body = cause instanceof ApiHttpError ? (cause.body as Partial<ApiErrorResponse>) : null;
  if (body?.reason === 'instructions_applied') {
    return 'Postul aplică instrucțiuni; scoate-le înainte să spui că nu necesită.';
  }
  if (body?.reason === 'instruction_module_archived') {
    return 'O instrucțiune aleasă a fost arhivată între timp. Alege din nou.';
  }
  if (cause instanceof ApiHttpError && cause.status === 409) {
    return 'Clientul este arhivat; instrucțiunile lui nu se mai schimbă.';
  }
  if (cause instanceof ApiHttpError && cause.status === 404) {
    return 'Postul nu mai există la acest client.';
  }
  return fallback;
};

// The instruction modules one job position applies (ADR 012). `readOnly` is an archived client.
export function PositionInstructionsCard({
  clientId,
  position,
  userId,
  readOnly,
}: {
  clientId: string;
  position: JobPosition;
  userId: string;
  readOnly: boolean;
}) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const instructions = useListPositionInstructions(clientId, position.id, {
    request: apiRequest,
    query: {
      queryKey: [...getListPositionInstructionsQueryKey(clientId, position.id), userId],
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
        data: { needsInstructions },
      });
      toast.success(
        needsInstructions === false
          ? 'Am notat că postul nu necesită instrucțiuni specifice.'
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
      await apply.mutateAsync({ clientId, jobPositionId: position.id, data: { moduleIds } });
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

  const decision = instructions.data?.needsInstructions ?? position.needsInstructions;
  const items = instructions.data?.items ?? [];

  return (
    <Card data-testid="instructions-card">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold">Instrucțiuni specifice</h2>
          {instructions.data && (
            <Badge
              variant={decision === null ? 'outline' : 'secondary'}
              data-testid="instructions-state"
            >
              {decision === null
                ? 'Nedecis'
                : decision === false
                  ? 'Nu necesită'
                  : moduleCountLabel(items.length)}
            </Badge>
          )}
        </div>
        {!readOnly && decision !== false && (
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              data-testid="instructions-copy"
              onClick={() => setCopying(true)}
            >
              <Copy aria-hidden="true" />
              Copiază de la alt post
            </Button>
            <Button data-testid="instructions-pick" onClick={() => setPicking(true)}>
              <ListChecks aria-hidden="true" />
              Alege instrucțiunile
            </Button>
          </div>
        )}
      </CardHeader>
      <CardContent className="grid gap-4">
        {error && (
          <Notice variant="destructive" data-testid="instructions-error">
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
            data-testid="instructions-none"
            action={
              !readOnly && (
                <Button
                  variant="outline"
                  data-testid="instructions-undecide"
                  disabled={decide.isPending}
                  onClick={() => void decideNone(null)}
                >
                  Reia decizia
                </Button>
              )
            }
          >
            Postul nu necesită instrucțiuni specifice dincolo de partea comună. Instrucțiunile
            proprii nu anexează nimic pentru el.
          </Notice>
        ) : items.length === 0 ? (
          <div data-testid="instructions-empty" className="grid justify-items-center gap-3 py-8">
            <BookOpenText className="size-8 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm font-medium">Nedecis încă</p>
            <p className="max-w-md text-center text-sm text-muted-foreground">
              {readOnly
                ? 'Clientul este arhivat, așa că instrucțiunile lui nu se mai completează.'
                : 'Instrucțiunile proprii nu se pot genera până nu alegi ce instrucțiuni din bibliotecă privesc postul, sau spui că nu necesită.'}
            </p>
            {!readOnly && (
              <Button
                variant="outline"
                data-testid="instructions-decide-none"
                disabled={decide.isPending}
                onClick={() => void decideNone(false)}
              >
                Postul nu necesită instrucțiuni specifice
              </Button>
            )}
          </div>
        ) : (
          <Table>
            <TableHeader>
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
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.moduleId} data-testid="instructions-row">
                  <TableCell className="font-medium whitespace-normal">
                    <Link
                      to="/instructions/$moduleId"
                      params={{ moduleId: item.moduleId }}
                      className="hover:underline"
                      data-testid="instructions-open"
                    >
                      {item.title}
                    </Link>
                    {item.archivedAt && (
                      <Badge variant="outline" className="ml-2">
                        Arhivată
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">{groupLabels[item.group]}</TableCell>
                  {!readOnly && (
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        data-testid="instructions-remove"
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
        )}
      </CardContent>
      <PickInstructionsDialog
        clientId={clientId}
        position={position}
        userId={userId}
        applied={items}
        open={picking}
        onClose={() => setPicking(false)}
        onApplied={refresh}
      />
      <CopyInstructionsDialog
        clientId={clientId}
        position={position}
        userId={userId}
        open={copying}
        onClose={() => setCopying(false)}
        onCopied={refresh}
      />
    </Card>
  );
}

function PickInstructionsDialog({
  clientId,
  position,
  userId,
  applied,
  open,
  onClose,
  onApplied,
}: {
  clientId: string;
  position: JobPosition;
  userId: string;
  applied: AppliedInstruction[];
  open: boolean;
  onClose: () => void;
  onApplied: () => Promise<unknown>;
}) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const params = { archived: 'false' as const };
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
        data: { moduleIds: [...selected] },
      });
      await onApplied();
      toast.success(
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
      <DialogContent data-testid="instructions-pick-dialog" className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Instrucțiunile postului „{position.name}”</DialogTitle>
          <DialogDescription>
            Bifează instrucțiunile din bibliotecă care privesc postul. Instrucțiunile proprii ale
            clientului le anexează, iar tematica de instruire le citează.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4 grid gap-4">
          {error && (
            <Notice variant="destructive" data-testid="instructions-pick-error">
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
              data-testid="instructions-pick-empty"
              action={
                <Button asChild variant="outline">
                  <Link to="/instructions">Deschide biblioteca</Link>
                </Button>
              }
            >
              Biblioteca este goală. Încarcă sau scrie instrucțiunile organizației, apoi alege-le
              aici.
            </Notice>
          ) : (
            <>
              <Input
                data-testid="instructions-pick-search"
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
                          data-testid="instructions-pick-option"
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
            data-testid="instructions-pick-save"
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
  clientId,
  position,
  userId,
  open,
  onClose,
  onCopied,
}: {
  clientId: string;
  position: JobPosition;
  userId: string;
  open: boolean;
  onClose: () => void;
  onCopied: () => Promise<unknown>;
}) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const positions = useListJobPositions(clientId, {
    request: apiRequest,
    query: { queryKey: [...getListJobPositionsQueryKey(clientId), userId], enabled: open },
  });
  const copy = useCopyPositionInstructions({ request: apiRequest });
  const [source, setSource] = useState('');
  const [error, setError] = useState<string | null>(null);
  const sources = (positions.data?.items ?? []).filter(
    (candidate) => candidate.id !== position.id && candidate.instructionCount > 0
  );

  async function copyModules() {
    setError(null);
    try {
      const result = await copy.mutateAsync({
        clientId,
        jobPositionId: position.id,
        data: { fromJobPositionId: source },
      });
      await onCopied();
      toast.success(`Postul aplică acum ${moduleCountLabel(result.items.length).toLowerCase()}.`);
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
      <DialogContent data-testid="instructions-copy-dialog" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Copiază instrucțiunile de la alt post</DialogTitle>
          <DialogDescription>
            Instrucțiunile celuilalt post se adaugă la ale acestuia; cele deja aplicate rămân.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4 grid gap-4">
          {error && <Notice variant="destructive">{error}</Notice>}
          {positions.isSuccess && sources.length === 0 ? (
            <Notice variant="info" data-testid="instructions-copy-empty">
              Niciun alt post al clientului nu aplică instrucțiuni încă.
            </Notice>
          ) : (
            <Field id="instructions-copy-source" label="Postul de la care copiezi" mark="required">
              <NativeSelect
                id="instructions-copy-source"
                data-testid="instructions-copy-source"
                className="w-full"
                value={source}
                disabled={copy.isPending || positions.isPending}
                onChange={(event) => setSource(event.target.value)}
              >
                <NativeSelectOption value="">Alege un post…</NativeSelectOption>
                {sources.map((candidate) => (
                  <NativeSelectOption key={candidate.id} value={candidate.id}>
                    {`${candidate.name} (${moduleCountLabel(candidate.instructionCount).toLowerCase()})`}
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
            data-testid="instructions-copy-confirm"
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
