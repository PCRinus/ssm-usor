import { Button } from '@ssm-usor/ui/components/button';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Link } from '@tanstack/react-router';
import {
  BookOpen,
  BriefcaseBusiness,
  GitCompare,
  ListChecks,
  type LucideIcon,
  Plus,
  UserRound,
  UsersRound,
} from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';

import { Segmented } from '@/components/segmented';
import { roCount } from '@/features/employees/employee-format';

import type { LabelledSource } from '../review-model';
import { SourceButton, Tag } from '../review-parts';
import { DecisionRow, PendingNote, RenameRow, type Tone } from './decision-row';
import { RiskDifferences } from './risk-differences';
import { RiskFactorRows } from './risk-factor-rows';
import { RiskPlanRows } from './risk-plan-rows';
import {
  type ExistingChoice,
  existingChoiceLabels,
  existingOutcome,
  factorsLabel,
  type FactorState,
  kindLabels,
  type LibraryChoice,
  libraryChoiceLabels,
  type LibraryName,
  nameNote,
  nameSuggestions,
  needsCheck,
  pendingLine,
  pendingOf,
  removedByMember,
  type RiskSheet,
  type SheetChange,
  sheetFlagText,
  type SheetState,
  similarCounts,
  takenNameProblem,
  usedOutcome,
  withField,
} from './risks-model';

const kindIcons: Record<RiskSheet['kind'], LucideIcon> = {
  job_position: BriefcaseBusiness,
  sensitive_groups: UsersRound,
  other: UserRound,
};

const existingOptions = (['append', 'replace', 'keep'] as const).map((value) => ({
  value,
  label: existingChoiceLabels[value],
}));

const libraryOptions = (['use_existing', 'add_new'] as const).map((value) => ({
  value,
  label: libraryChoiceLabels[value],
}));

const lengthProblem = (name: string) =>
  name.trim().length < 2
    ? 'Numele are cel puțin 2 caractere.'
    : name.trim().length > 160
      ? 'Numele are cel mult 160 de caractere.'
      : null;

const textNames = [
  ['meansOfProduction', 'mijloacele de producție'],
  ['workEnvironment', 'mediul de muncă'],
  ['exposure', 'expunerea'],
] as const;

function textsLine(sheet: RiskSheet) {
  const found = textNames.flatMap(([field, name]) => (sheet[field] ? [name] : []));
  if (found.length === 0) return 'Nu am găsit în document textele sistemului de muncă.';
  const names =
    found.length === 1 ? found[0]! : `${found.slice(0, -1).join(', ')} și ${found.at(-1)}`;
  return `${names.charAt(0).toUpperCase()}${names.slice(1)}, ca în document.`;
}

function statusTag(state: SheetState) {
  const { sheet } = state;
  if (sheet.copyOf !== null) return <Tag tone="muted">La fel ca alta din pachet</Tag>;
  if (sheet.factors.length === 0) return <Tag tone="destructive">Fără factori</Tag>;
  if (state.posts === null) return <Tag tone="muted">Doar la client</Tag>;
  if (sheet.status === 'identical') return <Tag tone="success">În biblioteca ta</Tag>;
  if (sheet.status === 'similar') return <Tag tone="warning">Asemănătoare</Tag>;
  return <Tag tone="info">Nouă</Tag>;
}

