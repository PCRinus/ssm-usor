import {
  legalMaxTrainingInterval,
  type StaffCategory,
  type TrainingDomain,
} from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { Input } from '@ssm-usor/ui/components/input';
import { NativeSelect, NativeSelectOption } from '@ssm-usor/ui/components/native-select';
import { Link } from '@tanstack/react-router';
import {
  Briefcase,
  CalendarClock,
  ClipboardList,
  GitCompare,
  Split,
  TriangleAlert,
} from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';

import { Segmented } from '@/components/segmented';
import { monthNames } from '@/features/training/document-details-schema';
import { TrainingScheduleFields } from '@/features/training/schedule-fields';
import { categoriesWithPosts, lawOf } from '@/features/training/schedule-rules';

import { PendingNote } from './library/decision-row';
import type { FieldContext } from './review-fields';
import { anchorOf, type FieldState, formatFieldValue } from './review-model';
import {
  EditedTag,
  KindLine,
  PickList,
  PickOption,
  RowNote,
  SourceButton,
  SourceFileNames,
  Tag,
} from './review-parts';
import {
  durationChoices,
  intervalChoicesOf,
  keptPosts,
  numberChange,
  schedulePaths,
  type TrainingField,
  trainingField,
} from './training-category';

type Kind = 'interval' | 'firstMonth' | 'day' | 'duration';

const words: Record<
  Kind,
  {
    several: string;
    pick: string;
    other: string;
    otherHint: string;
    differs: string;
    outside: string;
  }
> = {
  interval: {
    several: 'intervale',
    pick: 'Alege-l pe cel de acum.',
    other: 'Alt interval',
    otherHint: 'Îl alegi tu, dacă niciunul nu mai e valabil.',
    differs: 'alt interval',
    outside: 'un interval care nu e în listă. Alege-l pe cel de acum.',
  },
  duration: {
    several: 'durate',
    pick: 'Alege-o pe cea de acum.',
    other: 'Altă durată',
    otherHint: 'O alegi tu, dacă niciuna nu mai e valabilă.',
    differs: 'altă durată',
    outside: 'o durată care nu e în listă. Alege-o pe cea de acum.',
  },
  firstMonth: {
    several: 'prime luni',
    pick: 'Alege-o pe cea de acum.',
    other: 'Altă lună',
    otherHint: 'O alegi tu, dacă niciuna nu mai e valabilă.',
    differs: 'altă primă lună',
    outside: 'o lună care nu e în listă. Alege-o pe cea de acum.',
  },
  day: {
    several: 'zile',
    pick: 'Alege-o pe cea de acum.',
    other: 'Altă zi',
    otherHint: 'O scrii tu, dacă niciuna nu mai e valabilă.',
    differs: 'altă zi',
    outside: 'o zi care nu e în calendar. Alege-o pe cea de acum.',
  },
};

const titles: Record<
  TrainingDomain,
  { title: string; description: string; icon: typeof ClipboardList }
> = {
  ssm: {
    title: 'Instruire SSM',
    description: 'Intră în documentele SSM ale clientului.',
    icon: ClipboardList,
  },
  su: {
    title: 'Instruire SU',
    description: 'Intră în documentele SU ale clientului.',
    icon: CalendarClock,
  },
};

const capitalized = (text: string) => text.charAt(0).toLocaleUpperCase('ro') + text.slice(1);

const shown = (path: string, value: string | number | null) =>
  capitalized(formatFieldValue(path, value));

function SourceLine({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-[13px] text-muted-foreground">
      {children}
      {action}
    </div>
  );
}

// An edited value has no option of its own, so its line points at what the documents gave.
const documentsSources = (state: FieldState) =>
  state.sources.length > 0
    ? state.sources
    : state.own.flatMap((index) => state.options[index]?.sources ?? []);

