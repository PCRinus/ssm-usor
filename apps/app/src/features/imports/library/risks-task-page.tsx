import { foldText, importCredits, importErrorReasons } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { toast } from '@ssm-usor/ui/lib/toast';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useRouteContext } from '@tanstack/react-router';
import { ArrowLeft, ListX, LoaderCircle, RotateCcw } from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';

import {
  type ApiErrorResponse,
  confirmImportLibraryPart,
  getListImportLibraryPartsQueryKey,
  getListImportsQueryKey,
  type ImportDetail,
  retryImportLibraryPart,
} from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import { HelpLink } from '@/components/help-link';
import { Notice } from '@/components/notice';
import { scrollAndFocus } from '@/features/missing-data/focus';
import type { FactorStore } from '@/features/risk-evaluations/factor-store';
import type { EditableFactor } from '@/features/risk-evaluations/risk-evaluation-schema';
import { RiskFactorDialog } from '@/features/risk-evaluations/risk-factor-dialog';

import { creditsLabel } from '../import-credits';
import { importErrorMessage } from '../import-format';
import { ReportImportButton } from '../report-import-button';
import type { LabelledSource } from '../review-model';
import { SourceButton, Tag } from '../review-parts';
import { SourceDialog, type SourceRequest } from '../source-dialog';
import { SourcePrefetchContext, useSourcePrefetch } from '../source-query';
import { PartStatusTag } from './library-group';
import {
  isExpired,
  isReviewable,
  libraryDay,
  type LibraryPost,
  pickablePosts,
  postsByReference,
} from './library-model';
import { ReviewNotices } from './library-task-page';
import { PostsPickerDialog, type PostsRequest } from './posts-picker-dialog';
import { RiskConfirmBar } from './risk-confirm-bar';
import { PlanRowText } from './risk-plan-rows';
import { RiskSheetCard } from './risk-sheet-card';
import {
  confirmSentence,
  defaultSheetPosts,
  evaluationsLabel,
  existingByReference,
  factorChangeFrom,
  factorsLabel,
  type FactorState,
  incompleteFactors,
  incompleteText,
  isRisksLibraryPart,
  leftSentence,
  looseCells,
  pendingOf,
  placedPlanRows,
  planFieldsLine,
  type RisksPart,
  riskSummary,
  rowQuote,
  sheetsLabel,
  sheetState,
  takenNamesText,
  takenSheets,
  unplacedPlanRows,
  withField,
  withIncluded,
} from './risks-model';
import { useLibraryParts, useRiskReview } from './use-library-parts';