export function RiskSheetCard({
  state,
  original,
  readOnly,
  nameTaken,
  refused,
  libraryNames,
  packNames,
  onSheet,
  onToggleFactor,
  onSetIncluded,
  onEditFactor,
  onPickPosts,
  onSource,
}: {
  state: SheetState;
  original: RiskSheet | null;
  readOnly: boolean;
  nameTaken: boolean;
  refused: ReadonlySet<string>;
  libraryNames: readonly LibraryName[];
  // The names the pack's other new entries take.
  packNames: readonly string[];
  onSheet: (change: (current: SheetChange) => SheetChange) => void;
  onToggleFactor: (factor: FactorState, included: boolean) => void;
  onSetIncluded: (factors: readonly FactorState[], included: boolean) => void;
  onEditFactor: (factor: FactorState) => void;
  onPickPosts: () => void;
  onSource: (source: LabelledSource) => void;
}) {
  const id = useId();
  const { sheet } = state;
  const [comparing, setComparing] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const pending = readOnly ? [] : pendingOf(state, nameTaken);
  const ask = (open: boolean): Tone => (!readOnly && open ? 'todo' : 'done');
  const Icon = kindIcons[sheet.kind];
  const unread = sheet.factors.length === 0;
  const swapped = sheet.flags.find((flag) => flag.kind === 'classes_swapped');
  const textFlags = sheet.flags.filter((flag) => flag.kind !== 'classes_swapped');
  const removed = state.factors.filter(removedByMember);
  const allRemoved = removed.length === state.factors.length;
  const attention = state.factors.filter(
    (factor) =>
      refused.has(factor.factor.key) || (!factor.included && !factor.complete) || needsCheck(factor)
  );
  // A factor fixed while the list is folded stays in it, so it does not vanish under the pointer.
  const [listed, setListed] = useState(() => new Set(attention.map((factor) => factor.factor.key)));
  if (attention.some((factor) => !listed.has(factor.factor.key))) {
    setListed(new Set([...listed, ...attention.map((factor) => factor.factor.key)]));
  }
  const shown =
    showAll || allRemoved
      ? state.factors
      : state.factors.filter((factor) => listed.has(factor.factor.key));
  const folded = !showAll && !allRemoved && shown.length < state.factors.length;
  const sheetSource: LabelledSource = { file: sheet.file, quote: sheet.heading };

  const pickLibrary = (choice: LibraryChoice) =>
    onSheet((current) =>
      current.library === choice ? current : withField(current, 'library', choice)
    );
  const pickExisting = (reference: string | null, choice: ExistingChoice) =>
    onSheet((current) =>
      reference === null
        ? withField(current, 'existingChoice', choice)
        : withField(current, 'postChoices', { ...current.postChoices, [reference]: choice })
    );

  return (
    <article
      data-testid="risk-import-sheet"
      data-key={sheet.key}
      data-status={sheet.copyOf !== null ? 'copy' : (sheet.status ?? 'unread')}
      aria-labelledby={`${id}-heading`}
      className="scroll-mt-32 overflow-hidden rounded-xl border bg-card shadow-xs"
    >
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-3 px-4 py-4 sm:flex-nowrap sm:px-5">
        <span className="flex size-10 shrink-0 items-center justify-center self-start rounded-[10px] bg-secondary sm:self-center">
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <div className="grid min-w-0 flex-1 basis-56 gap-0.5">
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <h3
              id={`${id}-heading`}
              className="text-base leading-snug font-semibold wrap-anywhere"
              data-testid="risk-import-sheet-heading"
            >
              {sheet.heading}
            </h3>
            {statusTag(state)}
          </div>
          <p className="flex flex-wrap gap-x-3.5 text-[13px] text-muted-foreground">
            <span data-testid="risk-import-sheet-kind">{kindLabels[sheet.kind]}</span>
            {!unread && <span>{factorsLabel(sheet.factors.length)}</span>}
          </p>
        </div>
        {!readOnly && !unread && (
          <div className="flex w-full items-center gap-4 sm:w-auto sm:shrink-0">
            <PendingNote
              line={pending.length > 0 ? pendingLine(pending) : null}
              testId="risk-import-sheet-pending"
            />
          </div>
        )}
      </div>

      {unread ? (
        <DecisionRow
          tone="warning"
          label="Factorii"
          actions={
            <SourceButton
              outlined
              label="Vezi în document"
              sources={[sheetSource]}
              onOpen={() => onSource(sheetSource)}
            />
          }
        >
          <span>
            {sheet.flags.map(sheetFlagText).join(' ') || 'Nu am găsit niciun factor în tabelul ei.'}{' '}
            Fișa nu se preia; o completezi pe pagina clientului.
          </span>
        </DecisionRow>
      ) : (
        <>
          <ClientRow
            state={state}
            readOnly={readOnly}
            tone={ask(state.postsOpen || state.postsGone)}
            onPickPosts={onPickPosts}
            onLibraryOnly={() => onSheet((current) => withField(current, 'posts', []))}
          />

          {state.targets
            .filter((target) => target.existing > 0)
            .map((target) => (
              <DecisionRow
                key={target.reference}
                tone="done"
                label="Fișa existentă"
                testId="risk-import-existing"
                actions={
                  <Segmented
                    name={`${id}-existing-${target.reference}`}
                    label={`Fișa existentă a postului ${target.post.name}`}
                    options={existingOptions}
                    value={target.choice}
                    disabled={readOnly}
                    testIdPrefix="risk-import-existing"
                    phone="stacked"
                    onPick={(choice) => pickExisting(target.reference, choice)}
                  />
                }
              >
                <span>
                  {state.targets.length === 1 ? 'Postul' : target.post.name} are deja o fișă cu{' '}
                  {factorsLabel(target.existing)}.
                </span>
                <span className="text-[13px] text-muted-foreground">
                  {existingOutcome(target.choice, target.existing)}
                </span>
              </DecisionRow>
            ))}
          {state.existing && (
            <DecisionRow
              tone="done"
              label="Fișa existentă"
              testId="risk-import-existing"
              actions={
                <Segmented
                  name={`${id}-existing`}
                  label="Fișa existentă a clientului"
                  options={existingOptions}
                  value={state.existing.choice}
                  disabled={readOnly}
                  testIdPrefix="risk-import-existing"
                  phone="stacked"
                  onPick={(choice) => pickExisting(null, choice)}
                />
              }
            >
              <span>
                Clientul are deja această fișă, cu {factorsLabel(state.existing.factors)}.
              </span>
              <span className="text-[13px] text-muted-foreground">
                {existingOutcome(state.existing.choice, state.existing.factors)}
              </span>
            </DecisionRow>
          )}

          <LibraryRows
            state={state}
            original={original}
            readOnly={readOnly}
            nameTaken={nameTaken}
            libraryNames={libraryNames}
            packNames={packNames}
            comparing={comparing}
            onCompare={() => setComparing((open) => !open)}
            name={`${id}-library`}
            tone={ask(pending.includes('library'))}
            onPick={pickLibrary}
            onRename={(next) =>
              onSheet((current) =>
                withField(current, 'libraryName', next === sheet.libraryName ? undefined : next)
              )
            }
          />

          <DecisionRow
            tone="done"
            label="Sistemul de muncă"
            actions={
              <SourceButton
                outlined
                label="Vezi în document"
                sources={[sheetSource]}
                onOpen={() => onSource(sheetSource)}
              />
            }
          >
            <span>{textsLine(sheet)}</span>
            {textFlags.length > 0 && (
              <ul className="grid gap-1">
                {textFlags.map((flag, index) => (
                  <li key={index} className="text-[13px] font-medium text-warning-foreground">
                    {sheetFlagText(flag)}
                  </li>
                ))}
              </ul>
            )}
          </DecisionRow>

          <DecisionRow
            tone={attention.length > 0 || swapped ? 'warning' : 'done'}
            label="Factorii"
            testId="risk-import-factors-row"
            actions={
              allRemoved ? (
                !readOnly && (
                  <Button
                    type="button"
                    variant="outline"
                    data-testid="risk-import-restore-all"
                    onClick={() => onSetIncluded(removed, true)}
                  >
                    {removed.length === 1 ? 'Include-l' : 'Include-i pe toți'}
                  </Button>
                )
              ) : (
                <Button
                  type="button"
                  variant="outline"
                  data-testid="risk-import-show-factors"
                  aria-expanded={showAll}
                  onClick={() => setShowAll((open) => !open)}
                >
                  <ListChecks aria-hidden="true" />
                  {showAll
                    ? listed.size > 0
                      ? 'Arată doar ce e de verificat'
                      : 'Ascunde factorii'
                    : `Arată toți cei ${state.factors.length}`}
                </Button>
              )
            }
          >
            <span data-testid="risk-import-factors-summary">
              {allRemoved
                ? removed.length === 1
                  ? 'Singurul factor nu e inclus.'
                  : `Niciunul dintre cei ${removed.length} factori nu e inclus.`
                : factorsLine(state, removed.length)}
            </span>
            {!readOnly && (
              <span className="text-[13px] text-muted-foreground">
                {state.posts === null
                  ? 'Un factor oprit nu ajunge pe fișa clientului.'
                  : 'Un factor oprit nu intră nici în bibliotecă, nici pe fișa postului.'}
              </span>
            )}
            {swapped && (
              <span
                className="text-[13px] font-medium text-warning-foreground"
                data-testid="risk-import-classes-swapped"
              >
                {sheetFlagText(swapped)}
              </span>
            )}
            {listed.size > 0 && folded && (
              <span className="text-[13px] text-muted-foreground">
                Mai jos sunt doar cei de verificat.
              </span>
            )}
          </DecisionRow>
          {shown.length > 0 && (
            <RiskFactorRows
              factors={shown}
              sheetFile={sheet.file}
              readOnly={readOnly}
              refused={refused}
              onToggle={onToggleFactor}
              onEdit={onEditFactor}
              onSource={onSource}
            />
          )}
          <RiskPlanRows
            state={state}
            readOnly={readOnly}
            onAdd={onEditFactor}
            onRemove={(row) => onToggleFactor(row, false)}
            onSource={onSource}
          />
        </>
      )}
    </article>
  );
}

