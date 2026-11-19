import {
  countOf,
  importCredits,
  importErrorReasons,
  type InstructionDomain,
} from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { Notice } from '@ssm-usor/ui/components/notice';
import { Link } from '@tanstack/react-router';
import { type ReactNode, useEffect, useRef, useState } from 'react';

import type { ImportDetail } from '@/api/generated/api';
import { invalidateLibrary } from '@/features/instructions/instruction-schema';
import { scrollAndFocus } from '@/features/missing-data/focus';

import { ImportActionBar } from '../import-action-bar';
import { ImportIssueBadge } from '../import-review-issues';
import { SourceDialog, type SourceRequest } from '../source-dialog';
import { SourcePrefetchContext, useSourcePrefetch } from '../source-query';
import { BodyEditDialog, type BodyRequest } from './body-edit-dialog';
import { InstructionRow } from './instruction-row';
import { PartStatusTag } from './library-group';
import {
  identicalInstructions,
  identicalSentence,
  instructionPending,
  instructionsLabel,
  isExpired,
  isInstructionsLibraryPart,
  isReviewable,
  joinNames,
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
import { PartStateNotices, PartTaskHeader, PartTaskLoader, ReviewNotices } from './part-task';
import { PostsPickerDialog, type PostsRequest, type UndecidedNote } from './posts-picker-dialog';
import { useLibraryReview } from './use-library-parts';
import { partConfirmNote, partConfirmReasons, usePartConfirm } from './use-part-confirm';

export function LibraryTaskPage({
  detail,
  domain,
}: {
  detail: ImportDetail;
  domain: InstructionDomain;
}) {
  const label = partLabels[partOfDomain[domain]];
  return (
    <PartTaskLoader
      detail={detail}
      pick={(parts) =>
        parts.filter(isInstructionsLibraryPart).find((each) => each.part === partOfDomain[domain])
      }
      loadFailed="Nu am putut încărca instrucțiunile proprii. Încearcă din nou."
      missing={`În documentația importată nu am găsit ${label}.`}
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
  ...partConfirmReasons({ these: 'instrucțiunile', one: 'o instrucțiune' }),
  [importErrorReasons.incomplete]:
    'O categorie aleasă nu ține de acest domeniu. Alege din nou categoria instrucțiunii.',
  [importErrorReasons.titleTaken]:
    'Biblioteca are deja o instrucțiune cu titlul ales. Schimbă titlurile marcate mai jos.',
};

function TaskContent({
  detail,
  part,
  posts,
  back,
}: {
  detail: ImportDetail;
  part: LibraryPart;
  posts: LibraryPost[];
  back: ReactNode;
}) {
  const review = useLibraryReview(detail.id, part);
  const prefetchSource = useSourcePrefetch(detail.id);
  const root = useRef<HTMLDivElement>(null);
  const stopAttention = useRef<() => void>(() => {});
  useEffect(() => () => stopAttention.current(), []);
  const [source, setSource] = useState<SourceRequest | null>(null);
  const [postsRequest, setPostsRequest] = useState<PostsRequest | null>(null);
  const [bodyRequest, setBodyRequest] = useState<BodyRequest | null>(null);
  const [takenTitles, setTakenTitles] = useState<Set<string>>(new Set());

  const domain = part.domain;
  const label = partLabels[part.part];
  const clientConfirmed = detail.status === 'confirmed';
  const expired = isExpired(part);
  const proposal = part.proposal;
  const reviewable = isReviewable(part.status) && proposal !== null && !expired;
  const readOnly = !reviewable || Boolean(review.closed);
  const name = detail.client?.legalName ?? detail.companyName ?? 'Client importat';
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
  const decisions = rows.map((row) => ({
    row,
    pending: instructionPending(row, postsById, takenTitles.has(row.instruction.key)),
  }));
  const choices = decisions.filter(({ pending }) => pending.some((value) => value !== 'title'));
  const titles = decisions.filter(({ pending }) => pending.includes('title'));
  const choicesCount = decisions.reduce(
    (count, { pending }) => count + pending.filter((value) => value !== 'title').length,
    0
  );

  function pointToInstruction(key: string) {
    const element = [
      ...(root.current?.querySelectorAll<HTMLElement>('[data-testid="library-instruction"]') ?? []),
    ].find((each) => each.dataset.key === key);
    if (!element) return;
    stopAttention.current();
    stopAttention.current = scrollAndFocus(element);
  }

  const { confirming, confirmError, confirm, retrying, retry } = usePartConfirm({
    detail,
    part,
    review,
    invalidate: invalidateLibrary,
    doneText: (result) =>
      'createdModuleIds' in result && result.createdModuleIds.length > 0
        ? `Am adăugat ${instructionsLabel(result.createdModuleIds.length)} în bibliotecă.`
        : `Ai confirmat ${label}.`,
    reasons: confirmReasons,
    failed: 'Nu am putut confirma instrucțiunile. Încearcă din nou.',
    onRefused: (reason, body) => {
      if (reason !== importErrorReasons.titleTaken) return undefined;
      setTakenTitles(
        new Set(
          (body?.issues ?? []).flatMap((issue) => {
            const key = /^instructions\.(.+)\.title$/u.exec(issue.path)?.[1];
            return key ? [key] : [];
          })
        )
      );
      return undefined;
    },
  });

  return (
    <SourcePrefetchContext value={prefetchSource}>
      <div ref={root} className="grid gap-6" data-testid="library-task" data-part={part.part}>
        <PartTaskHeader
          importId={detail.id}
          part={part}
          title={label}
          name={name}
          helpTopic="import.instructiuni-proprii"
          helpLabel="Ajutor: instrucțiunile din import"
        />

        <PartStateNotices
          part={part}
          expired={expired}
          retrying={retrying}
          onRetry={() => void retry()}
          texts={{
            afterExpiry:
              'Instrucțiunile le poți adăuga în Instrucțiuni proprii, cu „Scrie o instrucțiune” și „Lipește text”.',
            reading: 'Citim instrucțiunile proprii din pachet.',
            failedTitle: `Nu am putut citi ${label}`,
            failedFallback: 'Citirea instrucțiunilor proprii s-a oprit.',
            credits: importCredits.ownInstructions[part.domain],
            untouched: 'Clientul și celelalte instrucțiuni rămân cum sunt.',
            confirmed: `Ai confirmat ${label}`,
            confirmedWhere: 'Instrucțiunile sunt în biblioteca ta și la posturile clientului.',
            open: (
              <Link to={part.domain === 'su' ? '/instructiuni/su' : '/instructiuni/ssm'}>
                Deschide {label}
              </Link>
            ),
          }}
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
                  {readOnly ? 'Instrucțiunile din import' : 'Ce verifici înainte să confirmi'}{' '}
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

        <ImportActionBar
          label={`Confirmarea ${label}`}
          testId="library-confirm-bar"
          save={
            reviewable && !review.closed
              ? { ...review, reload: () => window.location.reload() }
              : undefined
          }
          summary={
            <div
              className="flex flex-wrap items-center gap-x-3"
              data-testid="library-confirm-summary"
            >
              <PartStatusTag part={part} />
              {reviewable && (
                <>
                  {titles.length > 0 && (
                    <ImportIssueBadge
                      tone="destructive"
                      onClick={() => pointToInstruction(titles[0]!.row.instruction.key)}
                    >
                      {titles.length === 1
                        ? 'Un titlu de schimbat'
                        : `${countOf(titles.length, 'titlu', 'titluri')} de schimbat`}
                    </ImportIssueBadge>
                  )}
                  {choicesCount > 0 && (
                    <ImportIssueBadge
                      tone="warning"
                      onClick={() => pointToInstruction(choices[0]!.row.instruction.key)}
                    >
                      {choicesCount === 1
                        ? 'O alegere de verificat'
                        : `${countOf(choicesCount, 'alegere', 'alegeri')} de verificat`}
                    </ImportIssueBadge>
                  )}
                </>
              )}
            </div>
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
              {confirming ? 'Se confirmă…' : 'Confirmă instrucțiunile'}
            </Button>
          )}
        </ImportActionBar>

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
