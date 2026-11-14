import {
  type AnsweredPerson,
  type AnswerPeriod,
  type AnswerPeriods,
  type AnswerRole,
  answerRoles,
  type HandoverWindow,
  hasAnswer,
  type TrainingDomain,
  trainingDomainLabels,
} from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { Input } from '@ssm-usor/ui/components/input';
import {
  NativeSelect,
  NativeSelectOptGroup,
  NativeSelectOption,
} from '@ssm-usor/ui/components/native-select';
import { cn } from '@ssm-usor/ui/lib/utils';
import { useRouteContext } from '@tanstack/react-router';
import { FileImage, Pencil, UserRoundCheck, UsersRound } from 'lucide-react';
import { type ReactNode, type Ref, useEffect, useId, useMemo, useRef, useState } from 'react';

import {
  getListOrganizationMembersQueryKey,
  getListResponsiblePersonsQueryKey,
  useListOrganizationMembers,
  useListResponsiblePersons,
} from '@/api/generated/api';
import { HelpLink } from '@/components/help-link';
import { Masked } from '@/components/replay';
import { useAuth } from '@/features/auth/auth-context';
import { roCount } from '@/features/employees/employee-format';
import { notOnSheet } from '@/features/trainings/training-format';

import { DecisionRow } from '../library/decision-row';
import {
  answerOf,
  type Changes,
  type Person,
  personName,
  type ReviewContext,
  type SheetPage,
} from './employee-review-model';
import { PhotoNumbers } from './person-photos';
import { dateLabel } from './review-format';
import {
  copiesOf,
  copyCandidates,
  hiringNames,
  liveOf,
  personText,
  questionRows,
  questionTitle,
  roleLabels,
  samePerson,
  sheetCounts,
  type SignerGroup,
  signerGroups,
  staleOf,
  whoTrainedId,
  windowOf,
  withAnswer,
  withRole,
} from './who-trained-model';
import { WhoTrainedOthers } from './who-trained-others';

type Update = (mutate: (current: Changes) => Changes) => void;

const longDate = new Intl.DateTimeFormat('ro-RO', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

const longDateLabel = (iso: string) => longDate.format(new Date(`${iso}T00:00:00Z`));

export function ChosenMark({ children = 'ales de tine' }: { children?: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <UserRoundCheck className="size-3 shrink-0" aria-hidden="true" />
      {children}
    </span>
  );
}

export function RowEditedMark() {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Pencil className="size-3 shrink-0" aria-hidden="true" />
      schimbat de tine pe acest rând
    </span>
  );
}

type Named = { name: string | null; jobTitle: string | null };

function useSignerPeople(clientId: string) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const { session } = useAuth();
  const userId = session?.user.id ?? '';
  const responsible = useListResponsiblePersons(clientId, {
    request: apiRequest,
    query: { queryKey: [...getListResponsiblePersonsQueryKey(clientId), userId] },
  });
  const members = useListOrganizationMembers({
    request: apiRequest,
    query: { queryKey: [...getListOrganizationMembersQueryKey(), userId] },
  });
  return useMemo(
    () => ({
      responsible: [...(responsible.data?.items ?? [])]
        .sort(
          (a, b) =>
            Number(b.roles.includes('workplace_manager')) -
            Number(a.roles.includes('workplace_manager'))
        )
        .map((each): Named => ({ name: each.fullName, jobTitle: each.jobTitle })),
      members: (members.data?.items ?? []).map((each): Named => ({
        name: each.fullName,
        jobTitle: each.professionalTitle,
      })),
    }),
    [responsible.data, members.data]
  );
}

type Choice = { value: string; name: string; jobTitle: string };

const notWrittenValue = '';
const otherValue = 'other';
const sameValue = 'same';