function factorsLine(state: SheetState, removed: number) {
  const taken = state.factors.filter((factor) => factor.included && factor.complete).length;
  const parts = [roCount(taken, 'preluat', 'preluați')];
  if (state.toCheck > 0) parts.push(`${state.toCheck} de verificat`);
  if (state.incomplete > 0) parts.push(roCount(state.incomplete, 'incomplet', 'incompleți'));
  if (removed > 0) parts.push(removed === 1 ? 'unul nu e inclus' : `${removed} nu sunt incluși`);
  return parts.join(', ');
}

function ClientRow({
  state,
  readOnly,
  tone,
  onPickPosts,
  onLibraryOnly,
}: {
  state: SheetState;
  readOnly: boolean;
  tone: Tone;
  onPickPosts: () => void;
  onLibraryOnly: () => void;
}) {
  const { sheet } = state;
  if (state.posts === null) {
    return (
      <DecisionRow tone="done" label="La client" testId="risk-import-client">
        <span>
          {sheet.kind === 'sensitive_groups'
            ? 'Fișa grupurilor sensibile'
            : `Fișa „${sheet.name}”, în afara posturilor`}
        </span>
        <span className="text-[13px] text-muted-foreground" data-testid="risk-import-client-only">
          Nu ține de un post, așa că rămâne doar la client și nu intră în bibliotecă.
        </span>
      </DecisionRow>
    );
  }
  const names = state.targets.map((target) => target.post.name);
  return (
    <DecisionRow
      tone={tone}
      label="Posturile"
      testId="risk-import-client"
      actions={
        !readOnly &&
        (state.postsOpen ? (
          <>
            <Button type="button" data-testid="risk-import-pick-posts" onClick={onPickPosts}>
              <Plus aria-hidden="true" />
              Alege posturile
            </Button>
            <Button
              type="button"
              variant="outline"
              data-testid="risk-import-library-only"
              onClick={onLibraryOnly}
            >
              Doar în bibliotecă
            </Button>
          </>
        ) : (
          <Button
            type="button"
            variant="outline"
            data-testid="risk-import-pick-posts"
            onClick={onPickPosts}
          >
            {names.length > 0 ? 'Schimbă posturile' : 'Alege posturile'}
          </Button>
        ))
      }
    >
      {state.postsOpen ? (
        <>
          <span>
            Titlul nu numește niciun post al clientului:{' '}
            <q className="wrap-anywhere">{sheet.name}</q>.
          </span>
          <span className={cn(!readOnly && 'text-warning-foreground')}>
            Alege postul pe care îl evaluează sau las-o doar în bibliotecă.
          </span>
        </>
      ) : names.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5" data-testid="risk-import-posts">
          {names.map((name) => (
            <li
              key={name}
              className="inline-flex h-7 items-center rounded-full border bg-secondary/60 px-2.5 text-[13px] font-medium"
              data-testid="risk-import-post"
            >
              {name}
            </li>
          ))}
        </ul>
      ) : (
        <span data-testid="risk-import-posts">Niciun post: rămâne doar în bibliotecă.</span>
      )}
      {state.postsGone && !readOnly && (
        <span className="text-warning-foreground" data-testid="risk-import-posts-gone">
          Un post ales nu mai este printre posturile clientului. Alege din nou posturile.
        </span>
      )}
    </DecisionRow>
  );
}

