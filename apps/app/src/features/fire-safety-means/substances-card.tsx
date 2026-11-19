import { type FireSubstancesState, missingSubstanceEssentials } from '@ssm-usor/contracts';
import { Badge } from '@ssm-usor/ui/components/badge';
import { Button } from '@ssm-usor/ui/components/button';
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
import { ExternalLink, Plus } from 'lucide-react';
import { useState } from 'react';

import {
  getListFireSubstancesQueryKey,
  useDeleteFireSubstance,
  useListFireSubstances,
  useUpdateFireSubstancesState,
} from '@/api/generated/api';
import { apiErrorReason, ApiHttpError } from '@/api/http';
import { useApi } from '@/api/use-api';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { rowClickProps } from '@/components/data-table/row-click';
import { Notice } from '@/components/notice';
import { RowActionsMenu } from '@/components/row-actions-menu';
import { SectionCard } from '@/components/section-card';
import { warningBadge } from '@/features/documents/pack-styles';
import { DecisionBadge } from '@/features/job-positions/decision-badge';
import { useFocusRequest } from '@/features/missing-data/focus';
import { useSavedToast } from '@/features/missing-data/saved-toast';
import { commonFailure } from '@/lib/api-errors';

import { SubstanceDialog, type SubstanceEditing } from './substance-dialog';
import {
  type FireSubstance,
  missingEssentialsLabel,
  substanceAddId,
  substanceCountLabel,
  substancesCardId,
  substancesChoiceId,
  substancesChoices,
  unfilledDetailCount,
} from './substances-schema';

const failureMessage = (cause: unknown, fallback: string) => {
  const common = commonFailure(cause);
  if (common) return common;
  const status = cause instanceof ApiHttpError ? cause.status : null;
  const reason = apiErrorReason(cause);
  if (status === 409 && reason === 'substances_listed') {
    return 'Clientul are substanțe în listă; șterge-le înainte să declari că nu utilizează niciuna.';
  }
  if (status === 409 && reason === 'client_is_lead') {
    return 'O ofertă nu are încă date SU.';
  }
  if (status === 409) return 'Clientul este arhivat; datele lui nu se mai schimbă.';
  if (status === 404) return 'Substanța nu mai există la acest client; lista a fost reîncărcată.';
  return fallback;
};

const isIncomplete = (substance: FireSubstance) => missingSubstanceEssentials(substance).length > 0;

const stateBadge = (state: FireSubstancesState, count: number) =>
  state === 'undecided'
    ? 'Nedecis'
    : state === 'none'
      ? 'Nu se utilizează'
      : substanceCountLabel(count);

// The general norms are their own document on the portal, apart from the order that approves them
// (80730, the act the legislation tracker watches); the anchor is the portal's own for art. 18.
const listArticlePage = 'https://legislatie.just.ro/Public/DetaliiDocument/80731#id_artA18';

