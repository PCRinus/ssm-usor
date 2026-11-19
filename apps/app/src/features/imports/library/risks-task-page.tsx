import {
  capitalized,
  countOf,
  foldText,
  importCredits,
  importErrorReasons,
} from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { Link } from '@tanstack/react-router';
import { ListX } from 'lucide-react';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';

import type { ImportDetail } from '@/api/generated/api';
import { scrollAndFocus } from '@/features/missing-data/focus';
import type { FactorStore } from '@/features/risk-evaluations/factor-store';
import type { EditableFactor } from '@/features/risk-evaluations/risk-evaluation-schema';
import { RiskFactorDialog } from '@/features/risk-evaluations/risk-factor-dialog';

import { ImportIssueBadge } from '../import-review-issues';
import { SourceButton, Tag } from '../review-parts';
import type { LabelledSource } from '../review-types';
import { SourceDialog, type SourceRequest } from '../source-dialog';
import { SourcePrefetchContext, useSourcePrefetch } from '../source-query';
import { PartStatusTag } from './library-group';
import {
  isExpired,
  isReviewable,
  type LibraryPost,
  pickablePosts,
  postsByReference,
} from './library-model';
import { PartStateNotices, PartTaskHeader, PartTaskLoader, ReviewNotices } from './part-task';
import { PostsPickerDialog, type PostsRequest } from './posts-picker-dialog';
import { RiskConfirmBar } from './risk-confirm-bar';
import { PlanRowText } from './risk-plan-rows';
import { RiskSheetCard } from './risk-sheet-card';
import {
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
  rowQuote,
  sheetsLabel,
  sheetState,
  takenNamesText,
  takenSheets,
  unplacedPlanRows,
  withField,
  withIncluded,
} from './risks-model';
import { useRiskReview } from './use-library-parts';
import { partConfirmNote, partConfirmReasons, usePartConfirm } from './use-part-confirm';

export function RisksTaskPage({ detail }: { detail: ImportDetail }) {
  return (
    <PartTaskLoader
      detail={detail}
      pick={(parts) => parts.find(isRisksLibraryPart)}
      loadFailed="Nu am putut încărca evaluările de risc. Încearcă din nou."
      missing="În documentația importată nu am găsit evaluări de risc."
    >
      {(part, posts, back) => (
        <TaskContent
          key={`${part.part}-${part.attempt}`}
          detail={detail}
          part={part}
          posts={posts}
          back={back}
        />
      )}
    </PartTaskLoader>
  );
}

