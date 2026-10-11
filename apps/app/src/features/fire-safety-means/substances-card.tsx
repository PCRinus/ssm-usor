import type { FireSubstancesState } from '@ssm-usor/contracts';
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
import { useState } from 'react';

import {
  type ApiErrorResponse,
  getListFireSubstancesQueryKey,
  useDeleteFireSubstance,
  useListFireSubstances,
  useUpdateFireSubstancesState,
} from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import { rowClickProps } from '@/components/data-table/row-click';
import { Notice } from '@/components/notice';
import { SectionCard } from '@/components/section-card';
import { DecisionBadge } from '@/features/job-positions/decision-badge';
import { useFocusRequest } from '@/features/missing-data/focus';
import { useSavedToast } from '@/features/missing-data/saved-toast';

import { SubstanceDialog, type SubstanceEditing } from './substance-dialog';
import {
  type FireSubstance,
  substanceAddId,
  substanceCountLabel,
  substancesCardId,
  substancesChoiceId,
  substancesChoices,
  unfilledDetailCount,
} from './substances-schema';

const failureMessage = (cause: unknown, fallback: string) => {
  const status = cause instanceof ApiHttpError ? cause.status : null;
  const reason =
    cause instanceof ApiHttpError ? (cause.body as Partial<ApiErrorResponse>).reason : undefined;
  if (status === 409 && reason === 'substances_listed') {
    return 'Clientul are substanțe în listă; șterge-le înainte să declari că nu utilizează niciuna.';
  }
  if (status === 409 && reason === 'client_is_lead') {
    return 'Un client potențial nu are încă date PSI.';
  }
  if (status === 409) return 'Clientul este arhivat; datele lui nu se mai schimbă.';
  if (status === 404) return 'Substanța nu mai există la acest client; lista a fost reîncărcată.';
  return fallback;
};

const stateBadge = (state: FireSubstancesState, count: number) =>
  state === 'undecided'
    ? 'Nedecis'
    : state === 'none'
      ? 'Nu se utilizează'
      : substanceCountLabel(count);