export function RisksTaskPage({ detail }: { detail: ImportDetail }) {
  const query = useLibraryParts(detail.id);
  if (query.isPending) {
    return (
      <div className="grid gap-4" aria-busy="true" data-testid="library-task-loading">
        <div className="h-9 w-48 animate-pulse rounded-md bg-muted" />
        <div className="h-40 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }
  const part = query.data?.parts.find(isRisksLibraryPart);
  const back = (
    <Button asChild variant="outline">
      <Link
        to="/clienti/import/$importId"
        params={{ importId: detail.id }}
        data-testid="library-back-to-import"
      >
        <ArrowLeft aria-hidden="true" />
        Înapoi la raport
      </Link>
    </Button>
  );
  return (
    <div className="grid gap-6">
      {query.isError ? (
        <Notice
          variant="destructive"
          data-testid="library-task-error"
          action={
            <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
              Încearcă din nou
            </Button>
          }
        >
          Nu am putut încărca evaluările de risc. Încearcă din nou.
        </Notice>
      ) : !part ? (
        <Notice variant="info" data-testid="library-task-missing">
          În documentația importată nu am găsit evaluări de risc.
        </Notice>
      ) : (
        <TaskContent
          key={`${part.part}-${part.attempt}`}
          detail={detail}
          part={part}
          posts={query.data?.posts ?? []}
          back={back}
        />
      )}
      {(query.isError || !part) && back}
    </div>
  );
}

const confirmReasons: Record<string, string> = {
  [importErrorReasons.clientUnconfirmed]:
    'Confirmă întâi clientul: evaluările de risc se aplică la posturile lui.',
  [importErrorReasons.partExpired]:
    'Propunerea a expirat la 14 zile după crearea clientului, așa că nu mai poate fi confirmată.',
  [importErrorReasons.partNotReady]:
    'Evaluările de risc au fost confirmate sau citite din nou între timp. Reîncarcă pagina.',
  [importErrorReasons.changed]:
    'Altcineva a modificat evaluările de risc între timp. Reîncarcă pagina ca să vezi ce s-a schimbat.',
  [importErrorReasons.outdated]:
    'Clientul sau biblioteca s-au schimbat între timp: un post sau o evaluare nu mai există. Reîncarcă pagina și alege din nou.',
  [importErrorReasons.refused]:
    'O valoare din fișe nu a fost primită. Verifică factorii și încearcă din nou.',
};

function doneToast(result: {
  createdProfileIds: string[];
  evaluationIds: string[];
  factors: number;
}) {
  const parts = [
    ...(result.createdProfileIds.length > 0
      ? [
          `am adăugat ${result.createdProfileIds.length === 1 ? 'o evaluare' : evaluationsLabel(result.createdProfileIds.length)} în bibliotecă`,
        ]
      : []),
    ...(result.factors > 0
      ? [
          `am scris ${result.factors === 1 ? 'un factor' : factorsLabel(result.factors)} pe ${result.evaluationIds.length === 1 ? 'o fișă a clientului' : `${sheetsLabel(result.evaluationIds.length)} ale clientului`}`,
        ]
      : []),
  ];
  if (parts.length === 0) return 'Ai confirmat evaluările de risc.';
  const text = parts.join(' și ');
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

type Editing = { sheet: string; factor: FactorState } | null;

function TaskContent({
  detail,
  part,
  posts,
  back,
}: {
  detail: ImportDetail;
  part: RisksPart;
  posts: LibraryPost[];
  back: ReactNode;
}) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const review = useRiskReview(detail.id, part);
  const prefetchSource = useSourcePrefetch(detail.id);
  const root = useRef<HTMLDivElement>(null);
  const stopAttention = useRef<() => void>(() => {});
  useEffect(() => () => stopAttention.current(), []);
  const [source, setSource] = useState<SourceRequest | null>(null);
  const [postsRequest, setPostsRequest] = useState<PostsRequest | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [takenNames, setTakenNames] = useState<Set<string>>(new Set());
  const [refused, setRefused] = useState<Map<string, Set<string>>>(new Map());
  const [retrying, setRetrying] = useState(false);

  const clientConfirmed = detail.status === 'confirmed';
  const expired = isExpired(part);
  const proposal = part.proposal;
  const reviewable = isReviewable(part.status) && proposal !== null && !expired;
  const readOnly = !reviewable || Boolean(review.closed);
  const name = detail.client?.legalName ?? detail.companyName ?? 'clientul importat';
  const sheets = useMemo(() => proposal?.sheets ?? [], [proposal]);
  const pickable = pickablePosts(posts, clientConfirmed);
  const postsById = postsByReference(pickable);
  const existing = useMemo(
    () => existingByReference(sheets, part.postReferences),
    [sheets, part.postReferences]
  );
  const planRows = useMemo(() => proposal?.unmatchedPlanRows ?? [], [proposal]);
  const planFactors = useMemo(() => placedPlanRows(planRows, sheets), [planRows, sheets]);
  const states = sheets.map((sheet) =>
    sheetState(sheet, review.changes.sheets[sheet.key], {
      postReferences: part.postReferences,
      postsById,
      existingByReference: existing,
      existingFactors: part.existingFactors,
      planFactors,
    })
  );
  const open = readOnly
    ? 0
    : states.filter((state) => pendingOf(state, takenNames.has(state.sheet.key)).length > 0).length;
  const summary = riskSummary(states);
  const decisions = states.map((state) => ({
    state,
    pending: pendingOf(state, takenNames.has(state.sheet.key)),
  }));
  const choices = decisions.filter(({ pending }) => pending.some((value) => value !== 'name'));
  const names = decisions.filter(({ pending }) => pending.includes('name'));
  const choicesCount = decisions.reduce(
    (count, { pending }) => count + pending.filter((value) => value !== 'name').length,
    0
  );
  const checked = states.filter((state) => state.toCheck > 0);
  const toCheck = checked.reduce((count, state) => count + state.toCheck, 0);
  const taking = states.filter((state) => state.written > 0);
  const takingFactors = taking.reduce((count, state) => count + state.written, 0);

  function pointToSheet(key: string) {
    const element = [
      ...(root.current?.querySelectorAll<HTMLElement>('[data-testid="risk-import-sheet"]') ?? []),
    ].find((each) => each.dataset.key === key);
    if (!element) return;
    stopAttention.current();
    stopAttention.current = scrollAndFocus(element);
  }
  const sheetByKey = new Map(sheets.map((sheet) => [sheet.key, sheet]));
  const loose = {
    plan: unplacedPlanRows(planRows, sheets),
    measures: proposal?.unmatchedMeasureRows ?? [],
    unplaced: proposal?.unplacedRows ?? [],
  };
  const looseCount = loose.plan.length + loose.measures.length + loose.unplaced.length;

  const forgetRefusal = (sheet: string, factor?: string) =>
    setRefused((current) => {
      if (!current.has(sheet)) return current;
      const next = new Map(current);
      if (factor === undefined) next.delete(sheet);
      else {
        const factors = new Set(next.get(sheet));
        factors.delete(factor);
        next.set(sheet, factors);
      }
      return next;
    });

  const factorStore: FactorStore = {
    save: async (_factorId, data) => {
      if (!editing) return;
      const { sheet, factor } = editing;
      forgetRefusal(sheet, factor.factor.key);
      review.setFactor(sheet, factor.factor.key, () => factorChangeFrom(factor.factor, data));
    },
    remove: async () => {},
    refresh: async () => {},
    failure: (_cause, fallback) => fallback,
  };

  const editable: EditableFactor | null = editing && {
    id: editing.factor.factor.key,
    component: editing.factor.component,
    group: editing.factor.group,
    description: editing.factor.description,
    gravityClass: editing.factor.gravityClass,
    probabilityClass: editing.factor.probabilityClass,
    measures: editing.factor.measures,
    actions: editing.factor.actions,
    deadline: editing.factor.deadline,
    responsiblePerson: editing.factor.responsiblePerson,
    observations: editing.factor.observations,
  };

  async function refresh() {
    await queryClient.invalidateQueries({
      queryKey: getListImportLibraryPartsQueryKey(detail.id),
    });
  }

  async function confirm() {
    setConfirming(true);
    setConfirmError(null);
    try {
      const saved = await review.flush();
      if ('error' in saved) {
        setConfirmError(saved.error);
        return;
      }
      const result = await confirmImportLibraryPart(
        detail.id,
        part.part,
        { version: saved.version },
        apiRequest
      );
      await Promise.all([
        refresh(),
        queryClient.invalidateQueries({
          predicate: ({ queryKey }) => String(queryKey[0]).startsWith('/evaluation-profiles'),
        }),
        queryClient.invalidateQueries({ queryKey: getListImportsQueryKey() }),
        detail.client &&
          queryClient.invalidateQueries({
            predicate: ({ queryKey }) =>
              String(queryKey[0]).startsWith(`/clients/${detail.client!.id}`),
          }),
      ]);
      toast.success(
        'createdProfileIds' in result ? doneToast(result) : 'Ai confirmat evaluările de risc.'
      );
      await navigate({ to: '/clienti/import/$importId', params: { importId: detail.id } });
    } catch (cause) {
      const body =
        cause instanceof ApiHttpError
          ? (cause.body as Partial<ApiErrorResponse> | undefined)
          : undefined;
      const reason = body?.reason;
      const named = (keys: Iterable<string>) =>
        [...keys].map((key) => sheetByKey.get(key)?.name ?? key);
      if (reason === importErrorReasons.nameTaken) {
        const taken = takenSheets(body?.issues ?? []);
        setTakenNames(taken);
        setConfirmError(takenNamesText(named(taken)));
      } else if (reason === importErrorReasons.incomplete) {
        const incomplete = incompleteFactors(body?.issues ?? []);
        setRefused(incomplete);
        setConfirmError(incompleteText(named(incomplete.keys())));
      } else {
        setConfirmError(
          reason && Object.hasOwn(confirmReasons, reason)
            ? confirmReasons[reason]!
            : importErrorMessage(
                cause,
                'Nu am putut confirma evaluările de risc. Încearcă din nou.'
              )
        );
      }
    } finally {
      setConfirming(false);
    }
  }

  async function retry() {
    setRetrying(true);
    try {
      await retryImportLibraryPart(detail.id, part.part, apiRequest);
      review.forget();
      await refresh();
    } catch (cause) {
      toast.error(importErrorMessage(cause, 'Nu am putut porni citirea. Încearcă din nou.'));
    } finally {
      setRetrying(false);
    }
  }

  return (
    <SourcePrefetchContext value={prefetchSource}>
      <div ref={root} className="grid gap-6" data-testid="library-task" data-part={part.part}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="grid max-w-3xl gap-1">
            <span className="text-sm text-muted-foreground">Din import</span>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="text-3xl font-semibold tracking-tight">Evaluări de risc</h1>
              <PartStatusTag part={part} />
              <HelpLink topic="import.evaluari-de-risc" label="Ajutor: evaluările din import" />
            </div>
            <p className="text-sm text-muted-foreground">
              Evaluările de risc pentru {name}. Clasele rămân cele din document; diferențele față de
              metodă sunt marcate la factori.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <ReportImportButton importId={detail.id} part={part.part} />
          </div>
        </div>

        <StateNotices
          part={part}
          expired={expired}
          retrying={retrying}
          onRetry={() => void retry()}
        />
        {reviewable && <ReviewNotices review={review} />}

        {proposal && part.status !== 'failed' && part.status !== 'reading' && (
          <>
            <section aria-labelledby="risk-sheets-heading" className="grid gap-3">
              <div className="grid gap-1">
                <h2 id="risk-sheets-heading" className="text-lg font-semibold">
                  Ce verifici înainte să confirmi
                  <span className="ml-2 text-sm font-normal text-muted-foreground tabular-nums">
                    {sheets.length === 1 ? 'o evaluare' : evaluationsLabel(sheets.length)}
                  </span>
                </h2>
                {!readOnly && (
                  <p className="text-sm text-muted-foreground" data-testid="risk-import-left">
                    {leftSentence(states, open)}
                  </p>
                )}
              </div>
              {states.map((state) => (
                <RiskSheetCard
                  key={state.sheet.key}
                  state={state}
                  original={
                    state.sheet.copyOf ? (sheetByKey.get(state.sheet.copyOf) ?? null) : null
                  }
                  readOnly={readOnly}
                  nameTaken={takenNames.has(state.sheet.key)}
                  refused={refused.get(state.sheet.key) ?? new Set()}
                  libraryNames={part.libraryNames}
                  packNames={states
                    .filter((other) => other !== state && other.createsEntry)
                    .map((other) => other.libraryName)}
                  onSetIncluded={(factors, included) => {
                    for (const factor of factors) forgetRefusal(state.sheet.key, factor.factor.key);
                    review.setSheet(state.sheet.key, (current) =>
                      withIncluded(current, factors, included)
                    );
                  }}
                  onSheet={(change) => {
                    setTakenNames((current) => {
                      if (!current.has(state.sheet.key)) return current;
                      const next = new Set(current);
                      next.delete(state.sheet.key);
                      return next;
                    });
                    review.setSheet(state.sheet.key, change);
                  }}
                  onToggleFactor={(factor, included) => {
                    if (included && !factor.complete) {
                      setEditing({ sheet: state.sheet.key, factor });
                      return;
                    }
                    forgetRefusal(state.sheet.key, factor.factor.key);
                    review.setFactor(state.sheet.key, factor.factor.key, (current) =>
                      withField(
                        current,
                        'included',
                        included === factor.factor.included ? undefined : included
                      )
                    );
                  }}
                  onEditFactor={(factor) => setEditing({ sheet: state.sheet.key, factor })}
                  onPickPosts={() =>
                    setPostsRequest({
                      key: state.sheet.key,
                      title: state.sheet.heading,
                      selected: state.targets.map((target) => target.reference),
                      themes: defaultSheetPosts(state.sheet, part.postReferences),
                      description:
                        'Bifează posturile pe care le evaluează fișa. Fiecare primește factorii ei pe fișa lui de evaluare.',
                      resetLabel: 'Ca în document',
                    })
                  }
                  onSource={(picked) =>
                    setSource({ title: state.sheet.heading, sources: [picked] })
                  }
                />
              ))}
            </section>

            {looseCount > 0 && (
              <LooseRows
                count={looseCount}
                {...loose}
                onSource={(title, picked) => setSource({ title, sources: [picked] })}
              />
            )}
          </>
        )}

        <RiskConfirmBar
          summary={
            <div className="flex flex-wrap items-center gap-x-3">
              {(!reviewable || (names.length === 0 && choicesCount === 0 && toCheck === 0)) && (
                <span>
                  {part.status === 'confirmed'
                    ? 'Evaluări confirmate'
                    : expired
                      ? 'Propunere expirată'
                      : !proposal || part.status === 'reading' || part.status === 'failed'
                        ? 'Evaluări de risc'
                        : `${evaluationsLabel(taking.length)} · ${factorsLabel(takingFactors)}`}
                </span>
              )}
              {reviewable && names.length > 0 && (
                <button
                  type="button"
                  className="min-h-11 rounded-sm text-destructive underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring sm:min-h-0"
                  onClick={() => pointToSheet(names[0]!.state.sheet.key)}
                >
                  {names.length === 1 ? 'Un nume de schimbat' : `${names.length} nume de schimbat`}
                </button>
              )}
              {reviewable && choicesCount > 0 && (
                <button
                  type="button"
                  className="min-h-11 rounded-sm text-warning-foreground underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring sm:min-h-0"
                  onClick={() => pointToSheet(choices[0]!.state.sheet.key)}
                >
                  {choicesCount === 1
                    ? 'O alegere de verificat'
                    : `${choicesCount} alegeri de verificat`}
                </button>
              )}
              {reviewable && toCheck > 0 && (
                <button
                  type="button"
                  className="min-h-11 rounded-sm text-warning-foreground underline underline-offset-4 focus-visible:outline-2 focus-visible:outline-ring sm:min-h-0"
                  onClick={() => pointToSheet(checked[0]!.sheet.key)}
                >
                  {factorsLabel(toCheck)} de verificat
                </button>
              )}
            </div>
          }
          save={
            reviewable && !review.closed
              ? { ...review, reload: () => window.location.reload() }
              : undefined
          }
          note={
            review.closed
              ? 'Reîncarcă pagina pentru starea actuală.'
              : reviewable
                ? clientConfirmed && part.expiresAt
                  ? `Poți confirma până pe ${libraryDay(part.expiresAt)}.`
                  : 'Confirmă întâi clientul.'
                : undefined
          }
          details={reviewable && !review.closed ? confirmSentence(summary) : undefined}
          error={confirmError}
        >
          {back}
          {reviewable && clientConfirmed && (
            <Button
              data-testid="library-confirm"
              disabled={confirming || review.conflict || Boolean(review.error || review.closed)}
              onClick={() => void confirm()}
            >
              {confirming ? 'Se confirmă…' : 'Confirmă evaluările'}
            </Button>
          )}
        </RiskConfirmBar>

        <SourceDialog importId={detail.id} request={source} onClose={() => setSource(null)} />
        <PostsPickerDialog
          request={postsRequest}
          posts={pickable}
          undecided={new Map()}
          onClose={() => setPostsRequest(null)}
          onSave={(key, chosen) =>
            review.setSheet(key, (current) => withField(current, 'posts', chosen ?? undefined))
          }
        />
        <RiskFactorDialog
          factors={[]}
          store={factorStore}
          editing={editable}
          context={editing ? (sheetByKey.get(editing.sheet)?.heading ?? undefined) : undefined}
          clientId={detail.client?.id}
          onClose={() => setEditing(null)}
        />
      </div>
    </SourcePrefetchContext>
  );
}

type LooseRow = { row: string; file: string; text: string };

function LooseGroup({
  title,
  note,
  rows,
  testId,
  children,
}: {
  title: string;
  note: string;
  rows: number;
  testId: string;
  children: ReactNode;
}) {
  if (rows === 0) return null;
  return (
    <section aria-label={title} data-testid={testId}>
      <h3 className="flex flex-wrap gap-x-2 border-t border-border/70 bg-muted/45 px-4 py-1.5 text-xs sm:px-5">
        <span className="font-semibold text-muted-foreground">{title}</span>
        <span className="text-muted-foreground">{note}</span>
      </h3>
      <ul>{children}</ul>
    </section>
  );
}

function LooseRowItem({
  label,
  source,
  onSource,
  children,
}: {
  label: string | null;
  source: LabelledSource;
  onSource: (source: LabelledSource) => void;
  children: ReactNode;
}) {
  return (
    <li
      className="grid gap-x-4 gap-y-2 border-t border-border/70 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:px-5"
      data-testid="risk-import-loose-row"
    >
      <div className="grid min-w-0 gap-1">
        {label && <span className="text-sm font-medium wrap-anywhere">{label}</span>}
        {children}
      </div>
      <div className="grid sm:flex sm:items-start">
        <SourceButton
          outlined
          label="Vezi în document"
          sources={[source]}
          onOpen={() => onSource(source)}
        />
      </div>
    </li>
  );
}

const cellsText = (row: LooseRow, label = '') => (
  <p className="text-sm wrap-anywhere">
    {looseCells(row.text)
      .filter((cell) => foldText(cell) !== foldText(label))
      .join(' · ')}
  </p>
);

const rowSource = (row: LooseRow): LabelledSource => ({
  file: row.file,
  quote: rowQuote(row.text),
});

function LooseRows({
  count,
  plan,
  measures,
  unplaced,
  onSource,
}: {
  count: number;
  plan: ReturnType<typeof unplacedPlanRows>;
  measures: LooseRow[];
  unplaced: LooseRow[];
  onSource: (title: string, source: LabelledSource) => void;
}) {
  return (
    <section
      aria-labelledby="risk-loose-heading"
      className="overflow-hidden rounded-xl border bg-card shadow-xs"
      data-testid="risk-import-loose-rows"
    >
      <div className="flex items-start gap-3.5 px-4 py-4 sm:px-5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-secondary">
          <ListX className="size-5" aria-hidden="true" />
        </span>
        <div className="grid min-w-0 gap-1">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <h2 id="risk-loose-heading" className="text-base leading-snug font-semibold">
              Rânduri pe care nu le preluăm
            </h2>
            <Tag tone="muted">{count}</Tag>
          </div>
          <p className="text-sm text-muted-foreground">
            Le-am găsit în documente, dar nu le-am putut lega de niciun factor de pe fișe. Fără un
            factor nu au gravitate și probabilitate, așa că nu intră în import.
          </p>
        </div>
      </div>
      <LooseGroup
        title="Din planul de prevenire"
        note="rânduri pe care nu le-am putut pune pe nicio fișă"
        rows={plan.length}
        testId="risk-import-loose-plan"
      >
        {plan.map((row) => (
          <LooseRowItem
            key={`${row.file}-${row.row}`}
            label={row.post || 'Fără post'}
            source={rowSource(row)}
            onSource={(picked) => onSource('Rând din planul de prevenire', picked)}
          >
            {row.factor ? (
              <PlanRowText
                description={row.factor.description}
                fields={planFieldsLine(row.factor)}
              />
            ) : (
              cellsText(row, row.post)
            )}
          </LooseRowItem>
        ))}
      </LooseGroup>
      <LooseGroup
        title="Din tabelul de măsuri"
        note="măsuri care nu țin de niciun factor"
        rows={measures.length}
        testId="risk-import-loose-measures"
      >
        {measures.map((row) => (
          <LooseRowItem
            key={`${row.file}-${row.row}`}
            label={null}
            source={rowSource(row)}
            onSource={(picked) => onSource('Rând din tabelul de măsuri', picked)}
          >
            {cellsText(row)}
          </LooseRowItem>
        ))}
      </LooseGroup>
      <LooseGroup
        title="În afara fișelor"
        note="rânduri scrise ca factori, dar în afara tabelului oricărei fișe"
        rows={unplaced.length}
        testId="risk-import-loose-unplaced"
      >
        {unplaced.map((row) => (
          <LooseRowItem
            key={`${row.file}-${row.row}`}
            label={null}
            source={rowSource(row)}
            onSource={(picked) => onSource('Rând în afara fișelor', picked)}
          >
            {cellsText(row)}
          </LooseRowItem>
        ))}
      </LooseGroup>
      <p className="border-t border-border/70 px-4 py-3 text-[13px] text-muted-foreground sm:px-5">
        După confirmare, dacă un rând ține de un post, îl adaugi ca factor pe fișa lui, cu clasele
        lui.
      </p>
    </section>
  );
}

function StateNotices({
  part,
  expired,
  retrying,
  onRetry,
}: {
  part: RisksPart;
  expired: boolean;
  retrying: boolean;
  onRetry: () => void;
}) {
  if (expired) {
    return (
      <Notice variant="warning" data-testid="library-expired">
        Propunerea a expirat pe {libraryDay(part.expiresAt!)}, la 14 zile după crearea clientului,
        așa că nu mai poate fi confirmată. Fișele le completezi pe pagina clientului, iar biblioteca
        în Evaluări de risc.
      </Notice>
    );
  }
  switch (part.status) {
    case 'reading':
      return (
        <Notice
          variant="info"
          icon={
            <LoaderCircle className="animate-spin motion-reduce:animate-none" aria-hidden="true" />
          }
          data-testid="library-reading"
        >
          Citim evaluările de risc din pachet. Pagina se actualizează singură când sunt gata; între
          timp poți verifica și crea clientul.
        </Notice>
      );
    case 'failed':
      return (
        <Notice
          variant="destructive"
          title="Nu am putut citi evaluările de risc"
          data-testid="library-failed"
          action={
            <Button
              variant="outline"
              size="sm"
              className="bg-card"
              data-testid="library-retry"
              disabled={retrying}
              onClick={onRetry}
            >
              <RotateCcw aria-hidden="true" />
              {retrying ? 'Se pornește…' : 'Citește din nou'}
            </Button>
          }
        >
          <p>{part.failureReason ?? 'Citirea evaluărilor de risc s-a oprit.'}</p>
          <p className="mt-1">
            Citirea din nou folosește {creditsLabel(importCredits.riskEvaluations)}; dacă nu
            reușește, ți le returnăm. Clientul și instrucțiunile proprii rămân cum sunt.
          </p>
        </Notice>
      );
    case 'confirmed':
      return (
        <Notice
          variant="success"
          data-testid="library-confirmed"
          action={
            <Button asChild variant="outline" size="sm" className="bg-card">
              <Link to="/evaluari-de-risc">Deschide Evaluări de risc</Link>
            </Button>
          }
        >
          Ai confirmat evaluările de risc
          {part.confirmedAt ? ` pe ${libraryDay(part.confirmedAt)}` : ''}. Evaluările sunt în
          biblioteca ta și pe posturile clientului.
        </Notice>
      );
    default:
      return null;
  }
}