const confirmReasons: Record<string, string> = {
  ...partConfirmReasons({ these: 'evaluările de risc', one: 'o evaluare' }),
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
  return `${capitalized(text)}.`;
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
  const review = useRiskReview(detail.id, part);
  const prefetchSource = useSourcePrefetch(detail.id);
  const root = useRef<HTMLDivElement>(null);
  const stopAttention = useRef<() => void>(() => {});
  useEffect(() => () => stopAttention.current(), []);
  const [source, setSource] = useState<SourceRequest | null>(null);
  const [postsRequest, setPostsRequest] = useState<PostsRequest | null>(null);
  const [editing, setEditing] = useState<Editing>(null);
  const [takenNames, setTakenNames] = useState<Set<string>>(new Set());
  const [refused, setRefused] = useState<Map<string, Set<string>>>(new Map());

  const clientConfirmed = detail.status === 'confirmed';
  const expired = isExpired(part);
  const proposal = part.proposal;
  const reviewable = isReviewable(part.status) && proposal !== null && !expired;
  const readOnly = !reviewable || Boolean(review.closed);
  const name = detail.client?.legalName ?? detail.companyName ?? 'Client importat';
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

  const { confirming, confirmError, confirm, retrying, retry } = usePartConfirm({
    detail,
    part,
    review,
    invalidate: (queryClient) =>
      queryClient.invalidateQueries({
        predicate: ({ queryKey }) => String(queryKey[0]).startsWith('/evaluation-profiles'),
      }),
    doneText: (result) =>
      'createdProfileIds' in result ? doneToast(result) : 'Ai confirmat evaluările de risc.',
    reasons: confirmReasons,
    failed: 'Nu am putut confirma evaluările de risc. Încearcă din nou.',
    onRefused: (reason, body) => {
      const named = (keys: Iterable<string>) =>
        [...keys].map((key) => sheetByKey.get(key)?.name ?? key);
      if (reason === importErrorReasons.nameTaken) {
        const taken = takenSheets(body?.issues ?? []);
        setTakenNames(taken);
        return takenNamesText(named(taken));
      }
      if (reason === importErrorReasons.incomplete) {
        const incomplete = incompleteFactors(body?.issues ?? []);
        setRefused(incomplete);
        return incompleteText(named(incomplete.keys()));
      }
      return undefined;
    },
  });

  return (
    <SourcePrefetchContext value={prefetchSource}>
      <div ref={root} className="grid gap-6" data-testid="library-task" data-part={part.part}>
        <PartTaskHeader
          importId={detail.id}
          part={part}
          title="Evaluări de risc"
          name={name}
          helpTopic="import.evaluari-de-risc"
          helpLabel="Ajutor: evaluările de risc din import"
        />

        <PartStateNotices
          part={part}
          expired={expired}
          retrying={retrying}
          onRetry={() => void retry()}
          texts={{
            afterExpiry:
              'Fișele le completezi pe pagina clientului, iar biblioteca în Evaluări de risc.',
            reading: 'Citim evaluările de risc din pachet.',
            failedTitle: 'Nu am putut citi evaluările de risc',
            failedFallback: 'Citirea evaluărilor de risc s-a oprit.',
            credits: importCredits.riskEvaluations,
            untouched: 'Clientul și instrucțiunile proprii rămân cum sunt.',
            confirmed: 'Ai confirmat evaluările de risc',
            confirmedWhere: 'Evaluările sunt în biblioteca ta și pe posturile clientului.',
            open: <Link to="/evaluari-de-risc">Deschide Evaluări de risc</Link>,
          }}
        />
        {reviewable && <ReviewNotices review={review} />}

        {proposal && part.status !== 'failed' && part.status !== 'reading' && (
          <>
            <section aria-labelledby="risk-sheets-heading" className="grid gap-3">
              <div className="grid gap-1">
                <h2 id="risk-sheets-heading" className="text-lg font-semibold">
                  {readOnly ? 'Evaluările din import' : 'Ce verifici înainte să confirmi'}{' '}
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
                        'Bifează posturile cărora li se aplică evaluarea. Fiecare primește factorii ei pe fișa lui de evaluare a riscurilor.',
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
              <PartStatusTag part={part} />
              {reviewable && names.length > 0 && (
                <ImportIssueBadge
                  tone="destructive"
                  onClick={() => pointToSheet(names[0]!.state.sheet.key)}
                >
                  {names.length === 1
                    ? 'Un nume de schimbat'
                    : `${countOf(names.length, 'nume', 'nume')} de schimbat`}
                </ImportIssueBadge>
              )}
              {reviewable && choicesCount > 0 && (
                <ImportIssueBadge
                  tone="warning"
                  onClick={() => pointToSheet(choices[0]!.state.sheet.key)}
                >
                  {choicesCount === 1
                    ? 'O alegere de verificat'
                    : `${countOf(choicesCount, 'alegere', 'alegeri')} de verificat`}
                </ImportIssueBadge>
              )}
            </div>
          }
          save={
            reviewable && !review.closed
              ? { ...review, reload: () => window.location.reload() }
              : undefined
          }
          note={partConfirmNote({
            closed: review.closed,
            reviewable,
            clientConfirmed,
            intoExistingClient: detail.intoExistingClient,
            expiresAt: part.expiresAt,
          })}
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