export function SubstancesCard({
  clientId,
  readOnly,
  focus,
}: {
  clientId: string;
  readOnly: boolean;
  focus: boolean;
}) {
  const { request, queryClient, key } = useApi();
  const savedToast = useSavedToast();
  const substances = useListFireSubstances(clientId, {
    request,
    query: { queryKey: key(getListFireSubstancesQueryKey(clientId)) },
  });
  const decide = useUpdateFireSubstancesState({ request });
  const remove = useDeleteFireSubstance({ request });
  const [editing, setEditing] = useState<SubstanceEditing>(null);
  const [deleting, setDeleting] = useState<FireSubstance | null>(null);
  const [error, setError] = useState<string | null>(null);

  const state = substances.data?.state;
  const items = substances.data?.items ?? [];
  const listedEmpty = state === 'listed' && items.length === 0;
  const incomplete = state === 'listed' ? items.filter(isIncomplete) : [];
  const firstIncomplete = incomplete[0];
  useFocusRequest(focus, {
    ready: substances.isSuccess,
    anchor: () =>
      document.getElementById(listedEmpty && !readOnly ? substanceAddId : substancesCardId),
    open: readOnly
      ? undefined
      : listedEmpty
        ? () => setEditing('new')
        : firstIncomplete
          ? () => setEditing(firstIncomplete)
          : undefined,
    field: readOnly
      ? undefined
      : listedEmpty
        ? 'fire-substance-name'
        : firstIncomplete
          ? `fire-substance-${missingSubstanceEssentials(firstIncomplete)[0]!}`
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
      description={
        <>
          Lista substanțelor periculoase se cere fiecărui client, oricâți lucrători are (
          <a
            href={listArticlePage}
            target="_blank"
            rel="noreferrer"
            data-testid="fire-substances-law"
            className="inline-flex items-center gap-1 underline underline-offset-4"
          >
            OMAI 163/2007
            <ExternalLink className="size-3.5" aria-label="(se deschide pe Portalul Legislativ)" />
          </a>
          , {'art.\u00a018\u00a0lit.\u00a0p)'} și{' '}
          {'art.\u00a020\u00a0alin.\u00a0(3)\u00a0lit.\u00a0g)'}). Produsele de curățenie,
          carburanții, vopselele, diluanții și buteliile de gaz sunt substanțe clasificate.
        </>
      }
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
                : 'Documentele SU nu se pot genera până nu alegi una dintre variante.'}
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
                    variant="secondary"
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
                  Nicio substanță încă. Documentele SU cer cel puțin una când clientul utilizează
                  substanțe periculoase.
                </p>
              ) : (
                <Table>
                  <TableHeader>
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
                  <TableBody>
                    {items.map((substance) => {
                      const missing = unfilledDetailCount(substance);
                      const missingEssentials = missingEssentialsLabel(substance);
                      return (
                        <TableRow
                          key={substance.id}
                          data-testid="fire-substance-row"
                          {...rowClickProps(readOnly ? undefined : () => setEditing(substance))}
                          className={cn(!readOnly && 'cursor-pointer')}
                        >
                          <TableCell className="min-w-40 whitespace-normal">
                            <span className="grid gap-0.5">
                              <span className="flex flex-wrap items-center gap-2">
                                <span className="font-medium">{substance.name}</span>
                                {missingEssentials && (
                                  <Badge
                                    variant="outline"
                                    className={warningBadge}
                                    data-testid="fire-substance-incomplete"
                                  >
                                    Incompletă
                                  </Badge>
                                )}
                              </span>
                              {substance.classification && (
                                <span className="text-xs text-muted-foreground">
                                  {substance.classification}
                                </span>
                              )}
                              {missingEssentials && (
                                <span
                                  data-testid="fire-substance-missing"
                                  className="text-xs text-muted-foreground"
                                >
                                  {missingEssentials}
                                </span>
                              )}
                            </span>
                          </TableCell>
                          <TableCell className="whitespace-normal">
                            {substance.quantity ?? '—'}
                          </TableCell>
                          <TableCell
                            data-testid="fire-substance-details"
                            className={cn(
                              'min-w-40 whitespace-normal',
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
                            <TableCell>
                              <RowActionsMenu
                                name={substance.name}
                                testId="fire-substance"
                                onEdit={() => setEditing(substance)}
                                onDelete={() => setDeleting(substance)}
                              />
                            </TableCell>
                          )}
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              )}
              {incomplete.length > 0 && (
                <p
                  data-testid="fire-substances-incomplete"
                  className="text-sm text-muted-foreground"
                >
                  {readOnly
                    ? 'Clasificarea sau cantitatea unor substanțe nu este încă cunoscută.'
                    : 'Documentele SU nu se pot genera până nu completezi clasificarea și cantitatea substanțelor marcate „Incompletă”.'}
                </p>
              )}
            </section>
          )}
        </>
      )}
      <SubstanceDialog clientId={clientId} editing={editing} onClose={() => setEditing(null)} />
      {deleting && (
        <ConfirmDialog
          open
          busy={remove.isPending}
          testId="fire-substance-delete"
          title="Ștergi substanța?"
          confirmLabel="Șterge"
          pendingLabel="Se șterge…"
          onConfirm={() => void confirmDelete(deleting)}
          onClose={() => setDeleting(null)}
        >
          <span className="font-medium text-foreground">{deleting.name}</span> nu va mai apărea în
          documentele SU generate de acum înainte.
          {items.length === 1 &&
            ' Este singura din listă: fără ea, documentele SU nu se pot genera până nu adaugi alta sau declari că nu se utilizează substanțe periculoase.'}
        </ConfirmDialog>
      )}
    </SectionCard>
  );
}
