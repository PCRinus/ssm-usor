import { importCredits, importErrorReasons, type InstructionDomain } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { toast } from '@ssm-usor/ui/lib/toast';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate, useRouteContext } from '@tanstack/react-router';
import { ArrowLeft, LoaderCircle, RotateCcw } from 'lucide-react';
import { useState } from 'react';

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
import { invalidateLibrary } from '@/features/instructions/instruction-schema';

import { creditsLabel } from '../import-credits';
import { importErrorMessage } from '../import-format';
import { SavingNote } from '../review-parts';
import { SourceDialog, type SourceRequest } from '../source-dialog';
import { SourcePrefetchContext, useSourcePrefetch } from '../source-query';
import { BodyEditDialog, type BodyRequest } from './body-edit-dialog';
import { InstructionRow } from './instruction-row';
import { PartStatusTag } from './library-group';
import {
  confirmSummary,
  identicalInstructions,
  identicalSentence,
  instructionsLabel,
  isExpired,
  isReviewable,
  joinNames,
  libraryDay,
  type LibraryPart,
  type LibraryPost,
  partLabels,
  partOfDomain,
  pickablePosts,
  postsByReference,
  reviewedInstructions,
  rowState,
  sourceQuote,
  undecidedPositions,
  undecidedReasons,
  unreadReason,
  withChange,
} from './library-model';
import { PostsPickerDialog, type PostsRequest, type UndecidedNote } from './posts-picker-dialog';
import { type LibraryReview, useLibraryParts, useLibraryReview } from './use-library-parts';

