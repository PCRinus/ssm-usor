import { importCredits, importErrorReasons } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { toast } from '@ssm-usor/ui/lib/toast';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useRouteContext } from '@tanstack/react-router';
import { ArrowLeft, LoaderCircle, RotateCcw } from 'lucide-react';
import { useMemo, useState } from 'react';

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
import type { FactorStore } from '@/features/risk-evaluations/factor-store';
import type { EditableFactor } from '@/features/risk-evaluations/risk-evaluation-schema';
import { RiskFactorDialog } from '@/features/risk-evaluations/risk-factor-dialog';

import { creditsLabel } from '../import-credits';
import { importErrorMessage } from '../import-format';
import type { LabelledSource } from '../review-model';
import { SavingNote, SourceButton } from '../review-parts';
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
  isRisksLibraryPart,
  leftSentence,
  pendingOf,
  type RisksPart,
  riskSummary,
  rowCells,
  rowQuote,
  sheetsLabel,
  sheetState,
  takenSheets,
  withField,
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
        />
      )}
      <Button asChild variant="outline" className="w-fit">
        <Link to="/clienti/import/$importId" params={{ importId: detail.id }}>
          <ArrowLeft aria-hidden="true" />
          Înapoi la import
        </Link>
      </Button>
    </div>
  );
}

const conflictText =
  'Altcineva a modificat evaluările de risc între timp, așa că schimbarea ta nu a fost salvată. Reîncarcă pagina și fă-o din nou.';

