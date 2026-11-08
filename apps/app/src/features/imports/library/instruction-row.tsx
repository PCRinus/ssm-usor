import {
  articleCount,
  type InstructionCategory,
  type InstructionDomain,
} from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { Label } from '@ssm-usor/ui/components/label';
import { NativeSelect } from '@ssm-usor/ui/components/native-select';
import { cn } from '@ssm-usor/ui/lib/utils';
import {
  BriefcaseBusiness,
  Building2,
  Flame,
  GitCompare,
  HardHat,
  type LucideIcon,
  Pencil,
  PlugZap,
  Plus,
  Wrench,
} from 'lucide-react';
import { useId, useState } from 'react';

import { Segmented } from '@/components/segmented';
import { articleCountLabel, groupLabels } from '@/features/instructions/instruction-schema';

import { IncludeSwitch } from '../include-switch';
import { EditedTag, SourceButton, Tag } from '../review-parts';
import { DecisionRow, PendingNote, RenameRow, type Tone } from './decision-row';
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
    titleTaken && !row.usesLibrary
      ? 'Biblioteca are deja o instrucțiune cu acest titlu. Schimbă-l ca să o poți adăuga.'
      : null;
  const choiceOpen = similar && !row.choicePicked;
  const pending = editable
    ? [
        ...(shownTitleError && !row.usesLibrary ? ['title'] : []),
        ...(choiceOpen ? ['ce primesc posturile'] : []),
        ...(postNames.length === 0 ? ['posturile'] : []),
      ]
    : [];
  const ask = (open: boolean): Tone => (editable && open ? 'todo' : 'done');

  function pickChoice(choice: Choice) {
    onChange((current) =>
      current.choice === choice ? current : withChange(current, 'choice', choice)
    );
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
      <div className="grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-start gap-x-3.5 gap-y-1.5 px-4 py-4 sm:grid-cols-[2.5rem_minmax(0,1fr)_auto_auto] sm:items-center sm:gap-x-4 sm:px-5">
        <span
          className={cn(
            'flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-secondary',
            editable && 'row-span-2 sm:row-span-1',
            !row.included && 'text-muted-foreground'
          )}
        >
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <div className="col-start-2 row-start-1 grid min-w-0 gap-0.5 sm:self-center">
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
          {row.included && (
            <p className="flex flex-wrap gap-x-3.5 text-[13px] text-muted-foreground">
              {row.usesLibrary && <span>{groupLabels[row.category]}</span>}
              <span>{articleCountLabel(instruction.articleCount).toLowerCase()}</span>
              {instruction.number && <span>nr. {instruction.number} din pachet</span>}
            </p>
          )}
        </div>
        {editable && (
          <div className="col-start-2 row-start-2 sm:col-start-3 sm:row-start-1">
            <PendingNote
              line={pending.length > 0 ? pendingLine(pending) : null}
              testId="library-instruction-pending"
            />
          </div>
        )}
        <IncludeSwitch
          name={row.title}
          included={row.included}
          agreement="feminine"
          disabled={readOnly}
          testId="library-instruction-included"
          className="col-start-3 row-start-1 mt-0.5 justify-self-end sm:col-start-4 sm:mt-0"
          onChange={(checked) =>
            onChange((current) => withChange(current, 'included', checked ? undefined : false))
          }
        />
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
                  <Segmented
                    name={`${id}-choice`}
                    label="Ce primesc posturile"
                    options={choices}
                    value={row.choice}
                    disabled={readOnly}
                    testIdPrefix="library-choice"
                    onPick={pickChoice}
                  />
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
              <RenameRow
                label="Titlul în bibliotecă"
                value={row.title}
                written={instruction.writtenTitle}
                error={shownTitleError}
                editable={editable}
                validate={titleProblem}
                testIdPrefix="library-instruction"
                field="title"
                onCommit={(next) =>
                  onChange((current) =>
                    withChange(current, 'title', next === instruction.title ? undefined : next)
                  )
                }
              />

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