function choiceOf(
  person: AnsweredPerson | undefined,
  groups: SignerGroup[],
  before: AnsweredPerson | undefined,
  period: AnswerPeriod
): Choice {
  if (!person) return { value: notWrittenValue, name: '', jobTitle: '' };
  if (period === 'from' && before && samePerson(person, before)) {
    return { value: sameValue, name: '', jobTitle: '' };
  }
  const option = groups.flatMap((group) => group.options).find((each) => samePerson(each, person));
  if (option) return { value: option.key, name: '', jobTitle: '' };
  return { value: otherValue, name: person.name, jobTitle: person.jobTitle ?? '' };
}

const workersLabel = (count: number) =>
  count === 1 ? 'un lucrător' : roCount(count, 'lucrător', 'lucrători');

const sheetsLabel = (count: number) =>
  count === 0 ? '' : count === 1 ? ' · pe o fișă' : ` · pe ${roCount(count, 'fișă', 'fișe')}`;

function PeriodPicker({
  ref,
  role,
  label,
  choice,
  groups,
  sameOffered,
  error,
  onPick,
  onType,
  onTyped,
}: {
  ref?: Ref<HTMLSelectElement>;
  role: AnswerRole;
  label: string;
  choice: Choice;
  groups: SignerGroup[];
  sameOffered: boolean;
  error: string | null;
  onPick: (value: string) => void;
  onType: (field: 'name' | 'jobTitle', value: string) => void;
  onTyped: () => void;
}) {
  const id = useId();
  const accessible = `${roleLabels[role]}${label ? `, ${lowerFirst(label)}` : ''}`;
  return (
    <span className="grid min-w-0 content-start gap-1.5">
      {label && (
        <label htmlFor={id} className="text-[13px] font-medium text-muted-foreground">
          {label}
        </label>
      )}
      <NativeSelect
        ref={ref}
        id={id}
        aria-label={accessible}
        value={choice.value}
        data-testid={`who-trained-pick-${role}`}
        onChange={(event) => onPick(event.target.value)}
      >
        {sameOffered && (
          <NativeSelectOption value={sameValue}>
            Același om ca înainte de preluare
          </NativeSelectOption>
        )}
        {groups.map((group) => (
          <NativeSelectOptGroup key={group.label} label={group.label}>
            {group.options.map((option) => (
              <NativeSelectOption key={option.key} value={option.key}>
                {personText(option)}
                {sheetsLabel(option.sheets)}
              </NativeSelectOption>
            ))}
          </NativeSelectOptGroup>
        ))}
        <NativeSelectOption value={otherValue}>Alt nume…</NativeSelectOption>
        <NativeSelectOption value={notWrittenValue}>Numele nu e scris pe fișă</NativeSelectOption>
      </NativeSelect>
      {choice.value === otherValue && (
        <span className="grid gap-2 sm:grid-cols-2">
          <Input
            aria-label={`${accessible}: numele`}
            placeholder="Numele"
            maxLength={160}
            value={choice.name}
            aria-invalid={error !== null && choice.name.trim() === ''}
            onChange={(event) => onType('name', event.target.value)}
            onBlur={onTyped}
          />
          <Input
            aria-label={`${accessible}: funcția`}
            placeholder={role === 'verifier' ? 'Funcția' : 'Funcția (opțional)'}
            maxLength={160}
            value={choice.jobTitle}
            aria-invalid={error !== null && choice.jobTitle.trim() === ''}
            onChange={(event) => onType('jobTitle', event.target.value)}
            onBlur={onTyped}
          />
        </span>
      )}
      {error && <span className="text-[13px] text-destructive">{error}</span>}
    </span>
  );
}

type Periods = Pick<AnswerPeriods, 'before' | 'from'>;

const periodLabel = (period: AnswerPeriod, window: HandoverWindow, long: boolean) => {
  if (window.splitOn === null) return '';
  const day = long ? longDateLabel(window.splitOn) : dateLabel(window.splitOn);
  if (period === 'from') return `De la ${day}`;
  if (window.previousOn === null) return `Până la ${day}`;
  const since = long ? longDateLabel(window.previousOn) : dateLabel(window.previousOn);
  return `De la ${since} până la ${day}`;
};

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