function sourceLine(field: TrainingField, context: FieldContext, label: string): ReactNode {
  const { state } = field;
  const sources = documentsSources(state);
  const button = (
    <SourceButton sources={sources} onOpen={() => context.openSource(label, sources)} />
  );
  if (context.existingClient && state.existing !== null && state.existing !== '') {
    if (state.own.length === 0) return <SourceLine>Doar în aplicație.</SourceLine>;
    if (state.comparison === 'same' && !state.edited) {
      return <SourceLine action={button}>La fel în documente.</SourceLine>;
    }
  }
  if (state.edited && state.proposedValue !== null) {
    return (
      <SourceLine action={button}>
        <EditedTag />
        <span>Din documente: {formatFieldValue(state.path, state.proposedValue)}.</span>
      </SourceLine>
    );
  }
  if (state.option !== null && !state.edited) {
    const inferred = state.options[state.option]?.inferred === 'ssm_training_schedule';
    return inferred ? (
      <SourceLine>
        Preluată din programul de instruire SSM, fiindcă documentele SU nu o dau. Poți s-o schimbi.
      </SourceLine>
    ) : (
      <SourceLine action={button}>Din documente.</SourceLine>
    );
  }
  if (state.own.length === 0 && !state.edited) {
    return <SourceLine>Lipsește din documente.</SourceLine>;
  }
  return null;
}

function withoutReplace(change: Record<string, unknown> | undefined) {
  const rest = Object.fromEntries(
    Object.entries(change ?? {}).filter(([key]) => key !== 'replace')
  );
  return Object.keys(rest).length ? rest : null;
}

/**
 * A field the documents leave to the member: their values in boxes and the form's control behind
 * "Alt…", or the app's value against the documents' one for a client that has it.
 */
function FieldPicker({
  field,
  kind,
  context,
  label,
  control,
  legal,
}: {
  field: TrainingField;
  kind: Kind;
  context: FieldContext;
  label: string;
  control: ReactNode;
  legal?: { months: number; law: string };
}) {
  const name = useId();
  const { state } = field;
  const text = words[kind];
  const change = context.changes.fields[state.path];
  const [otherOpen, setOtherOpen] = useState(
    field.mode === 'outside' ||
      (state.edited && (field.mode !== 'legal_maximum' || field.value !== legal?.months))
  );
  const open = field.mode === 'outside' || otherOpen;
  const sourceButton = (sources = state.sources) => (
    <SourceButton sources={sources} onOpen={() => context.openSource(label, sources)} />
  );
  const other = (
    <PickOption
      name={name}
      checked={open}
      inDocuments={field.settled}
      onPick={() => setOtherOpen(true)}
      heading={text.other}
      testId="review-training-other"
      below={open && control}
    >
      {!open && <span className="text-muted-foreground">{text.otherHint}</span>}
    </PickOption>
  );

  if (field.mode === 'differs') {
    const replaced = state.comparison === 'replaced';
    return (
      <div className="grid gap-2" data-testid="review-training-differs">
        <KindLine icon={<GitCompare aria-hidden="true" />}>
          Documentele dau {text.differs} decât aplicația. Păstrăm valoarea din aplicație dacă nu
          alegi altfel.
        </KindLine>
        <PickList label={label}>
          <PickOption
            name={name}
            checked={!replaced}
            onPick={() => context.review.setField(state.path, withoutReplace(change))}
            heading="În aplicație"
            testId="review-keep-app"
          >
            {shown(state.path, state.existing)}
          </PickOption>
          <PickOption
            name={name}
            checked={replaced}
            onPick={() => context.review.setField(state.path, { ...change, replace: true })}
            heading="În documente"
            testId="review-use-documents"
            action={sourceButton()}
          >
            {shown(state.path, state.value)}
          </PickOption>
        </PickList>
      </div>
    );
  }

  if (field.mode === 'legal_maximum' && legal) {
    const atMaximum = !open;
    return (
      <div className="grid gap-2" data-testid="review-training-legal-maximum">
        <KindLine
          icon={<TriangleAlert aria-hidden="true" />}
          tone={field.settled ? undefined : 'warning'}
        >
          Documentele nu dau intervalul pentru această categorie.
        </KindLine>
        <PickList label={label}>
          <PickOption
            name={name}
            checked={atMaximum}
            onPick={() => {
              setOtherOpen(false);
              context.review.setField(state.path, { value: legal.months });
            }}
            heading={`Maximul legal, după ${legal.law}`}
            testId="review-training-legal-pick"
          >
            {shown(state.path, legal.months)}
          </PickOption>
          <PickOption
            name={name}
            checked={open}
            inDocuments={field.settled}
            onPick={() => setOtherOpen(true)}
            heading={text.other}
            testId="review-training-other"
            below={open && control}
          >
            {!open && (
              <span className="text-muted-foreground">
                Îl alegi tu, dacă clientul face instruirea mai des.
              </span>
            )}
          </PickOption>
        </PickList>
        {!field.settled && (
          <RowNote testId="review-training-legal-note">
            Am ales maximul legal, fiindcă documentele nu dau intervalul. Dacă clientul face
            instruirea mai des, alege „{text.other}”.
          </RowNote>
        )}
      </div>
    );
  }

  if (field.mode === 'outside') {
    const index = state.own[0]!;
    const option = state.options[index]!;
    return (
      <div className="grid gap-2" data-testid="review-training-outside">
        <KindLine icon={<Split aria-hidden="true" />} tone={field.settled ? undefined : 'warning'}>
          Documentele dau {formatFieldValue(state.path, option.value)}, {text.outside}
        </KindLine>
        <PickList label={label}>
          <PickOption
            name={name}
            checked={false}
            disabled
            onPick={() => undefined}
            heading={
              <>
                <SourceFileNames sources={option.sources} />
                <Tag tone="destructive" testId="review-training-not-listed">
                  Nu e în listă
                </Tag>
              </>
            }
            action={sourceButton(option.sources)}
          >
            {shown(state.path, option.value)}
          </PickOption>
          {other}
        </PickList>
      </div>
    );
  }

  return (
    <div className="grid gap-2" data-testid="review-training-choice">
      <KindLine icon={<Split aria-hidden="true" />} tone={field.settled ? undefined : 'warning'}>
        Documentele dau {state.own.length} {text.several}. {text.pick}
      </KindLine>
      <PickList label={label}>
        {state.own.map((index) => {
          const option = state.options[index]!;
          return (
            <PickOption
              key={index}
              name={name}
              checked={!open && state.option === index && !state.edited}
              onPick={() => {
                setOtherOpen(false);
                context.review.setField(state.path, {
                  option: index,
                  ...(change?.replace ? { replace: true } : {}),
                });
              }}
              heading={<SourceFileNames sources={option.sources} />}
              action={sourceButton(option.sources)}
            >
              {shown(state.path, option.value)}
            </PickOption>
          );
        })}
        {other}
      </PickList>
    </div>
  );
}