export function LibraryTaskPage({
  detail,
  domain,
}: {
  detail: ImportDetail;
  domain: InstructionDomain;
}) {
  const query = useLibraryParts(detail.id);
  const label = partLabels[partOfDomain[domain]];
  if (query.isPending) {
    return (
      <div className="grid gap-4" aria-busy="true" data-testid="library-task-loading">
        <div className="h-9 w-48 animate-pulse rounded-md bg-muted" />
        <div className="h-40 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }
  const part = query.data?.parts.find((each) => each.part === partOfDomain[domain]);
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
          Nu am putut încărca instrucțiunile proprii. Încearcă din nou.
        </Notice>
      ) : !part ? (
        <Notice variant="info" data-testid="library-task-missing">
          În documentația importată nu am găsit {label}.
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
        <Link to="/clients/import/$importId" params={{ importId: detail.id }}>
          <ArrowLeft aria-hidden="true" />
          Înapoi la import
        </Link>
      </Button>
    </div>
  );
}

const confirmReasons: Record<string, string> = {
  [importErrorReasons.clientUnconfirmed]:
    'Confirmă întâi clientul: instrucțiunile se aplică la posturile lui.',
  [importErrorReasons.partExpired]:
    'Propunerea a expirat la 14 zile după crearea clientului, așa că nu mai poate fi confirmată.',
  [importErrorReasons.partNotReady]:
    'Instrucțiunile au fost confirmate sau citite din nou între timp. Reîncarcă pagina.',
  [importErrorReasons.changed]:
    'Altcineva a modificat instrucțiunile între timp. Reîncarcă pagina ca să vezi ce s-a schimbat.',
  [importErrorReasons.outdated]:
    'Clientul sau biblioteca s-au schimbat între timp: un post sau o instrucțiune nu mai există. Reîncarcă pagina și alege din nou.',
  [importErrorReasons.incomplete]:
    'O categorie aleasă nu ține de acest domeniu. Alege din nou categoria instrucțiunii.',
  [importErrorReasons.titleTaken]:
    'Biblioteca are deja o instrucțiune cu titlul ales. Schimbă titlurile marcate mai jos.',
};

function TaskContent({
  detail,
  part,
  posts,
}: {
  detail: ImportDetail;
  part: LibraryPart;
  posts: LibraryPost[];
}) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const review = useLibraryReview(detail.id, part);
  const prefetchSource = useSourcePrefetch(detail.id);
  const [source, setSource] = useState<SourceRequest | null>(null);
  const [postsRequest, setPostsRequest] = useState<PostsRequest | null>(null);
  const [bodyRequest, setBodyRequest] = useState<BodyRequest | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [takenTitles, setTakenTitles] = useState<Set<string>>(new Set());
  const [retrying, setRetrying] = useState(false);

  const domain = part.domain;
  const label = partLabels[part.part];
  const clientConfirmed = detail.status === 'confirmed';
  const expired = isExpired(part);
  const proposal = part.proposal;
  const reviewable = isReviewable(part.status) && proposal !== null && !expired;
  const readOnly = !reviewable;
  const name = detail.client?.legalName ?? detail.companyName ?? 'clientul importat';
  const instructions = proposal?.instructions ?? [];
  const rows = reviewedInstructions(instructions).map((instruction) =>
    rowState(instruction, review.changes.instructions[instruction.key], part.positionPosts)
  );
  const identical = identicalInstructions(instructions);
  const postsById = postsByReference(pickablePosts(posts, clientConfirmed));
  const titleOf = (key: string) =>
    instructions.find((instruction) => instruction.key === key)?.title;
  const undecided = undecidedPositions(proposal?.positions ?? []);
  const undecidedByPost = new Map<string, UndecidedNote[]>();
  for (const position of undecided) {
    const post = part.positionPosts[position.key];
    if (!post) continue;
    const notes = undecidedByPost.get(post) ?? [];
    notes.push({
      written: position.post,
      quotes: position.citations.map((citation) => citation.quote),
      reasons: undecidedReasons(position, titleOf),
    });
    undecidedByPost.set(post, notes);
  }
  const summary = confirmSummary(instructions, review.changes, part.positionPosts, postsById);

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
        invalidateLibrary(queryClient),
        queryClient.invalidateQueries({ queryKey: getListImportsQueryKey() }),
        detail.client &&
          queryClient.invalidateQueries({
            predicate: ({ queryKey }) =>
              String(queryKey[0]).startsWith(`/clients/${detail.client!.id}`),
          }),
      ]);
      toast.success(
        result.createdModuleIds.length > 0
          ? `Am adăugat ${instructionsLabel(result.createdModuleIds.length)} în bibliotecă.`
          : `Ai confirmat ${label}.`
      );
      await navigate({ to: '/clients/import/$importId', params: { importId: detail.id } });
    } catch (cause) {
      const body =
        cause instanceof ApiHttpError
          ? (cause.body as Partial<ApiErrorResponse> | undefined)
          : undefined;
      const reason = body?.reason;
      if (reason === importErrorReasons.titleTaken) {
        setTakenTitles(
          new Set(
            (body?.issues ?? []).flatMap((issue) => {
              const key = /^instructions\.(.+)\.title$/u.exec(issue.path)?.[1];
              return key ? [key] : [];
            })
          )
        );
      }
      setConfirmError(
        reason && Object.hasOwn(confirmReasons, reason)
          ? confirmReasons[reason]!
          : importErrorMessage(cause, 'Nu am putut confirma instrucțiunile. Încearcă din nou.')
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

  const intro =
    domain === 'ssm'
      ? `Instrucțiunile proprii SSM din documentația lui ${name}, pentru biblioteca ta.`
      : `Instrucțiunile proprii PSI din documentația lui ${name}, pentru biblioteca ta.`;

  return (
    <SourcePrefetchContext value={prefetchSource}>
      <div className="grid gap-6" data-testid="library-task" data-part={part.part}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="grid max-w-3xl gap-1">
            <span className="text-sm text-muted-foreground">Instrucțiuni proprii din import</span>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="text-3xl font-semibold tracking-tight">{label}</h1>
              <PartStatusTag part={part} />
              <HelpLink
                topic="import.instructiuni-proprii"
                label="Ajutor: instrucțiunile din import"
              />
            </div>
            <p className="text-sm text-muted-foreground">
              {intro} Ce e nou sau asemănător verifici aici; ce ai deja se aplică singur.
            </p>
          </div>
          {reviewable && <SavingNote saving={review.saving} />}
        </div>

        <StateNotices
          part={part}
          label={label}
          expired={expired}
          retrying={retrying}
          onRetry={() => void retry()}
        />
        {reviewable && <ReviewNotices review={review} />}

        {proposal && part.status !== 'failed' && part.status !== 'reading' && (
          <>
            {identical.length > 0 && (
              <section
                className="grid gap-2 rounded-xl border bg-card px-5 py-4 shadow-xs"
                data-testid="library-identical"
              >
                <p className="text-sm font-medium">{identicalSentence(identical.length)}.</p>
                <p className="text-sm text-muted-foreground">
                  {identical.length === 1
                    ? 'Nu o adăugăm din nou: la confirmare, posturile primesc instrucțiunea pe care o ai.'
                    : 'Nu le adăugăm din nou: la confirmare, posturile primesc instrucțiunile pe care le ai.'}
                </p>
                <details className="text-sm">
                  <summary className="cursor-pointer font-medium text-primary">
                    {identical.length === 1 ? 'Vezi care e' : 'Vezi care sunt'}
                  </summary>
                  <ul className="mt-2 grid gap-1">
                    {identical.map((instruction) => {
                      const row = rowState(
                        instruction,
                        review.changes.instructions[instruction.key],
                        part.positionPosts
                      );
                      const names = row.posts.flatMap((post) =>
                        postsById.get(post) ? [postsById.get(post)!.name] : []
                      );
                      return (
                        <li key={instruction.key}>
                          <span className="font-medium">
                            {instruction.match?.title ?? instruction.title}
                          </span>
                          <span className="text-muted-foreground">
                            {names.length > 0 ? `: ${joinNames(names)}` : ': niciun post'}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </details>
              </section>
            )}

            {undecided.length > 0 && (
              <Notice variant="warning" title="Posturi nedecise" data-testid="library-undecided">
                <p>
                  Tematica nu ne-a spus clar ce instrucțiuni iau aceste posturi. Le alegi la fiecare
                  instrucțiune, cu „Alege posturile”.
                </p>
                <ul className="mt-2 grid gap-2">
                  {undecided.map((position) => (
                    <li key={position.key} className="grid gap-0.5">
                      <span className="font-semibold">{position.clientPost ?? position.post}</span>
                      {position.citations.map((citation) => (
                        <q key={citation.quote} className="wrap-anywhere">
                          {citation.quote}
                        </q>
                      ))}
                      {undecidedReasons(position, titleOf).map((reason) => (
                        <span key={reason}>{reason}</span>
                      ))}
                    </li>
                  ))}
                </ul>
              </Notice>
            )}

            {proposal.unread.length > 0 && (
              <Notice
                variant="warning"
                title={
                  proposal.unread.length === 1
                    ? 'O instrucțiune nu a putut fi citită'
                    : `${instructionsLabel(proposal.unread.length)} nu au putut fi citite`
                }
                data-testid="library-unread"
              >
                <ul className="grid gap-1">
                  {proposal.unread.map((item) => (
                    <li key={item.key}>
                      <span className="font-medium">{item.title}</span>: {unreadReason(item.reason)}
                      .
                    </li>
                  ))}
                </ul>
                <p className="mt-1">O poți adăuga în bibliotecă cu „Lipește text”.</p>
              </Notice>
            )}

            {rows.length === 0 ? (
              <section
                className="grid gap-1 rounded-xl border border-dashed bg-card px-5 py-6 text-center"
                data-testid="library-nothing-new"
              >
                <h2 className="text-base font-semibold">Nimic nou în pachet</h2>
                <p className="text-sm text-muted-foreground">
                  {identical.length > 0
                    ? 'Toate instrucțiunile din pachet sunt deja în biblioteca ta. La confirmare se aplică la posturile clientului.'
                    : 'Nu am găsit instrucțiuni de adăugat în bibliotecă.'}
                </p>
              </section>
            ) : (
              <section aria-labelledby="library-rows-heading" className="grid gap-3">
                <h2 id="library-rows-heading" className="text-lg font-semibold">
                  De verificat
                  <span className="ml-2 text-sm font-normal text-muted-foreground tabular-nums">
                    {instructionsLabel(rows.length)}
                  </span>
                </h2>
                {rows.map((row) => (
                  <InstructionRow
                    key={row.instruction.key}
                    row={row}
                    domain={domain}
                    postsById={postsById}
                    readOnly={readOnly}
                    titleTaken={takenTitles.has(row.instruction.key)}
                    onChange={(change) => {
                      setTakenTitles((current) => {
                        if (!current.has(row.instruction.key)) return current;
                        const next = new Set(current);
                        next.delete(row.instruction.key);
                        return next;
                      });
                      review.setInstruction(row.instruction.key, change);
                    }}
                    onSource={() =>
                      setSource({
                        title: row.instruction.writtenTitle,
                        sources: [
                          {
                            file: row.instruction.location.file,
                            quote: sourceQuote(row.instruction.body),
                          },
                        ],
                      })
                    }
                    onEditBody={() =>
                      setBodyRequest({
                        key: row.instruction.key,
                        title: row.title,
                        domain,
                        category: row.category,
                        body: row.body,
                        original: row.instruction.body,
                        clientNames: row.instruction.flags.flatMap((flag) =>
                          flag.kind === 'client_name' ? [flag.name] : []
                        ),
                      })
                    }
                    onPickPosts={() =>
                      setPostsRequest({
                        key: row.instruction.key,
                        title:
                          row.usesLibrary && row.instruction.match
                            ? row.instruction.match.title
                            : row.title,
                        selected: row.posts,
                        themes: rowState(row.instruction, undefined, part.positionPosts).posts,
                      })
                    }
                  />
                ))}
              </section>
            )}
          </>
        )}

        {reviewable && (
          <section
            aria-label={`Confirmarea ${label}`}
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
                    : `Confirmă ${label}`}
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
          posts={pickablePosts(posts, clientConfirmed)}
          undecided={undecidedByPost}
          onClose={() => setPostsRequest(null)}
          onSave={(key, chosen) =>
            review.setInstruction(key, (current) =>
              withChange(current, 'posts', chosen ?? undefined)
            )
          }
        />
        <BodyEditDialog
          request={bodyRequest}
          onClose={() => setBodyRequest(null)}
          onSave={(key, body) =>
            review.setInstruction(key, (current) => withChange(current, 'body', body ?? undefined))
          }
        />
      </div>
    </SourcePrefetchContext>
  );
}

function confirmSentence(summary: { created: number; used: number; posts: number }) {
  const parts = [
    ...(summary.created > 0
      ? [
          summary.created === 1
            ? 'Se adaugă o instrucțiune în bibliotecă'
            : `Se adaugă ${instructionsLabel(summary.created)} în bibliotecă`,
        ]
      : []),
    ...(summary.used > 0
      ? [
          summary.used === 1
            ? 'se folosește una pe care o ai'
            : `se folosesc ${instructionsLabel(summary.used)} pe care le ai`,
        ]
      : []),
  ];
  if (parts.length === 0) return 'Nu se adaugă și nu se aplică nicio instrucțiune.';
  const sentence = parts.join(', ');
  const posts =
    summary.posts === 0
      ? ', la niciun post'
      : summary.posts === 1
        ? ', la un post'
        : `, la ${summary.posts} posturi`;
  return `${sentence.charAt(0).toUpperCase()}${sentence.slice(1)}${posts}.`;
}

function StateNotices({
  part,
  label,
  expired,
  retrying,
  onRetry,
}: {
  part: LibraryPart;
  label: string;
  expired: boolean;
  retrying: boolean;
  onRetry: () => void;
}) {
  if (expired) {
    return (
      <Notice variant="warning" data-testid="library-expired">
        Propunerea a expirat pe {libraryDay(part.expiresAt!)}, la 14 zile după crearea clientului,
        așa că nu mai poate fi confirmată. Instrucțiunile le poți adăuga în Instrucțiuni proprii, cu
        „Scrie o instrucțiune” și „Lipește text”.
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
          Citim instrucțiunile proprii din pachet. Pagina se actualizează singură când sunt gata;
          între timp poți verifica și crea clientul.
        </Notice>
      );
    case 'failed': {
      const credits = importCredits.ownInstructions[part.domain];
      return (
        <Notice
          variant="destructive"
          title={`Nu am putut citi ${label}`}
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
          <p>{part.failureReason ?? 'Citirea instrucțiunilor proprii s-a oprit.'}</p>
          <p className="mt-1">
            Citirea din nou folosește {creditsLabel(credits)}; dacă nu reușește, ți le returnăm.
            Clientul și celelalte instrucțiuni rămân cum sunt.
          </p>
        </Notice>
      );
    }
    case 'confirmed':
      return (
        <Notice
          variant="success"
          data-testid="library-confirmed"
          action={
            <Button asChild variant="outline" size="sm" className="bg-card">
              <Link to={part.domain === 'su' ? '/instructions/su' : '/instructions/ssm'}>
                Deschide {label}
              </Link>
            </Button>
          }
        >
          Ai confirmat {label}
          {part.confirmedAt ? ` pe ${libraryDay(part.confirmedAt)}` : ''}. Instrucțiunile sunt în
          biblioteca ta și la posturile clientului.
        </Notice>
      );
    default:
      return null;
  }
}

function ReviewNotices({ review }: { review: LibraryReview }) {
  if (review.conflict) {
    return (
      <Notice
        variant="destructive"
        data-testid="library-review-conflict"
        action={
          <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
            Reîncarcă pagina
          </Button>
        }
      >
        Altcineva a modificat instrucțiunile între timp, așa că schimbarea ta nu a fost salvată.
        Reîncarcă pagina și fă-o din nou.
      </Notice>
    );
  }
  if (review.closed) {
    return (
      <Notice
        variant="destructive"
        data-testid="library-review-closed"
        action={
          <Button variant="outline" size="sm" onClick={() => window.location.reload()}>
            Reîncarcă pagina
          </Button>
        }
      >
        {review.closed}
      </Notice>
    );
  }
  if (review.error) {
    return (
      <Notice
        variant="destructive"
        data-testid="library-review-error"
        action={
          <Button variant="outline" size="sm" onClick={review.retry}>
            Salvează din nou
          </Button>
        }
      >
        {review.error}
      </Notice>
    );
  }
  return null;
}