function RoleEditor({
  role,
  held,
  window,
  groups,
  onSave,
  onDone,
}: {
  role: AnswerRole;
  // What the role holds, even when given under other handovers: it is preselected again.
  held: Periods | undefined;
  window: HandoverWindow;
  groups: SignerGroup[];
  onSave: (periods: Periods) => void;
  onDone: () => void;
}) {
  const periods: AnswerPeriod[] = window.splitOn ? ['before', 'from'] : ['from'];
  const [choices, setChoices] = useState<Record<AnswerPeriod, Choice>>(() => ({
    before: choiceOf(held?.before, groups, undefined, 'before'),
    from: choiceOf(held?.from, groups, window.splitOn ? held?.before : undefined, 'from'),
  }));
  const [errors, setErrors] = useState<Record<AnswerPeriod, string | null>>({
    before: null,
    from: null,
  });
  const first = useRef<HTMLSelectElement>(null);
  useEffect(() => first.current?.focus(), []);
  const options = groups.flatMap((group) => group.options);

  const typedPerson = (choice: Choice): AnsweredPerson | 'incomplete' => {
    const name = choice.name.trim();
    const jobTitle = choice.jobTitle.trim();
    if (name === '' || (role === 'verifier' && jobTitle === '')) return 'incomplete';
    return { name, jobTitle: jobTitle === '' ? null : jobTitle };
  };

  const personOf = (
    all: Record<AnswerPeriod, Choice>,
    period: AnswerPeriod
  ): AnsweredPerson | undefined => {
    const choice = all[period];
    if (choice.value === notWrittenValue) return undefined;
    if (choice.value === sameValue) return personOf(all, 'before');
    if (choice.value === otherValue) {
      const typed = typedPerson(choice);
      return typed === 'incomplete' ? undefined : typed;
    }
    const option = options.find((each) => each.key === choice.value);
    return option ? { name: option.name, jobTitle: option.jobTitle } : undefined;
  };

  const commit = (all: Record<AnswerPeriod, Choice>) =>
    onSave(
      Object.fromEntries(
        periods.flatMap((period) => {
          const chosen = personOf(all, period);
          return chosen ? [[period, chosen]] : [];
        })
      ) as Periods
    );

  const pick = (period: AnswerPeriod, value: string) => {
    setErrors((current) => ({ ...current, [period]: null }));
    const next = { ...choices, [period]: { ...choices[period], value } };
    setChoices(next);
    if (value !== otherValue) commit(next);
  };

  const type = (period: AnswerPeriod, field: 'name' | 'jobTitle', value: string) =>
    setChoices((current) => ({ ...current, [period]: { ...current[period], [field]: value } }));

  const done = () => {
    const incomplete = periods.filter(
      (period) =>
        choices[period].value === otherValue && typedPerson(choices[period]) === 'incomplete'
    );
    for (const period of incomplete) {
      setErrors((current) => ({
        ...current,
        [period]:
          role === 'verifier'
            ? 'Scrie numele și funcția celui care a verificat.'
            : 'Scrie numele celui care a instruit.',
      }));
    }
    if (incomplete.length > 0) return;
    commit(choices);
    onDone();
  };

  return (
    <DecisionRow
      tone="editing"
      label={roleLabels[role]}
      top
      testId={`who-trained-${role}`}
      personal
      actions={
        <Button type="button" variant="outline" size="sm" onClick={done}>
          Gata
        </Button>
      }
    >
      <span className={window.splitOn ? 'grid gap-4 sm:grid-cols-2' : 'grid gap-4'}>
        {periods.map((period, index) => (
          <PeriodPicker
            key={period}
            ref={index === 0 ? first : undefined}
            role={role}
            label={periodLabel(period, window, true)}
            choice={choices[period]}
            groups={groups}
            sameOffered={period === 'from' && window.splitOn !== null}
            error={errors[period]}
            onPick={(value) => pick(period, value)}
            onType={(field, value) => type(period, field, value)}
            onTyped={() => {
              if (typedPerson(choices[period]) !== 'incomplete') commit(choices);
            }}
          />
        ))}
      </span>
    </DecisionRow>
  );
}