function IntervalControl({
  id,
  domain,
  category,
  value,
  onPick,
}: {
  id: string;
  domain: TrainingDomain;
  category: StaffCategory;
  value: number | null;
  onPick: (months: number) => void;
}) {
  const choices = intervalChoicesOf(domain, category);
  return (
    <div className="grid gap-1.5">
      <Segmented
        name={id}
        label="La câte luni"
        options={choices.map((months) => ({ value: String(months), label: String(months) }))}
        value={value !== null && choices.includes(value) ? String(value) : null}
        disabled={false}
        testIdPrefix={id}
        phone="one-row"
        onPick={(picked) => onPick(Number(picked))}
      />
      <span className="text-xs text-muted-foreground">
        Cel mult la {legalMaxTrainingInterval(domain, category)} luni, după {lawOf[domain]}. Poți
        alege mai des.
      </span>
    </div>
  );
}

function DurationControl({
  id,
  domain,
  value,
  onPick,
}: {
  id: string;
  domain: TrainingDomain;
  value: number | null;
  onPick: (duration: number) => void;
}) {
  const choices = durationChoices[domain];
  return (
    <div className="grid gap-1.5">
      <Segmented
        name={id}
        label={domain === 'ssm' ? 'Durata, în minute' : 'Durata, în ore'}
        options={choices.map((each) => ({ value: String(each), label: String(each) }))}
        value={value !== null && choices.includes(value) ? String(value) : null}
        disabled={false}
        testIdPrefix={id}
        phone="one-row"
        onPick={(picked) => onPick(Number(picked))}
      />
      <span className="text-xs text-muted-foreground">
        {domain === 'ssm'
          ? 'Instruirea periodică durează 60, 90 sau 120 de minute.'
          : 'Cel puțin 2 ore, după OMAI 712/2005, art. 21.'}
      </span>
    </div>
  );
}

