import { type InstructionCategory, type InstructionDomain } from '@ssm-usor/contracts';
import { Checkbox } from '@ssm-usor/ui/components/checkbox';
import { Input } from '@ssm-usor/ui/components/input';
import { Label } from '@ssm-usor/ui/components/label';
import { NativeSelect } from '@ssm-usor/ui/components/native-select';
import { cn } from '@ssm-usor/ui/lib/utils';
import { TriangleAlert } from 'lucide-react';
import { useId, useState } from 'react';

import { articleCountLabel, groupLabels } from '@/features/instructions/instruction-schema';

import { EditedTag, LinkButton, SourceButton, Tag } from '../review-parts';
import { LibraryDifferences } from './library-differences';
import {
  categoriesOf,
  flagLines,
  type InstructionChange,
  joinNames,
  type LibraryPost,
  type RowState,
  sourceQuote,
  withChange,
} from './library-model';

const titleProblem = (title: string) =>
  title.trim().length < 2
    ? 'Titlul are cel puțin 2 caractere.'
    : title.trim().length > 200
      ? 'Titlul are cel mult 200 de caractere.'
      : null;

export function InstructionRow({
  row,
  domain,
  postsById,
  readOnly,
  titleTaken,
  onChange,
  onSource,
  onEditBody,
  onPickPosts,
}: {
  row: RowState;
  domain: InstructionDomain;
  postsById: Map<string, LibraryPost>;
  readOnly: boolean;
  titleTaken: boolean;
  onChange: (change: (current: InstructionChange) => InstructionChange) => void;
  onSource: () => void;
  onEditBody: () => void;
  onPickPosts: () => void;
}) {
  const id = useId();
  const { instruction } = row;
  const [title, setTitle] = useState(row.title);
  const [titleError, setTitleError] = useState<string | null>(null);
  const [comparing, setComparing] = useState(false);
  const similar = instruction.status === 'similar';
  const editable = !readOnly && row.included;
  const postNames = row.posts.flatMap((post) => {
    const known = postsById.get(post);
    return known ? [known.name] : [];
  });

  function commitTitle() {
    const problem = titleProblem(title);
    setTitleError(problem);
    if (problem || title.trim() === row.title) return;
    const next = title.trim();
    onChange((current) =>
      withChange(current, 'title', next === instruction.title ? undefined : next)
    );
  }

  const shownTitleError =
    titleError ??
    (titleTaken && !row.usesLibrary
      ? 'Biblioteca are deja o instrucțiune cu acest titlu. Schimbă-l ca să o poți adăuga.'
      : null);

  return (
    <article
      data-testid="library-instruction"
      data-status={instruction.status}
      data-key={instruction.key}
      aria-labelledby={`${id}-title`}
      className={cn(
        'grid gap-3 rounded-xl border bg-card px-4 py-4 shadow-xs sm:px-5',
        !row.included && 'bg-muted/40'
      )}
    >
      <div className="grid grid-cols-[1.25rem_minmax(0,1fr)] items-start gap-x-3 gap-y-1 sm:grid-cols-[1.25rem_minmax(0,1fr)_auto]">
        <Checkbox
          id={`${id}-included`}
          className="mt-1"
          data-testid="library-instruction-included"
          aria-label={`Preia instrucțiunea ${row.title}`}
          checked={row.included}
          disabled={readOnly}
          onCheckedChange={(checked) =>
            onChange((current) =>
              withChange(current, 'included', checked === true ? undefined : false)
            )
          }
        />
        <div className="grid min-w-0 gap-0.5">
          <h3
            id={`${id}-title`}
            className="text-base leading-snug font-semibold wrap-anywhere"
            data-testid="library-instruction-title"
          >
            {row.usesLibrary && instruction.match ? instruction.match.title : row.title}
          </h3>
          <p className="text-[13px] text-muted-foreground">
            {groupLabels[row.category]} ·{' '}
            {articleCountLabel(instruction.articleCount).toLowerCase()}
            {instruction.number && ` · nr. ${instruction.number} în pachet`}
          </p>
        </div>
        <div className="col-start-2 flex flex-wrap gap-1.5 sm:col-start-auto sm:justify-end">
          {similar ? <Tag tone="warning">Asemănătoare</Tag> : <Tag tone="info">Nouă</Tag>}
          {row.edited.body && <EditedTag />}
        </div>
      </div>

      {!row.included ? (
        <p
          className="text-sm text-muted-foreground sm:pl-8"
          data-testid="library-instruction-left-out"
        >
          Nu o preluăm: nu intră în bibliotecă și nu se aplică la niciun post.
        </p>
      ) : (
        <div className="grid gap-3 sm:pl-8">
          {similar && instruction.match && (
            <div
              className="grid gap-2 rounded-lg border border-warning-border bg-warning/30 px-3 py-3"
              data-testid="library-instruction-similar"
            >
              <p className="text-sm">
                Ai deja o instrucțiune care spune același lucru:{' '}
                <strong className="font-semibold">{instruction.match.title}</strong>
              </p>
              <div>
                <LinkButton
                  data-testid="library-instruction-compare"
                  aria-expanded={comparing}
                  onClick={() => setComparing((open) => !open)}
                >
                  {comparing ? 'Ascunde ce diferă' : 'Ce diferă'}
                </LinkButton>
              </div>
              {comparing && <LibraryDifferences instruction={instruction} />}
              <div
                role="radiogroup"
                aria-label={`Ce faci cu ${instruction.match.title}`}
                className="grid gap-2 sm:grid-cols-2"
              >
                {(
                  [
                    [
                      'use_existing',
                      'Folosește ce ai',
                      `Posturile primesc „${instruction.match.title}” din bibliotecă, așa cum e.`,
                    ],
                    [
                      'add_new',
                      'Adaugă ca nouă',
                      'Intră în bibliotecă textul din pachet, ca instrucțiune separată.',
                    ],
                  ] as const
                ).map(([value, label, hint]) => (
                  <label
                    key={value}
                    className="grid cursor-pointer grid-cols-[1rem_minmax(0,1fr)] items-start gap-3 rounded-lg border bg-card px-3 py-2.5"
                  >
                    <input
                      type="radio"
                      name={`${id}-choice`}
                      value={value}
                      data-testid={`library-choice-${value}`}
                      className="mt-1 accent-primary"
                      disabled={readOnly}
                      checked={row.choice === value}
                      onChange={() =>
                        onChange((current) =>
                          withChange(
                            current,
                            'choice',
                            value === instruction.choice ? undefined : value
                          )
                        )
                      }
                    />
                    <span className="grid gap-0.5">
                      <span className="text-sm font-medium">{label}</span>
                      <span className="text-xs text-muted-foreground">{hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {!row.usesLibrary && (
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_15rem]">
              <div className="grid gap-1.5">
                <Label htmlFor={`${id}-title-input`}>Titlu în bibliotecă</Label>
                <Input
                  id={`${id}-title-input`}
                  data-testid="library-instruction-title-input"
                  value={title}
                  disabled={!editable}
                  aria-invalid={Boolean(shownTitleError)}
                  aria-describedby={shownTitleError ? `${id}-title-error` : `${id}-written`}
                  onChange={(event) => {
                    setTitle(event.target.value);
                    setTitleError(null);
                  }}
                  onBlur={commitTitle}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      commitTitle();
                    }
                  }}
                />
                {shownTitleError ? (
                  <span
                    id={`${id}-title-error`}
                    className="text-[13px] text-destructive"
                    data-testid="library-instruction-title-error"
                  >
                    {shownTitleError}
                  </span>
                ) : (
                  instruction.writtenTitle !== row.title && (
                    <span id={`${id}-written`} className="text-[13px] text-muted-foreground">
                      În pachet: {instruction.writtenTitle}
                    </span>
                  )
                )}
              </div>
              <div className="grid content-start gap-1.5">
                <Label htmlFor={`${id}-category`}>Categoria</Label>
                <NativeSelect
                  id={`${id}-category`}
                  data-testid="library-instruction-category"
                  value={row.category}
                  disabled={!editable}
                  onChange={(event) => {
                    const category = event.target.value as InstructionCategory;
                    onChange((current) =>
                      withChange(
                        current,
                        'category',
                        category === instruction.category ? undefined : category
                      )
                    );
                  }}
                >
                  {categoriesOf(domain).map((category) => (
                    <option key={category} value={category}>
                      {groupLabels[category]}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            </div>
          )}

          <div className="grid gap-1 text-sm sm:grid-cols-[8rem_minmax(0,1fr)] sm:gap-x-4">
            <span className="text-muted-foreground">Se aplică la</span>
            <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span data-testid="library-instruction-posts">
                {postNames.length > 0 ? (
                  joinNames(postNames)
                ) : (
                  <span className="text-warning-foreground">
                    niciun post: intră doar în bibliotecă
                  </span>
                )}
              </span>
              {!readOnly && (
                <LinkButton data-testid="library-instruction-pick-posts" onClick={onPickPosts}>
                  {postNames.length > 0 ? 'Schimbă posturile' : 'Alege posturile'}
                </LinkButton>
              )}
            </span>
          </div>

          {instruction.flags.length > 0 && (
            <ul className="grid gap-1" data-testid="library-instruction-flags">
              {flagLines(instruction.flags).map((line) => (
                <li
                  key={line}
                  className="flex items-start gap-2 text-[13px] font-medium text-warning-foreground"
                >
                  <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                  <span>{line}</span>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap gap-x-5 gap-y-2">
            <SourceButton
              sources={[{ file: instruction.location.file, quote: sourceQuote(instruction.body) }]}
              onOpen={onSource}
            />
            {!row.usesLibrary && !readOnly && (
              <LinkButton
                data-testid="library-instruction-edit-body"
                aria-label={`Schimbă textul instrucțiunii ${row.title}`}
                onClick={onEditBody}
              >
                Schimbă
              </LinkButton>
            )}
          </div>
        </div>
      )}
    </article>
  );
}