function RoleSummary({
  role,
  live,
  stale,
  window,
  mark,
  buttonRef,
  onOpen,
}: {
  role: AnswerRole;
  live: Periods | undefined;
  stale: Periods | undefined;
  window: HandoverWindow;
  mark: ReactNode;
  buttonRef: (element: HTMLButtonElement | null) => void;
  onOpen: () => void;
}) {
  const periods: AnswerPeriod[] = window.splitOn ? ['before', 'from'] : ['from'];
  const chosen = periods.some((period) => live?.[period]);
  const earlier = stale ? [stale.before, stale.from].filter((each) => each !== undefined) : [];
  return (
    <DecisionRow
      tone={chosen ? 'done' : 'optional'}
      label={roleLabels[role]}
      testId={`who-trained-${role}`}
      actions={
        <Button
          ref={buttonRef}
          type="button"
          variant="outline"
          size="sm"
          aria-label={`${chosen ? 'Schimbă' : 'Alege'}: ${roleLabels[role].toLowerCase()}`}
          onClick={onOpen}
        >
          {chosen ? 'Schimbă' : 'Alege'}
        </Button>
      }
    >
      {periods.map((period) => {
        const person = live?.[period];
        return (
          <span
            key={period}
            className={
              window.splitOn
                ? 'grid gap-x-3 sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:items-baseline'
                : 'grid'
            }
          >
            {window.splitOn && (
              <span className="text-muted-foreground tabular-nums">
                {periodLabel(period, window, false)}
              </span>
            )}
            {person ? (
              <span className="grid min-w-0 gap-px">
                <Masked className="font-medium wrap-anywhere">{personText(person)}</Masked>
                {mark}
              </span>
            ) : (
              <span className="text-muted-foreground">{notOnSheet.name}</span>
            )}
          </span>
        );
      })}
      {earlier.length > 0 && (
        <span className="text-[13px] text-muted-foreground" data-testid="who-trained-earlier">
          Ales înainte: <Masked>{[...new Set(earlier.map(personText))].join('; ')}</Masked>
        </span>
      )}
    </DecisionRow>
  );
}

const samePeriods = (a: Periods | undefined, b: Periods) =>
  JSON.stringify([a?.before ?? null, a?.from ?? null]) ===
  JSON.stringify([b.before ?? null, b.from ?? null]);