function MonthControl({
  id,
  value,
  onPick,
}: {
  id: string;
  value: number | null;
  onPick: (month: number) => void;
}) {
  return (
    <div className="sm:w-70">
      <NativeSelect
        aria-label="Prima lună"
        data-testid={id}
        value={value === null ? '' : String(value)}
        onChange={(event) => event.target.value && onPick(Number(event.target.value))}
      >
        <NativeSelectOption value="">Alege luna</NativeSelectOption>
        {monthNames.map((month, index) => (
          <NativeSelectOption key={month} value={String(index + 1)}>
            {month}
          </NativeSelectOption>
        ))}
      </NativeSelect>
    </div>
  );
}

const dayProblem = (text: string) =>
  /^\d{1,2}$/.test(text.trim()) && Number(text) >= 1 && Number(text) <= 31
    ? null
    : 'Scrie o zi între 1 și 31.';

function DayControl({
  id,
  label,
  value,
  onSave,
}: {
  id: string;
  label: string;
  value: number | null;
  onSave: (day: number) => void;
}) {
  const [draft, setDraft] = useState(value === null ? '' : String(value));
  const [problem, setProblem] = useState<string | null>(null);
  const save = () => {
    const found = dayProblem(draft);
    setProblem(found);
    if (!found) onSave(Number(draft));
  };
  return (
    <div className="grid gap-1.5">
      <span className="flex flex-wrap gap-2">
        <Input
          aria-label={label}
          data-testid={id}
          inputMode="numeric"
          className="w-28"
          value={draft}
          aria-invalid={Boolean(problem)}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              save();
            }
          }}
        />
        <Button type="button" variant="outline" onClick={save}>
          Folosește
        </Button>
      </span>
      {problem && <span className="text-[13px] text-destructive">{problem}</span>}
    </div>
  );
}

const plain = (field: TrainingField) => field.mode === 'value';

const pendingOf = (field: TrainingField, context: FieldContext) =>
  !field.settled ||
  context.blockers.some((blocker) => blocker.path === field.path && blocker.code === 'invalid');

function NoPostsImported({
  context,
  intervals,
}: {
  context: FieldContext;
  intervals: { category: StaffCategory; state: FieldState }[];
}) {
  const given = intervals.filter(({ state }) => state.value !== null);
  const importId = context.importId;
  return (
    <div
      data-testid="review-training-no-posts"
      className="grid justify-items-center gap-3 rounded-xl border border-dashed bg-muted/40 px-6 py-8 text-center"
    >
      <Briefcase aria-hidden="true" className="size-7 text-muted-foreground" />
      <p className="text-base font-semibold">Nu preiei niciun post de lucru</p>
      <p className="max-w-xl text-sm text-muted-foreground">
        Intervalul se alege pentru fiecare categorie care are posturi.
        {given.length > 0 && (
          <>
            {' '}
            Documentele dau{' '}
            {given
              .map(
                ({ category, state }) =>
                  `${formatFieldValue(state.path, state.value)} pentru ${
                    category === 'execution' ? 'execuție' : 'tehnico-administrativ'
                  }`
              )
              .join(' și ')}
            ; le folosim când preiei posturi.
          </>
        )}
      </p>
      {importId !== '' && (
        <Button asChild variant="outline">
          <Link
            to="/clienti/import/$importId/$section"
            params={{ importId, section: 'job-positions' }}
          >
            <Briefcase aria-hidden="true" />
            Mergi la Posturi de lucru
          </Link>
        </Button>
      )}
    </div>
  );
}