export function SubstancesCard({
  clientId,
  userId,
  readOnly,
  focus,
}: {
  clientId: string;
  userId: string;
  readOnly: boolean;
  focus: boolean;
}) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const savedToast = useSavedToast();
  const substances = useListFireSubstances(clientId, {
    request: apiRequest,
    query: { queryKey: [...getListFireSubstancesQueryKey(clientId), userId] },
  });
  const decide = useUpdateFireSubstancesState({ request: apiRequest });
  const remove = useDeleteFireSubstance({ request: apiRequest });
  const [editing, setEditing] = useState<SubstanceEditing>(null);
  const [deleting, setDeleting] = useState<FireSubstance | null>(null);
  const [error, setError] = useState<string | null>(null);

  const state = substances.data?.state;
  const items = substances.data?.items ?? [];
  const listedEmpty = state === 'listed' && items.length === 0;
  useFocusRequest(focus, {
    ready: substances.isSuccess,
    anchor: () =>
      document.getElementById(listedEmpty && !readOnly ? substanceAddId : substancesCardId),
    open: readOnly || !listedEmpty ? undefined : () => setEditing('new'),
    field: readOnly
      ? undefined
      : listedEmpty
        ? 'fire-substance-name'
        : state === 'undecided'
          ? `${substancesChoiceId}-none`
          : undefined,
  });

  const refresh = () =>
    queryClient.invalidateQueries({ queryKey: getListFireSubstancesQueryKey(clientId) });

  async function choose(next: Exclude<FireSubstancesState, 'undecided'>) {
    setError(null);
    try {
      await decide.mutateAsync({ clientId, data: { state: next } });
      savedToast(
        next === 'none'
          ? 'Am notat că clientul nu utilizează substanțe periculoase.'
          : 'Am notat că clientul utilizează substanțe periculoase.'
      );
    } catch (cause) {
      setError(
        failureMessage(
          cause,
          'Nu am putut salva alegerea. Verifică conexiunea și încearcă din nou.'
        )
      );
    }
    await refresh();
  }

  async function confirmDelete(substance: FireSubstance) {
    setError(null);
    try {
      await remove.mutateAsync({ clientId, substanceId: substance.id });
      toast.success(`Substanța „${substance.name}” a fost ștearsă.`);
    } catch (cause) {
      setError(
        failureMessage(cause, 'Nu am putut șterge. Verifică conexiunea și încearcă din nou.')
      );
    }
    setDeleting(null);
    await refresh();
  }

  return (
    <SectionCard
      id={substancesCardId}
      data-testid="fire-substances-card"
      title={
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          Substanțe periculoase
          {state && (
            <DecisionBadge
              decision={state === 'undecided' ? null : state === 'listed'}
              data-testid="fire-substances-state"
            >
              {stateBadge(state, items.length)}
            </DecisionBadge>
          )}
        </span>
      }
      description="Lista substanțelor periculoase (OMAI 163/2007) se cere fiecărui client, oricâți angajați are. Produsele de curățenie, carburanții, vopselele, diluanții și buteliile de gaz sunt substanțe clasificate."
    >
      {error && (
        <Notice variant="destructive" data-testid="fire-substances-error">
          {error}
        </Notice>
      )}
      {substances.isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : substances.isError ? (
        <Notice
          variant="destructive"
          action={
            <Button
              variant="outline"
              disabled={substances.isFetching}
              onClick={() => void substances.refetch()}
            >
              Încearcă din nou
            </Button>
          }
        >
          Nu am putut încărca substanțele periculoase.
        </Notice>
      ) : (
        <>
          <fieldset className="grid gap-2" disabled={readOnly || decide.isPending}>
            <legend className="sr-only">Utilizează clientul substanțe periculoase?</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {substancesChoices.map((choice) => {
                const blocked = choice.state === 'none' && items.length > 0;
                return (
                  <label
                    key={choice.state}
                    data-testid={`fire-substances-choice-${choice.state}`}
                    className={cn(
                      'flex items-start gap-3 rounded-lg border p-3 text-sm has-checked:border-primary has-checked:bg-muted/50',
                      blocked || readOnly ? 'cursor-not-allowed opacity-70' : 'cursor-pointer'
                    )}
                  >
                    <input
                      id={`${substancesChoiceId}-${choice.state}`}
                      type="radio"
                      name={substancesChoiceId}
                      value={choice.state}
                      checked={state === choice.state}
                      disabled={blocked}
                      onChange={() => void choose(choice.state)}
                      className="mt-0.5 size-4 shrink-0 accent-primary"
                    />
                    <span className="font-medium">{choice.label}</span>
                  </label>
                );
              })}
            </div>
            {items.length > 0 && !readOnly && (
              <p className="text-xs text-muted-foreground">
                Ca să declari că nu se utilizează, șterge întâi substanțele din listă.
              </p>
            )}
          </fieldset>

          {state === 'undecided' && (
            <p data-testid="fire-substances-undecided" className="text-sm text-muted-foreground">
              {readOnly
                ? 'Nu s-a stabilit dacă clientul utilizează substanțe periculoase.'
                : 'Documentele PSI nu se pot genera până nu alegi una dintre variante.'}
            </p>
          )}
          {state === 'none' && (
            <Notice variant="info" data-testid="fire-substances-none">
              Lista substanțelor periculoase va declara că unitatea nu utilizează substanțe
              periculoase în activitatea sa, semnată de reprezentantul legal.
            </Notice>
          )}
          {state === 'listed' && (
            <section className="grid gap-3 border-t pt-5" aria-label="Lista substanțelor">
              <div className="flex min-h-8 flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <h3 className="font-semibold">Lista substanțelor</h3>
                {!readOnly && (
                  <Button
                    id={substanceAddId}
                    variant="tonal"
                    size="sm"
                    data-testid="fire-substance-add"
                    onClick={() => setEditing('new')}
                  >
                    <Plus aria-hidden="true" />
                    Adaugă
                  </Button>
                )}
              </div>
              {items.length === 0 ? (
                <p data-testid="fire-substances-empty" className="text-sm text-muted-foreground">
                  Nicio substanță încă. Documentele PSI cer cel puțin una când clientul utilizează
                  substanțe periculoase.
                </p>
              ) : (
                <Table className="max-sm:block">
                  <TableHeader className="max-sm:sr-only">
                    <TableRow>
                      <TableHead className="w-[46%]">Substanța</TableHead>
                      <TableHead className="w-[24%]">Cantitatea</TableHead>
                      <TableHead>Fișa cu date de securitate</TableHead>
                      {!readOnly && (
                        <TableHead className="w-12">
                          <span className="sr-only">Acțiuni</span>
                        </TableHead>
                      )}
                    </TableRow>
                  </TableHeader>
                  <TableBody className="max-sm:block">
                    {items.map((substance) => {
                      const missing = unfilledDetailCount(substance);
                      return (
                        <TableRow
                          key={substance.id}
                          data-testid="fire-substance-row"
                          {...rowClickProps(readOnly ? undefined : () => setEditing(substance))}
                          className={cn(
                            'max-sm:grid max-sm:grid-cols-[minmax(0,1fr)_auto] max-sm:gap-x-2 max-sm:gap-y-1 max-sm:py-3',
                            !readOnly && 'cursor-pointer'
                          )}
                        >
                          <TableCell className="whitespace-normal max-sm:col-start-1 max-sm:p-0">
                            <span className="grid gap-0.5">
                              <span className="font-medium">{substance.name}</span>
                              <span className="text-xs text-muted-foreground">
                                {substance.classification}
                              </span>
                            </span>
                          </TableCell>
                          <TableCell className="whitespace-normal max-sm:col-start-1 max-sm:p-0">
                            {substance.quantity}
                          </TableCell>
                          <TableCell
                            data-testid="fire-substance-details"
                            className={cn(
                              'whitespace-normal max-sm:col-start-1 max-sm:p-0',
                              missing > 0 ? 'text-muted-foreground' : undefined
                            )}
                          >
                            {missing === 0
                              ? 'Completă'
                              : missing === 1
                                ? '1 câmp de completat în document'
                                : `${missing} câmpuri de completat în document`}
                          </TableCell>
                          {!readOnly && (
                            <TableCell className="max-sm:col-start-2 max-sm:row-span-3 max-sm:row-start-1 max-sm:p-0">
                              <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    data-testid="fire-substance-actions"
                                    aria-label={`Acțiuni pentru ${substance.name}`}
                                  >
                                    <MoreHorizontal aria-hidden="true" />
                                  </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                  <DropdownMenuItem
                                    data-testid="fire-substance-edit"
                                    onSelect={() => setEditing(substance)}
                                  >
                                    Modifică
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    data-testid="fire-substance-delete"
                                    variant="destructive"
                                    onSelect={() => setDeleting(substance)}
                                  >
                                    Șterge
                                  </DropdownMenuItem>
                                </DropdownMenuContent>
                              </DropdownMenu>
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
            </section>
          )}
        </>
      )}
      <SubstanceDialog clientId={clientId} editing={editing} onClose={() => setEditing(null)} />
      <Dialog
        open={deleting !== null}
        onOpenChange={(open) => !open && !remove.isPending && setDeleting(null)}
      >
        {deleting && (
          <DialogContent data-testid="fire-substance-delete-dialog" className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Ștergi substanța?</DialogTitle>
              <DialogDescription>
                <span className="font-medium text-foreground">{deleting.name}</span> nu va mai
                apărea în documentele PSI generate de acum înainte.
                {items.length === 1 &&
                  ' Este singura din listă: fără ea, documentele PSI nu se pot genera până nu adaugi alta sau declari că nu se utilizează substanțe periculoase.'}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="mt-2">
              <Button variant="ghost" disabled={remove.isPending} onClick={() => setDeleting(null)}>
                Renunță
              </Button>
              <Button
                variant="destructive"
                data-testid="fire-substance-delete-confirm"
                disabled={remove.isPending}
                onClick={() => void confirmDelete(deleting)}
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