export function WhoTrainedQuestion({
  context,
  person,
  domain,
  pages,
  clientId,
  onChange,
}: {
  context: ReviewContext;
  person: Person;
  domain: TrainingDomain;
  pages: SheetPage[];
  clientId: string;
  onChange: Update;
}) {
  const [open, setOpen] = useState<AnswerRole | null>(null);
  const refocus = useRef<AnswerRole | null>(null);
  const buttons = useRef<Partial<Record<AnswerRole, HTMLButtonElement | null>>>({});
  useEffect(() => {
    const role = refocus.current;
    if (role === null || open === role) return;
    refocus.current = null;
    buttons.current[role]?.focus();
  }, [open]);
  const [copying, setCopying] = useState(false);
  const people = useSignerPeople(clientId);
  const { proposal } = context;
  const counts = useMemo(() => sheetCounts({ proposal }), [proposal]);
  const rows = questionRows(context, person.id, domain);
  const answer = answerOf(context.changes, person.id, domain);
  const live = liveOf(context, person.id, domain);
  const stale = staleOf(context, person.id, domain);
  const window = windowOf(context, person.id, domain);
  const sheetNames = hiringNames(context, person.id, domain);
  const groupsOf = (role: AnswerRole) => signerGroups({ role, sheetNames, ...people, counts });
  const candidates = copyCandidates(context, person, domain);
  const copies = copiesOf(context, person.id, domain);
  const source = answer?.copiedFrom
    ? proposal.people.find((each) => each.id === answer.copiedFrom)
    : undefined;
  if (rows.length === 0) return null;
  const title = questionTitle(domain);
  const mark = source ? (
    <ChosenMark>
      ales de tine pentru {workersLabel(copiesOf(context, source.id, domain))}, la{' '}
      <Masked>{personName(context, source)}</Masked>
    </ChosenMark>
  ) : (
    <ChosenMark />
  );
  const save = (role: AnswerRole) => (periods: Periods) =>
    onChange((current) => {
      const held = answerOf(current, person.id, domain);
      const now = liveOf({ proposal, changes: current }, person.id, domain);
      if (now?.[role] && samePeriods(now[role], periods)) return current;
      return withAnswer(current, person.id, domain, withRole(held, role, periods, window));
    });
  const close = (role: AnswerRole) => {
    refocus.current = role;
    setOpen(null);
  };
  const others = candidates.open.length;
  return (
    <div
      id={whoTrainedId(domain)}
      tabIndex={-1}
      className="scroll-mt-24 outline-none"
      data-testid={`who-trained-${domain}`}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5 border-t px-5 pt-3.5 pb-0.5">
        <h4 className="text-sm font-semibold">{title}</h4>
        <HelpLink topic="import.cine-a-instruit" label={`Ajutor: ${title}`} />
        <span className="flex-1" />
        <span className="inline-flex flex-wrap items-center gap-1.5 text-[13px] text-muted-foreground">
          <FileImage className="size-3.5 shrink-0" aria-hidden="true" />
          Semnăturile, pe fotografiile
          <PhotoNumbers
            pages={pages}
            pageIds={[...new Set(rows.map(({ page }) => page.id))]}
            about={`Semnăturile, instruire ${trainingDomainLabels[domain]} periodică`}
            shown={6}
          />
        </span>
      </div>
      <p
        className={cn(
          'max-w-[68ch] px-5 pt-0.5 pb-3 text-[13px]',
          stale.length > 0 ? 'font-medium text-foreground' : 'text-muted-foreground'
        )}
        data-testid="who-trained-guide"
      >
        {stale.length > 0
          ? 'Data preluării de pe fișe s-a schimbat de când ai ales, așa că alegerea nu se mai folosește. Alege din nou.'
          : `Pe fișă sunt doar semnăturile. Dacă nu știi cine a semnat, rămâne „${notOnSheet.name}”.`}
      </p>
      {answerRoles(domain).map((role) =>
        open === role ? (
          <RoleEditor
            key={role}
            role={role}
            held={answer?.[role]}
            window={window}
            groups={groupsOf(role)}
            onSave={save(role)}
            onDone={() => close(role)}
          />
        ) : (
          <RoleSummary
            key={role}
            role={role}
            live={live?.[role]}
            stale={stale.includes(role) ? answer?.[role] : undefined}
            window={window}
            mark={mark}
            buttonRef={(element) => {
              buttons.current[role] = element;
            }}
            onOpen={() => setOpen(role)}
          />
        )
      )}
      {hasAnswer(domain, live) && (copies > 0 || others > 0) && (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 border-t bg-muted/40 px-5 py-2.5 text-sm">
          {others > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-auto min-h-8 max-w-full py-1.5 text-left whitespace-normal"
              data-testid="who-trained-copy"
              onClick={() => setCopying(true)}
            >
              <UsersRound aria-hidden="true" />
              Folosește același răspuns și la alți lucrători…
            </Button>
          )}
          <span className="text-[13px] text-muted-foreground">
            {copies > 0
              ? `Folosit și la ${workersLabel(copies)}.`
              : others === 1
                ? 'La celălalt nu se schimbă nimic până nu îl alegi tu.'
                : `La ceilalți ${others} nu se schimbă nimic până nu îi alegi tu.`}
          </span>
        </div>
      )}
      {copying && (
        <WhoTrainedOthers
          context={context}
          person={person}
          domain={domain}
          answer={live!}
          window={window}
          onClose={() => setCopying(false)}
          onChange={onChange}
        />
      )}
    </div>
  );
}