export function TrainingImportCard({
  domain,
  context,
}: {
  domain: TrainingDomain;
  context: FieldContext;
}) {
  const id = useId();
  const paths = schedulePaths[domain];
  const { states, existingClient, review } = context;
  const posts = keptPosts(context.proposal, context.changes, context.existingPositions);
  const categories = categoriesWithPosts(posts);
  const present = new Set(categories.map(({ category }) => category));
  const intervalOf = (category: StaffCategory) =>
    trainingField(states, paths.interval[category], intervalChoicesOf(domain, category), {
      domain,
      category,
      hasPosts: present.has(category),
    });
  const month = trainingField(states, paths.firstMonth, null);
  const dayFrom = trainingField(states, paths.dayFrom, null);
  const dayTo = trainingField(states, paths.dayTo, null);
  const duration = trainingField(states, paths.duration, durationChoices[domain]);
  const intervals = categories.map(({ category }) => ({ category, field: intervalOf(category) }));
  const pending = [...intervals.map(({ field }) => field), month, dayFrom, dayTo, duration].filter(
    (field) => pendingOf(field, context)
  ).length;
  const save = (state: FieldState, value: number) =>
    review.setField(state.path, numberChange(state, value, existingClient));
  const [days, setDays] = useState({
    from: dayFrom.value === null ? '' : String(dayFrom.value),
    to: dayTo.value === null ? '' : String(dayTo.value),
  });
  const commitDays = () => {
    for (const [field, text] of [
      [dayFrom, days.from],
      [dayTo, days.to],
    ] as const) {
      if (!plain(field) || dayProblem(text)) continue;
      if (Number(text) !== field.value) save(field.state, Number(text));
    }
  };
  const look = titles[domain];
  const Icon = look.icon;
  const law = lawOf[domain];

  const daysLine = (() => {
    if (!plain(dayFrom) || !plain(dayTo)) return null;
    const edited = dayFrom.state.edited || dayTo.state.edited;
    if (edited) {
      const from = dayFrom.state.proposedValue;
      const to = dayTo.state.proposedValue;
      const sources = [...documentsSources(dayFrom.state), ...documentsSources(dayTo.state)];
      return (
        <SourceLine
          action={
            <SourceButton
              sources={sources}
              onOpen={() => context.openSource('Zilele lunii', sources)}
            />
          }
        >
          <EditedTag />
          {from !== null && to !== null && (
            <span>
              Din documente: {from === to ? `ziua ${from}` : `între zilele ${from} și ${to}`}.
            </span>
          )}
        </SourceLine>
      );
    }
    return sourceLine(dayFrom, context, 'Zilele lunii');
  })();

  return (
    <section
      data-testid={`review-training-${domain}`}
      aria-labelledby={`${id}-title`}
      className="overflow-hidden rounded-xl border bg-card shadow-xs"
    >
      <div className="flex flex-wrap items-center gap-x-3.5 gap-y-3 border-b px-4 py-4 sm:flex-nowrap sm:px-5">
        <span className="flex size-10 shrink-0 items-center justify-center self-start rounded-[10px] bg-secondary sm:self-center">
          <Icon className="size-5" aria-hidden="true" />
        </span>
        <div className="grid min-w-0 flex-1 basis-56 gap-0.5">
          <h2 id={`${id}-title`} className="text-base leading-snug font-semibold">
            {look.title}
          </h2>
          <p className="text-[13px] text-muted-foreground">{look.description}</p>
        </div>
        <div className="w-full sm:w-auto sm:shrink-0">
          <PendingNote
            line={
              pending === 0
                ? null
                : pending === 1
                  ? 'Mai ai un lucru de făcut'
                  : `Mai ai ${pending} lucruri de făcut`
            }
            testId="review-group-pending"
          />
        </div>
      </div>
      <div className="px-4 py-5 sm:px-5">
        <TrainingScheduleFields
          domain={domain}
          idPrefix={`review-${domain}`}
          disabled={false}
          categories={intervals.map(({ category, field }) => {
            const held = categories.find((each) => each.category === category)!;
            const blockPending = pendingOf(field, context);
            const control = (
              <IntervalControl
                id={`review-${domain}-${category}-other`}
                domain={domain}
                category={category}
                value={field.value}
                onPick={(months) => save(field.state, months)}
              />
            );
            return {
              ...held,
              id: anchorOf(field.path),
              interval: field.mode === 'choice' && !field.settled ? null : field.value,
              pending: blockPending,
              control: plain(field) ? undefined : (
                <FieldPicker
                  key={field.mode}
                  field={field}
                  kind="interval"
                  context={context}
                  label={`La câte luni, ${held.category === 'execution' ? 'execuție' : 'tehnico-administrativ'}`}
                  control={control}
                  legal={{ months: legalMaxTrainingInterval(domain, category), law }}
                />
              ),
              fieldNote: plain(field) ? sourceLine(field, context, 'La câte luni') : undefined,
            };
          })}
          firstMonth={month.value}
          dayFrom={days.from}
          dayTo={days.to}
          duration={duration.value}
          controls={{
            ...(plain(month)
              ? {}
              : {
                  firstMonth: (
                    <FieldPicker
                      key={month.mode}
                      field={month}
                      kind="firstMonth"
                      context={context}
                      label="Prima lună"
                      control={
                        <MonthControl
                          id={`review-${domain}-month-other`}
                          value={month.value}
                          onPick={(value) => save(month.state, value)}
                        />
                      }
                    />
                  ),
                }),
            ...(plain(dayFrom) && plain(dayTo)
              ? {}
              : {
                  days: (
                    <div className="grid gap-4">
                      {(
                        [
                          [dayFrom, 'De la ziua'],
                          [dayTo, 'Până la ziua'],
                        ] as const
                      ).map(([field, label]) =>
                        plain(field) ? (
                          <div key={field.path} className="grid gap-2">
                            <span className="text-sm">{label}</span>
                            <DayControl
                              id={`review-${domain}-${field.path}-input`}
                              label={label}
                              value={field.value}
                              onSave={(day) => save(field.state, day)}
                            />
                          </div>
                        ) : (
                          <div key={field.path} id={anchorOf(field.path)} className="grid gap-2">
                            <span className="text-sm">{label}</span>
                            <FieldPicker
                              key={field.mode}
                              field={field}
                              kind="day"
                              context={context}
                              label={label}
                              control={
                                <DayControl
                                  id={`review-${domain}-${field.path}-other`}
                                  label={label}
                                  value={field.value}
                                  onSave={(day) => save(field.state, day)}
                                />
                              }
                            />
                          </div>
                        )
                      )}
                    </div>
                  ),
                }),
            ...(plain(duration)
              ? {}
              : {
                  duration: (
                    <FieldPicker
                      key={duration.mode}
                      field={duration}
                      kind="duration"
                      context={context}
                      label="Durata"
                      control={
                        <DurationControl
                          id={`review-${domain}-duration-other`}
                          domain={domain}
                          value={duration.value}
                          onPick={(value) => save(duration.state, value)}
                        />
                      }
                    />
                  ),
                }),
          }}
          notes={{
            firstMonth: plain(month) ? sourceLine(month, context, 'Prima lună') : undefined,
            days: daysLine,
            duration: plain(duration) ? sourceLine(duration, context, 'Durata') : undefined,
          }}
          noPosts={
            <NoPostsImported
              context={context}
              intervals={(['execution', 'technical_administrative'] as const).map((category) => ({
                category,
                state: states[paths.interval[category]]!,
              }))}
            />
          }
          absentNote={(category) => {
            const state = states[paths.interval[category]]!;
            const left = context.proposal.jobPositions.filter(
              (post) => post.staffCategory === category
            );
            return (
              <>
                {category === 'execution'
                  ? 'Personalul de execuție'
                  : 'Personalul tehnico-administrativ'}{' '}
                nu apare: nu preiei niciun post din această categorie.
                {state.value !== null && (
                  <>
                    {' '}
                    Documentele dau pentru{' '}
                    {category === 'execution' ? 'execuție' : 'tehnico-administrativ'}{' '}
                    {formatFieldValue(state.path, state.value)}; intervalul revine aici dacă preiei{' '}
                    {left.length === 1 ? `postul ${left[0]!.name.trim()}` : 'un post din ea'} din{' '}
                    <Link
                      to="/clienti/import/$importId/$section"
                      params={{ importId: context.importId, section: 'job-positions' }}
                      className="underline underline-offset-4"
                    >
                      Posturi de lucru
                    </Link>
                    .
                  </>
                )}
              </>
            );
          }}
          onIntervalChange={(category, months) => save(intervalOf(category).state, months)}
          onFirstMonthChange={(value) => value !== null && save(month.state, value)}
          onDayFromChange={(day) => setDays((current) => ({ ...current, from: day }))}
          onDayToChange={(day) => setDays((current) => ({ ...current, to: day }))}
          onDaysCommit={commitDays}
          onDurationChange={(value) => save(duration.state, value)}
        />
      </div>
    </section>
  );
}
