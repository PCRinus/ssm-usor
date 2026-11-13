import {
  type AnsweredPerson,
  type AnswerPeriod,
  type AnswerRole,
  answerRoles,
  hasAnswer,
  type TrainingDomain,
  trainingDomainLabels,
  type WhoTrainedAnswer,
} from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { Input } from '@ssm-usor/ui/components/input';
import {
  NativeSelect,
  NativeSelectOptGroup,
  NativeSelectOption,
} from '@ssm-usor/ui/components/native-select';
import { useRouteContext } from '@tanstack/react-router';
import { FileImage, Pencil, UserRoundCheck, UsersRound } from 'lucide-react';
import { type ReactNode, useId, useMemo, useState } from 'react';

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
  answered,
  copiesOf,
  copyCandidates,
  hiringNames,
  personText,
  questionRows,
  questionTitle,
  roleLabels,
  samePerson,
  sheetCounts,
  type SignerGroup,
  signerGroups,
  splitOf,
  whoTrainedId,
  withAnswer,
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
  const accessible = `${roleLabels[role]}${label ? `, ${label.toLowerCase()}` : ''}`;
  return (
    <span className="grid min-w-0 content-start gap-1.5">
      {label && (
        <label htmlFor={id} className="text-[13px] font-medium text-muted-foreground">
          {label}
        </label>
      )}
      <NativeSelect
        id={id}
        aria-label={label ? undefined : accessible}
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

function RoleEditor({
  role,
  answer,
  split,
  groups,
  onSave,
  onDone,
}: {
  role: AnswerRole;
  answer: WhoTrainedAnswer | undefined;
  split: string | null;
  groups: SignerGroup[];
  onSave: (period: AnswerPeriod, person: AnsweredPerson | null) => void;
  onDone: () => void;
}) {
  const periods: AnswerPeriod[] = split ? ['before', 'from'] : ['from'];
  const [choices, setChoices] = useState<Record<AnswerPeriod, Choice>>(() => ({
    before: choiceOf(answer?.[role]?.before, groups, undefined, 'before'),
    from: choiceOf(answer?.[role]?.from, groups, answer?.[role]?.before, 'from'),
  }));
  const [errors, setErrors] = useState<Record<AnswerPeriod, string | null>>({
    before: null,
    from: null,
  });
  const options = groups.flatMap((group) => group.options);
  const before = answer?.[role]?.before;

  const typedPerson = (choice: Choice): AnsweredPerson | null | 'incomplete' => {
    const name = choice.name.trim();
    const jobTitle = choice.jobTitle.trim();
    if (name === '' || (role === 'verifier' && jobTitle === '')) return 'incomplete';
    return { name, jobTitle: jobTitle === '' ? null : jobTitle };
  };

  const pick = (period: AnswerPeriod, value: string) => {
    setErrors((current) => ({ ...current, [period]: null }));
    setChoices((current) => ({
      ...current,
      [period]: { value, name: current[period].name, jobTitle: current[period].jobTitle },
    }));
    if (value === otherValue) return;
    if (value === notWrittenValue) return onSave(period, null);
    if (value === sameValue) return onSave(period, before ?? null);
    const option = options.find((each) => each.key === value);
    if (option) onSave(period, { name: option.name, jobTitle: option.jobTitle });
  };

  const type = (period: AnswerPeriod, field: 'name' | 'jobTitle', value: string) =>
    setChoices((current) => ({ ...current, [period]: { ...current[period], [field]: value } }));

  const done = () => {
    let complete = true;
    for (const period of periods) {
      const choice = choices[period];
      if (choice.value !== otherValue) continue;
      const person = typedPerson(choice);
      if (person === 'incomplete') {
        complete = false;
        setErrors((current) => ({
          ...current,
          [period]:
            role === 'verifier'
              ? 'Scrie numele și funcția celui care a verificat.'
              : 'Scrie numele celui care a instruit.',
        }));
      } else {
        onSave(period, person);
      }
    }
    if (complete) onDone();
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
      <span className={split ? 'grid gap-4 sm:grid-cols-2' : 'grid gap-4'}>
        {periods.map((period) => (
          <PeriodPicker
            key={period}
            role={role}
            label={
              split ? `${period === 'before' ? 'Până la' : 'De la'} ${longDateLabel(split)}` : ''
            }
            choice={choices[period]}
            groups={groups}
            sameOffered={period === 'from' && split !== null && before !== undefined}
            error={errors[period]}
            onPick={(value) => pick(period, value)}
            onType={(field, value) => type(period, field, value)}
            onTyped={() => {
              const person = typedPerson(choices[period]);
              if (person !== 'incomplete') onSave(period, person);
            }}
          />
        ))}
      </span>
    </DecisionRow>
  );
}

function RoleSummary({
  role,
  answer,
  split,
  mark,
  onOpen,
}: {
  role: AnswerRole;
  answer: WhoTrainedAnswer | undefined;
  split: string | null;
  mark: ReactNode;
  onOpen: () => void;
}) {
  const periods: AnswerPeriod[] = split ? ['before', 'from'] : ['from'];
  const chosen = periods.some((period) => answer?.[role]?.[period]);
  return (
    <DecisionRow
      tone={chosen ? 'done' : 'optional'}
      label={roleLabels[role]}
      testId={`who-trained-${role}`}
      actions={
        <Button
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
        const person = answer?.[role]?.[period];
        return (
          <span
            key={period}
            className={
              split ? 'grid gap-x-3 sm:grid-cols-[8.5rem_minmax(0,1fr)] sm:items-baseline' : 'grid'
            }
          >
            {split && (
              <span className="text-muted-foreground tabular-nums">
                {period === 'before' ? 'Până la' : 'De la'} {dateLabel(split)}
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
    </DecisionRow>
  );
}

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
  const [copying, setCopying] = useState(false);
  const people = useSignerPeople(clientId);
  const { proposal } = context;
  const counts = useMemo(() => sheetCounts({ proposal }), [proposal]);
  const rows = questionRows(context, person.id, domain);
  const answer = answerOf(context.changes, person.id, domain);
  const split = splitOf(context, person.id, domain);
  const sheetNames = hiringNames(context, person.id, domain);
  const groupsOf = (role: AnswerRole) => signerGroups({ role, sheetNames, ...people, counts });
  const candidates = copyCandidates(context, person, domain);
  const copies = copiesOf(context.changes, person.id, domain);
  const source = answer?.copiedFrom
    ? proposal.people.find((each) => each.id === answer.copiedFrom)
    : undefined;
  if (rows.length === 0) return null;
  const title = questionTitle(domain);
  const mark = source ? (
    <ChosenMark>
      ales de tine pentru {workersLabel(copiesOf(context.changes, source.id, domain))}, la{' '}
      <Masked>{personName(context, source)}</Masked>
    </ChosenMark>
  ) : (
    <ChosenMark />
  );
  const save = (role: AnswerRole) => (period: AnswerPeriod, chosen: AnsweredPerson | null) =>
    onChange((current) => {
      const before = answerOf(current, person.id, domain);
      const held = before?.[role]?.[period];
      const unchanged = chosen
        ? held?.name === chosen.name && held.jobTitle === chosen.jobTitle
        : held === undefined;
      if (unchanged) return current;
      return withAnswer(current, person.id, domain, answered(before, role, period, chosen));
    });
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
      <p className="max-w-[68ch] px-5 pt-0.5 pb-3 text-[13px] text-muted-foreground">
        Pe fișă sunt doar semnăturile. Dacă nu știi cine a semnat, rămâne „{notOnSheet.name}”.
      </p>
      {answerRoles(domain).map((role) =>
        open === role ? (
          <RoleEditor
            key={role}
            role={role}
            answer={answer}
            split={split}
            groups={groupsOf(role)}
            onSave={save(role)}
            onDone={() => setOpen(null)}
          />
        ) : (
          <RoleSummary
            key={role}
            role={role}
            answer={answer}
            split={split}
            mark={mark}
            onOpen={() => setOpen(role)}
          />
        )
      )}
      {hasAnswer(domain, answer) && (copies > 0 || others > 0) && (
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 border-t bg-muted/40 px-5 py-2.5 text-sm">
          {others > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
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
          answer={answer!}
          split={split}
          onClose={() => setCopying(false)}
          onChange={onChange}
        />
      )}
    </div>
  );
}