const confirmReasons: Record<string, string> = {
  [importErrorReasons.clientUnconfirmed]:
    'Confirmă întâi clientul: fișele de evaluare se aplică la posturile lui.',
  [importErrorReasons.partExpired]:
    'Propunerea a expirat la 14 zile după crearea clientului, așa că nu mai poate fi confirmată.',
  [importErrorReasons.partNotReady]:
    'Evaluările de risc au fost confirmate sau citite din nou între timp. Reîncarcă pagina.',
  [importErrorReasons.changed]:
    'Altcineva a modificat evaluările de risc între timp. Reîncarcă pagina ca să vezi ce s-a schimbat.',
  [importErrorReasons.outdated]:
    'Clientul sau biblioteca s-au schimbat între timp: un post sau o evaluare nu mai există. Reîncarcă pagina și alege din nou.',
  [importErrorReasons.incomplete]:
    'Unii factori bifați nu au toate clasele. Alege-le la factorii marcați mai jos sau debifează-i.',
  [importErrorReasons.nameTaken]:
    'Biblioteca are deja o evaluare cu numele ales. Schimbă numele marcate mai jos.',
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
}: {
  detail: ImportDetail;
  part: RisksPart;
  posts: LibraryPost[];
}) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const review = useRiskReview(detail.id, part);
  const prefetchSource = useSourcePrefetch(detail.id);
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
  const readOnly = !reviewable;
  const name = detail.client?.legalName ?? detail.companyName ?? 'clientul importat';
  const sheets = useMemo(() => proposal?.sheets ?? [], [proposal]);
  const pickable = pickablePosts(posts, clientConfirmed);
  const postsById = postsByReference(pickable);
  const existing = useMemo(
    () => existingByReference(sheets, part.postReferences),
    [sheets, part.postReferences]
  );
  const states = sheets.map((sheet) =>
    sheetState(sheet, review.changes.sheets[sheet.key], {
      postReferences: part.postReferences,
      postsById,
      existingByReference: existing,
      existingFactors: part.existingFactors,
    })
  );
  const open = readOnly
    ? 0
    : states.filter((state) => pendingOf(state, takenNames.has(state.sheet.key)).length > 0).length;
  const summary = riskSummary(states);
  const sheetByKey = new Map(sheets.map((sheet) => [sheet.key, sheet]));
  const loose = [
    ...(proposal?.unplacedRows ?? []).map((row) => ({
      ...row,
      what: 'Rând de factor care nu ține de nicio fișă',
    })),
    ...(proposal?.unmatchedPlanRows ?? []).map((row) => ({
      ...row,
      what: `Rând din planul de prevenire fără factor${row.post ? ` (${row.post})` : ''}`,
    })),
    ...(proposal?.unmatchedMeasureRows ?? []).map((row) => ({
      ...row,
      what: 'Măsură fără factor',
    })),
  ];

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
      if (reason === importErrorReasons.nameTaken) setTakenNames(takenSheets(body?.issues ?? []));
      if (reason === importErrorReasons.incomplete) {
        setRefused(incompleteFactors(body?.issues ?? []));
      }
      setConfirmError(
        reason && Object.hasOwn(confirmReasons, reason)
          ? confirmReasons[reason]!
          : importErrorMessage(cause, 'Nu am putut confirma evaluările de risc. Încearcă din nou.')
      );
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
      <div className="grid gap-6" data-testid="library-task" data-part={part.part}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="grid max-w-3xl gap-1">
            <span className="text-sm text-muted-foreground">Evaluări de risc din import</span>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="text-3xl font-semibold tracking-tight">Fișe de evaluare</h1>
              <PartStatusTag part={part} />
              <HelpLink topic="import.evaluari-de-risc" label="Ajutor: evaluările din import" />
            </div>
            <p className="text-sm text-muted-foreground">
              Fișele de evaluare din documentația lui {name}, pentru biblioteca ta și pentru
              posturile clientului. Clasele sunt cele din document; noi doar îți arătăm unde nu se
              potrivesc cu metoda.
            </p>
          </div>
          {reviewable && <SavingNote saving={review.saving} />}
        </div>

        <StateNotices
          part={part}
          expired={expired}
          retrying={retrying}
          onRetry={() => void retry()}
        />
        {reviewable && <ReviewNotices review={review} conflictText={conflictText} />}

        {proposal && part.status !== 'failed' && part.status !== 'reading' && (
          <>
            <section aria-labelledby="risk-sheets-heading" className="grid gap-3">
              <div className="grid gap-1">
                <h2 id="risk-sheets-heading" className="text-lg font-semibold">
                  Ce verifici înainte să confirmi
                  <span className="ml-2 text-sm font-normal text-muted-foreground tabular-nums">
                    {sheets.length === 1 ? 'o fișă' : sheetsLabel(sheets.length)}
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

            {loose.length > 0 && (
              <section
                className="grid gap-2 rounded-xl border bg-card px-5 py-4 shadow-xs"
                data-testid="risk-import-loose-rows"
              >
                <h2 className="text-base font-semibold">Rânduri de verificat în document</h2>
                <p className="text-sm text-muted-foreground">
                  Nu le-am putut lega de niciun factor, așa că nu le preluăm. Dacă țin de o fișă, le
                  adaugi pe pagina ei după confirmare.
                </p>
                <ul className="grid gap-2">
                  {loose.map((row) => {
                    const picked: LabelledSource = { file: row.file, quote: rowQuote(row.text) };
                    return (
                      <li
                        key={`${row.file}-${row.row}`}
                        className="grid gap-1 rounded-md border px-3 py-2"
                        data-testid="risk-import-loose-row"
                      >
                        <span className="text-xs font-semibold text-warning-foreground">
                          {row.what}
                        </span>
                        <span className="text-sm wrap-anywhere">
                          {rowCells(row.text).join(' · ')}
                        </span>
                        <span className="justify-self-start">
                          <SourceButton
                            label="Vezi în document"
                            sources={[picked]}
                            onOpen={() => setSource({ title: row.what, sources: [picked] })}
                          />
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </section>
            )}
          </>
        )}

        {reviewable && (
          <section
            aria-label="Confirmarea evaluărilor de risc"
            className="grid gap-3 rounded-xl border bg-card px-5 py-4 shadow-xs"
            data-testid="library-confirm-bar"
          >
            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="max-w-2xl text-sm" data-testid="library-confirm-summary">
                <span className="font-medium">{confirmSentence(summary)}</span>{' '}
                <span className="text-muted-foreground">
                  {clientConfirmed && part.expiresAt
                    ? `Poți confirma până pe ${libraryDay(part.expiresAt)}.`
                    : `Le poți verifica de acum, iar ce schimbi se păstrează. Le confirmi după ce ${detail.intoExistingClient ? 'completezi' : 'creezi'} clientul, pentru că se aplică la posturile lui.`}
                </span>
              </p>
              <Button
                data-testid="library-confirm"
                disabled={!clientConfirmed || confirming}
                onClick={() => void confirm()}
              >
                {!clientConfirmed
                  ? 'Confirmă întâi clientul'
                  : confirming
                    ? 'Se confirmă…'
                    : 'Confirmă evaluările'}
              </Button>
            </div>
            {confirmError && (
              <Notice variant="destructive" data-testid="library-confirm-error">
                {confirmError}
              </Notice>
            )}
          </section>
        )}

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
          Citim fișele de evaluare din pachet. Pagina se actualizează singură când sunt gata; între
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
          {part.confirmedAt ? ` pe ${libraryDay(part.confirmedAt)}` : ''}. Fișele sunt în biblioteca
          ta și pe posturile clientului.
        </Notice>
      );
    default:
      return null;
  }
}
