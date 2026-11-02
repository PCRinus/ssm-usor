import {
  articleCount,
  type InstructionCategory,
  type InstructionDomain,
} from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { Input } from '@ssm-usor/ui/components/input';
import { Label } from '@ssm-usor/ui/components/label';
import { NativeSelect } from '@ssm-usor/ui/components/native-select';
import { Switch } from '@ssm-usor/ui/components/switch';
import { cn } from '@ssm-usor/ui/lib/utils';
import {
  BriefcaseBusiness,
  Building2,
  Check,
  Flame,
  GitCompare,
  HardHat,
  type LucideIcon,
  Pencil,
  PlugZap,
  Plus,
  TriangleAlert,
  Wrench,
} from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';

import { articleCountLabel, groupLabels } from '@/features/instructions/instruction-schema';

import { EditedTag, SourceButton, Tag } from '../review-parts';
import { LibraryDifferences } from './library-differences';
import {
  categoriesOf,
  type Choice,
  flagLines,
  type InstructionChange,
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

const categoryIcons: Record<InstructionCategory, LucideIcon> = {
  work_activity: BriefcaseBusiness,
  work_equipment: Wrench,
  protective_equipment: HardHat,
  premises_activity: Building2,
  installation_equipment: PlugZap,
  hazardous_work: Flame,
};

const choices: readonly { value: Choice; label: string; outcome: string }[] = [
  {
    value: 'use_existing',
    label: 'Cea din bibliotecă',
    outcome: 'Instrucțiunea ta rămâne cum e; textul din pachet nu se adaugă.',
  },
  {
    value: 'add_new',
    label: 'Cea din pachet',
    outcome: 'Textul din pachet intră în bibliotecă ca instrucțiune separată.',
  },
];

type Tone = 'done' | 'todo' | 'info' | 'warning';

const toneLabels: Record<Tone, string> = {
  done: 'Gata',
  todo: 'De ales',
  info: 'De știut',
  warning: 'Atenționare',
};

function StatusDot({ tone }: { tone: Tone }) {
  return (
    <span
      className={cn(
        'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full sm:mt-0',
        tone === 'done' && 'border border-success-border bg-success text-success-foreground',
        tone === 'todo' && 'border border-warning-border bg-warning',
        tone === 'info' && 'border border-info-border bg-info',
        tone === 'warning' && 'text-warning-foreground'
      )}
    >
      <span className="sr-only">{toneLabels[tone]}</span>
      {tone === 'done' && <Check className="size-3" strokeWidth={3} aria-hidden="true" />}
      {tone === 'todo' && <span className="size-2 rounded-full bg-chart-3" aria-hidden="true" />}
      {tone === 'info' && <span className="h-0.5 w-2 rounded-full bg-ring" aria-hidden="true" />}
      {tone === 'warning' && <TriangleAlert className="size-4" aria-hidden="true" />}
    </span>
  );
}

function DecisionRow({
  tone,
  label,
  actions,
  below,
  testId,
  children,
}: {
  tone: Tone;
  label: ReactNode;
  actions?: ReactNode;
  below?: ReactNode;
  testId?: string;
  children: ReactNode;
}) {
  return (
    <div
      data-testid={testId}
      data-tone={tone}
      className={cn(
        'grid grid-cols-[1.25rem_minmax(0,1fr)] items-start gap-x-3 gap-y-1 border-t border-border/70 px-4 py-3 sm:min-h-14 sm:grid-cols-[1.25rem_10.5rem_minmax(0,1fr)_auto] sm:items-center sm:gap-x-4 sm:px-5',
        tone === 'todo' && 'bg-warning/40'
      )}
    >
      <StatusDot tone={tone} />
      <span className="text-sm font-medium">{label}</span>
      <div className="col-start-2 grid min-w-0 gap-1 text-sm sm:col-start-auto">{children}</div>
      {actions && (
        <div className="col-start-2 mt-2 grid gap-2 sm:col-start-auto sm:mt-0 sm:flex sm:flex-wrap sm:justify-end">
          {actions}
        </div>
      )}
      {below && <div className="col-start-2 mt-2 min-w-0 sm:col-span-3">{below}</div>}
    </div>
  );
}

function pendingLine(pending: readonly string[]) {
  if (pending.length > 1) return `Mai ai ${pending.length} lucruri de făcut`;
  return pending[0] === 'title' ? 'Mai ai de schimbat titlul' : `Mai ai de ales ${pending[0]}`;
}

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
  const [renaming, setRenaming] = useState(false);
  const [changingCategory, setChangingCategory] = useState(false);
  const [comparing, setComparing] = useState(false);
  const similar = instruction.status === 'similar';
  const editable = !readOnly && row.included;
  const postNames = row.posts.flatMap((post) => {
    const known = postsById.get(post);
    return known ? [known.name] : [];
  });
  const Icon = categoryIcons[row.category];

  const shownTitleError =
    titleError ??
    (titleTaken && !row.usesLibrary
      ? 'Biblioteca are deja o instrucțiune cu acest titlu. Schimbă-l ca să o poți adăuga.'
      : null);
  const titleOpen = editable && (renaming || Boolean(shownTitleError));
  const choiceOpen = similar && !row.choicePicked;
  const pending = editable
    ? [
        ...(shownTitleError && !row.usesLibrary ? ['title'] : []),
        ...(choiceOpen ? ['ce primesc posturile'] : []),
        ...(postNames.length === 0 ? ['posturile'] : []),
      ]
    : [];
  const ask = (open: boolean): Tone => (editable && open ? 'todo' : 'done');

  function commitTitle() {
    const problem = titleProblem(title);
    setTitleError(problem);
    if (problem) return;
    setRenaming(false);
    const next = title.trim();
    if (next === row.title) return;
    onChange((current) =>
      withChange(current, 'title', next === instruction.title ? undefined : next)
    );
  }

  function pickChoice(choice: Choice) {
    onChange((current) =>
      current.choice === choice ? current : withChange(current, 'choice', choice)
    );
  }

  function cancelTitle() {
    setTitle(row.title);
    setTitleError(null);
    setRenaming(false);
  }

  const shownArticles = articleCountLabel(articleCount(row.body)).toLowerCase();
  const textValue = row.usesLibrary
    ? 'Rămâne cel din biblioteca ta'
    : row.edited.body
      ? `${shownArticles}, modificate de tine`
      : `${shownArticles}, ca în document`;
  const flags = flagLines(instruction.flags);

  return (
    <article
      data-testid="library-instruction"
      data-status={instruction.status}
      data-key={instruction.key}
      aria-labelledby={`${id}-title`}
      className={cn(
        'overflow-hidden rounded-xl border bg-card shadow-xs',
        !row.included && 'bg-muted/40 shadow-none'
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-3 px-4 py-4 sm:flex-nowrap sm:px-5">
        <span
          className={cn(
            'flex size-10 shrink-0 items-center justify-center self-start rounded-[10px] bg-secondary sm:self-center',
            !row.included && 'text-muted-foreground'
          )}
        >
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <div className="grid min-w-0 flex-1 basis-56 gap-0.5">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <h3
              id={`${id}-title`}
              className={cn(
                'text-base leading-snug font-semibold wrap-anywhere',
                !row.included && 'text-muted-foreground'
              )}
              data-testid="library-instruction-title"
            >
              {row.usesLibrary && instruction.match ? instruction.match.title : row.title}
            </h3>
            {row.included &&
              (similar ? <Tag tone="warning">Asemănătoare</Tag> : <Tag tone="info">Nouă</Tag>)}
            {row.included && row.edited.body && <EditedTag>Modificată de tine</EditedTag>}
          </div>
          {row.included ? (
            <p className="flex flex-wrap gap-x-3.5 text-[13px] text-muted-foreground">
              {row.usesLibrary && <span>{groupLabels[row.category]}</span>}
              <span>{articleCountLabel(instruction.articleCount).toLowerCase()}</span>
              {instruction.number && <span>nr. {instruction.number} din pachet</span>}
            </p>
          ) : (
            <p
              className="text-[13px] text-muted-foreground"
              data-testid="library-instruction-left-out"
            >
              Nu o incluzi: nu intră în bibliotecă și nu se aplică la niciun post.
            </p>
          )}
        </div>
        <div className="flex w-full items-center gap-4 sm:w-auto sm:shrink-0">
          {pending.length > 0 ? (
            <span
              className="inline-flex items-center gap-2 text-[13px] font-semibold text-warning-foreground"
              data-testid="library-instruction-pending"
            >
              <span
                className="flex size-4 items-center justify-center rounded-full border border-warning-border bg-warning"
                aria-hidden="true"
              >
                <span className="size-1.5 rounded-full bg-chart-3" />
              </span>
              {pendingLine(pending)}
            </span>
          ) : (
            editable && (
              <span
                className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-success-foreground"
                data-testid="library-instruction-pending"
              >
                <Check className="size-4" aria-hidden="true" />
                Gata de confirmat
              </span>
            )
          )}
          <div className="ml-auto flex items-center gap-2.5 sm:border-l sm:border-border/70 sm:pl-4">
            <Switch
              id={`${id}-included`}
              data-testid="library-instruction-included"
              aria-label={`Inclusă: ${row.title}`}
              checked={row.included}
              disabled={readOnly}
              onCheckedChange={(checked) =>
                onChange((current) => withChange(current, 'included', checked ? undefined : false))
              }
            />
            <Label htmlFor={`${id}-included`} className="text-[13px]" aria-hidden="true">
              Inclusă
            </Label>
          </div>
        </div>
      </div>

      {row.included && (
        <>
          {similar && instruction.match && (
            <>
              <DecisionRow
                tone="info"
                label="Seamănă cu"
                testId="library-instruction-similar"
                actions={
                  <Button
                    type="button"
                    variant="outline"
                    data-testid="library-instruction-compare"
                    aria-expanded={comparing}
                    onClick={() => setComparing((open) => !open)}
                  >
                    <GitCompare aria-hidden="true" />
                    {comparing ? 'Ascunde ce diferă' : 'Vezi ce diferă'}
                  </Button>
                }
                below={comparing && <LibraryDifferences instruction={instruction} />}
              >
                <span>
                  <strong className="font-semibold">{instruction.match.title}</strong>{' '}
                  <span className="text-muted-foreground">din biblioteca ta</span>
                </span>
              </DecisionRow>
              <DecisionRow
                tone={ask(choiceOpen)}
                label="Ce primesc posturile"
                actions={
                  <div
                    role="radiogroup"
                    aria-label="Ce primesc posturile"
                    className="grid grid-cols-2 rounded-lg border border-input bg-secondary p-0.5 sm:inline-flex"
                  >
                    {choices.map((choice) => (
                      <label
                        key={choice.value}
                        className="relative inline-flex h-[30px] cursor-pointer items-center justify-center rounded-md px-3.5 text-sm font-medium whitespace-nowrap text-muted-foreground has-checked:bg-card has-checked:font-semibold has-checked:text-foreground has-checked:shadow-xs has-focus-visible:ring-[3px] has-focus-visible:ring-ring/50 has-disabled:cursor-not-allowed"
                      >
                        <input
                          type="radio"
                          name={`${id}-choice`}
                          value={choice.value}
                          data-testid={`library-choice-${choice.value}`}
                          className="absolute inset-0 m-0 size-full cursor-pointer appearance-none opacity-0 disabled:cursor-not-allowed"
                          disabled={readOnly}
                          checked={row.choice === choice.value}
                          onChange={() => pickChoice(choice.value)}
                          // A checked radio fires no change, and picking the proposed choice is
                          // what clears the row's question.
                          onClick={() => pickChoice(choice.value)}
                        />
                        {choice.label}
                      </label>
                    ))}
                  </div>
                }
              >
                <span className={cn(choiceOpen && editable && 'text-warning-foreground')}>
                  {choices.find((choice) => choice.value === row.choice)?.outcome}
                </span>
              </DecisionRow>
            </>
          )}

          {!row.usesLibrary && (
            <>
              <DecisionRow
                tone={ask(Boolean(shownTitleError))}
                label={
                  titleOpen ? (
                    <Label htmlFor={`${id}-title-input`}>Titlul în bibliotecă</Label>
                  ) : (
                    'Titlul în bibliotecă'
                  )
                }
                actions={
                  editable &&
                  (titleOpen ? (
                    <>
                      <Button type="button" variant="outline" onClick={cancelTitle}>
                        Renunță
                      </Button>
                      <Button
                        type="button"
                        data-testid="library-instruction-title-save"
                        onClick={commitTitle}
                      >
                        Salvează titlul
                      </Button>
                    </>
                  ) : (
                    <Button
                      type="button"
                      variant="outline"
                      data-testid="library-instruction-rename"
                      onClick={() => {
                        setTitle(row.title);
                        setRenaming(true);
                      }}
                    >
                      <Pencil aria-hidden="true" />
                      Redenumește
                    </Button>
                  ))
                }
              >
                {titleOpen ? (
                  <Input
                    id={`${id}-title-input`}
                    data-testid="library-instruction-title-input"
                    value={title}
                    autoFocus={renaming}
                    aria-invalid={Boolean(shownTitleError)}
                    aria-describedby={shownTitleError ? `${id}-title-error` : `${id}-written`}
                    onChange={(event) => {
                      setTitle(event.target.value);
                      setTitleError(null);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        commitTitle();
                      } else if (event.key === 'Escape') {
                        event.preventDefault();
                        cancelTitle();
                      }
                    }}
                  />
                ) : (
                  <span className="wrap-anywhere" data-testid="library-instruction-library-title">
                    {row.title}
                  </span>
                )}
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
                    <span
                      id={`${id}-written`}
                      className="truncate text-[13px] text-muted-foreground"
                      title={instruction.writtenTitle}
                    >
                      Din document: {instruction.writtenTitle}
                    </span>
                  )
                )}
              </DecisionRow>

              <DecisionRow
                tone="done"
                label={
                  changingCategory ? (
                    <Label htmlFor={`${id}-category`}>Categoria</Label>
                  ) : (
                    'Categoria'
                  )
                }
                actions={
                  editable &&
                  !changingCategory && (
                    <Button
                      type="button"
                      variant="outline"
                      data-testid="library-instruction-change-category"
                      onClick={() => setChangingCategory(true)}
                    >
                      Schimbă categoria
                    </Button>
                  )
                }
              >
                {editable && changingCategory ? (
                  <NativeSelect
                    id={`${id}-category`}
                    data-testid="library-instruction-category"
                    value={row.category}
                    autoFocus
                    onBlur={() => setChangingCategory(false)}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') setChangingCategory(false);
                    }}
                    onChange={(event) => {
                      const category = event.target.value as InstructionCategory;
                      setChangingCategory(false);
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
                ) : (
                  <span data-testid="library-instruction-category-name">
                    {groupLabels[row.category]}
                  </span>
                )}
              </DecisionRow>
            </>
          )}

          <DecisionRow
            tone={ask(postNames.length === 0)}
            label="Posturile"
            actions={
              !readOnly && (
                <Button
                  type="button"
                  variant={postNames.length > 0 ? 'outline' : 'default'}
                  data-testid="library-instruction-pick-posts"
                  onClick={onPickPosts}
                >
                  {postNames.length === 0 && <Plus aria-hidden="true" />}
                  {postNames.length > 0 ? 'Schimbă posturile' : 'Alege posturile'}
                </Button>
              )
            }
          >
            {postNames.length > 0 ? (
              <ul className="flex flex-wrap gap-1.5" data-testid="library-instruction-posts">
                {postNames.map((name) => (
                  <li
                    key={name}
                    className="inline-flex h-7 items-center rounded-full border bg-secondary/60 px-2.5 text-[13px] font-medium"
                    data-testid="library-instruction-post"
                  >
                    {name}
                  </li>
                ))}
              </ul>
            ) : (
              <span
                className={cn(editable && 'text-warning-foreground')}
                data-testid="library-instruction-posts"
              >
                Niciunul încă. Fără posturi, intră doar în bibliotecă.
              </span>
            )}
          </DecisionRow>

          <DecisionRow
            tone={flags.length > 0 ? 'warning' : 'done'}
            label="Textul"
            actions={
              <>
                <SourceButton
                  outlined
                  label="Vezi în document"
                  sources={[
                    { file: instruction.location.file, quote: sourceQuote(instruction.body) },
                  ]}
                  onOpen={onSource}
                />
                {!row.usesLibrary && !readOnly && (
                  <Button
                    type="button"
                    variant="outline"
                    data-testid="library-instruction-edit-body"
                    aria-label={`Editează textul instrucțiunii ${row.title}`}
                    onClick={onEditBody}
                  >
                    <Pencil aria-hidden="true" />
                    Editează textul
                  </Button>
                )}
              </>
            }
          >
            <span>{textValue}</span>
            {flags.length > 0 && (
              <ul className="grid gap-1" data-testid="library-instruction-flags">
                {flags.map((line) => (
                  <li key={line} className="text-[13px] font-medium text-warning-foreground">
                    {line}
                  </li>
                ))}
              </ul>
            )}
          </DecisionRow>
        </>
      )}
    </article>
  );
}