const strong = (value: ReactNode) => <strong className="font-semibold">{value}</strong>;

function LibraryLink({ id, children }: { id: string; children: ReactNode }) {
  return (
    <Link
      to="/evaluari-de-risc/$profileId"
      params={{ profileId: id }}
      target="_blank"
      rel="noopener noreferrer"
      className="w-fit text-[13px] font-medium text-foreground underline underline-offset-4 hover:text-primary"
      data-testid="risk-import-library-link"
    >
      {children}
    </Link>
  );
}

function LibraryRows({
  state,
  original,
  readOnly,
  nameTaken,
  libraryNames,
  packNames,
  comparing,
  onCompare,
  name,
  tone,
  onPick,
  onRename,
}: {
  state: SheetState;
  original: RiskSheet | null;
  readOnly: boolean;
  nameTaken: boolean;
  libraryNames: readonly LibraryName[];
  packNames: readonly string[];
  comparing: boolean;
  onCompare: () => void;
  name: string;
  tone: Tone;
  onPick: (choice: LibraryChoice) => void;
  onRename: (name: string) => void;
}) {
  const { sheet } = state;
  if (sheet.copyOf !== null) {
    return (
      <DecisionRow tone="done" label="În bibliotecă" testId="risk-import-library">
        <span>
          La fel ca „{original?.heading ?? 'alta'}” din pachet, așa că urmează alegerea ei.
        </span>
      </DecisionRow>
    );
  }
  if (state.posts === null) return null;
  if (sheet.status === 'identical' && sheet.match) {
    return (
      <DecisionRow
        tone="done"
        label="În bibliotecă"
        testId="risk-import-library"
        actions={
          <Button asChild variant="outline">
            <Link
              to="/evaluari-de-risc/$profileId"
              params={{ profileId: sheet.match.evaluationId }}
              target="_blank"
              data-testid="risk-import-library-open"
            >
              <BookOpen aria-hidden="true" />
              Deschide în bibliotecă
            </Link>
          </Button>
        }
      >
        <span data-testid="risk-import-library-outcome">
          Folosește evaluarea din bibliotecă: {strong(sheet.match.name)}.
        </span>
        <span className="text-[13px] text-muted-foreground">
          Are aceiași factori și aceleași clase, așa că nu adăugăm una nouă. Factorii scriși pe fișa
          postului se leagă de ea.
        </span>
      </DecisionRow>
    );
  }

  const similar = sheet.status === 'similar' && sheet.match;
  const choice = state.options.includes(state.choice as LibraryChoice)
    ? (state.choice as LibraryChoice)
    : null;
  const segmented = state.options.length > 0 && (
    <Segmented
      name={name}
      label="În bibliotecă"
      options={libraryOptions}
      value={state.choicePicked ? choice : null}
      disabled={readOnly}
      testIdPrefix="risk-import-library"
      phone="stacked"
      onPick={onPick}
    />
  );
  const similarRow = similar && (
    <DecisionRow
      tone="info"
      label="Seamănă cu"
      testId="risk-import-similar"
      actions={
        <Button
          type="button"
          variant="outline"
          data-testid="risk-import-compare"
          aria-expanded={comparing}
          onClick={onCompare}
        >
          <GitCompare aria-hidden="true" />
          {comparing ? 'Ascunde ce diferă' : 'Ce diferă'}
        </Button>
      }
      below={comparing && <RiskDifferences sheet={sheet} />}
    >
      <span>Ai deja o evaluare asemănătoare: {strong(similar.name)}.</span>
      <span className="text-[13px] text-muted-foreground" data-testid="risk-import-similar-counts">
        {similarCounts(similar)}
      </span>
    </DecisionRow>
  );

  if (state.written === 0) {
    return (
      <>
        {similarRow}
        <DecisionRow tone="done" label="În bibliotecă" testId="risk-import-library">
          <span data-testid="risk-import-library-outcome">
            Fără factori, nu intră în bibliotecă și nu ajunge pe fișa postului.
          </span>
        </DecisionRow>
      </>
    );
  }

  if (!state.createsEntry || (state.options.length > 0 && !state.choicePicked)) {
    return (
      <>
        {similarRow}
        <DecisionRow
          tone={tone}
          label="În bibliotecă"
          testId="risk-import-library"
          actions={segmented}
        >
          <span
            className={cn(tone === 'todo' && 'text-warning-foreground')}
            data-testid="risk-import-library-outcome"
          >
            {state.choicePicked && choice === 'use_existing'
              ? usedOutcome(state)
              : 'Alege dacă folosești evaluarea ta sau o adaugi pe aceasta separat.'}
          </span>
        </DecisionRow>
      </>
    );
  }

  const note = nameNote(state, libraryNames);
  const suggestions = nameSuggestions(state, libraryNames, packNames);
  return (
    <>
      {similarRow}
      <RenameRow
        label="În bibliotecă"
        value={state.libraryName}
        written={null}
        error={
          nameTaken
            ? 'Biblioteca are deja o evaluare cu acest nume. Schimbă-l ca să o poți adăuga.'
            : null
        }
        editable={!readOnly}
        validate={(next) =>
          lengthProblem(next) ??
          (next.trim() === state.libraryName
            ? null
            : takenNameProblem(next, libraryNames, packNames))
        }
        testIdPrefix="risk-import-sheet"
        field="name"
        testId="risk-import-library"
        display={(value) =>
          similar ? (
            <>Intră separat, cu numele {strong(value)}.</>
          ) : (
            <>Intră ca evaluare nouă, cu numele {strong(value)}.</>
          )
        }
        note={
          note && (
            <span
              className="grid justify-items-start gap-1 text-[13px] text-muted-foreground"
              data-testid="risk-import-library-name-note"
            >
              <span>{note.text}</span>
              {note.entry && (
                <LibraryLink id={note.entry.id}>Vezi pe cea din bibliotecă</LibraryLink>
              )}
            </span>
          )
        }
        actions={segmented}
        suggestions={suggestions}
        onCommit={onRename}
      />
    </>
  );
}
