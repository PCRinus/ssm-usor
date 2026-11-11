import { isValidCnp } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { Input } from '@ssm-usor/ui/components/input';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Link } from '@tanstack/react-router';
import { type FormEvent, type ReactNode, useId, useState } from 'react';

import { roCount } from '@/features/employees/employee-format';
import { JobPositionDialog } from '@/features/job-positions/job-position-dialog';
import { staffCategoryLabels } from '@/features/job-positions/job-position-schema';
import { formatRoDate } from '@/lib/dates';

import { Tag } from '../review-parts';
import {
  type Changes,
  type Decision,
  fieldLabels,
  type FieldName,
  fieldTitles,
  formerLeftOn,
  isRehire,
  matchedName,
  pagesOf,
  type Person,
  personName,
  positionOf,
  resolveField,
  type ReviewContext,
  titleGroupOf,
  titleStatus,
  withField,
  withMatchDeclined,
  withPersonChange,
  workplaceGroupOf,
  workplaceOf,
  workplaceStatus,
} from './employee-review-model';
import { FieldInput } from './person-fields';
import { PhotoNumbers } from './person-photos';
import { showChoice } from './person-sections';
import { dateFields, fieldProblem, typedValue } from './person-values';
import { orderedByClosest, withFields, withTitle, withWorkplace } from './review-changes';
import { dateLabel } from './review-format';
import type { Position, Workplace } from './use-review-context';

type Update = (mutate: (current: Changes) => Changes) => void;

export function DecideRow({
  id,
  title,
  subtitle,
  tone = 'destructive',
  children,
}: {
  id: string;
  title: ReactNode;
  subtitle?: ReactNode;
  tone?: 'destructive' | 'warning';
  children: ReactNode;
}) {
  return (
    <div
      id={id}
      role="group"
      tabIndex={-1}
      aria-labelledby={`${id}-title`}
      data-tone={tone}
      className="grid scroll-mt-24 gap-x-5 gap-y-3 border-t px-5 py-4 outline-none first:border-t-0 focus-visible:bg-secondary/60 lg:grid-cols-[11.25rem_minmax(0,1fr)] lg:items-center"
      data-testid={`person-decide-${id}`}
    >
      <div className="grid content-start gap-0.5">
        <h3 id={`${id}-title`} className="text-[15px] font-semibold">
          {title}
        </h3>
        {subtitle && <p className="text-[13px] text-muted-foreground">{subtitle}</p>}
      </div>
      <div className="grid min-w-0 gap-3">{children}</div>
    </div>
  );
}

// A button, not a radio: arrow keys move a radio's choice, and a choice here is saved at once,
// for every person of a title, and closes its card.
function Option({
  checked,
  onSelect,
  label,
  tag,
  detail,
  testId,
}: {
  checked: boolean;
  onSelect: () => void;
  label: ReactNode;
  tag?: ReactNode;
  detail?: ReactNode;
  testId?: string;
}) {
  return (
    <div
      className={cn(
        'relative grid grid-cols-[1rem_minmax(0,1fr)_auto] items-start gap-x-3 gap-y-0.5 rounded-lg border px-3 py-2.5 text-sm has-[>button:focus-visible]:ring-[3px] has-[>button:focus-visible]:ring-ring/50',
        checked && 'border-primary bg-primary/5'
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          'mt-0.5 grid size-4 place-items-center rounded-full border',
          checked ? 'border-primary' : 'border-input'
        )}
      >
        {checked && <span className="size-2 rounded-full bg-primary" />}
      </span>
      <button
        type="button"
        aria-pressed={checked}
        onClick={onSelect}
        className="cursor-pointer text-left font-medium outline-none after:absolute after:inset-0 after:rounded-lg after:content-['']"
        data-testid={testId}
      >
        {label}
      </button>
      <span className="relative">{tag}</span>
      {detail && <span className="col-start-2 col-end-4 text-muted-foreground">{detail}</span>}
    </div>
  );
}

const positionDetail = (position: Position) =>
  [
    roCount(position.employeeCount, 'lucrător', 'lucrători'),
    staffCategoryLabels[position.staffCategory],
    position.trainingIntervalMonths
      ? `instruire periodică la ${position.trainingIntervalMonths} luni`
      : null,
  ]
    .filter(Boolean)
    .join('. ');

export function PostDecision({
  context,
  person,
  positions,
  clientId,
  onChange,
}: {
  context: ReviewContext;
  person: Person;
  positions: Position[];
  clientId: string;
  onChange: Update;
}) {
  const [adding, setAdding] = useState(false);
  const group = titleGroupOf(context.proposal, person);
  const chosen = positionOf(context, person);
  const decided =
    context.changes.people[person.id]?.jobPositionId !== undefined ||
    (group !== null && titleStatus(context.changes, group) === 'decided');
  const title = group?.title ?? String(resolveField(context, person, 'jobTitle').value ?? '');
  const others = group ? group.personIds.filter((id) => id !== person.id) : [];
  const names = others
    .map((id) => context.proposal.people.find((each) => each.id === id))
    .filter((each): each is Person => Boolean(each))
    .map((each) => personName(context, each));
  const choose = (id: string) =>
    onChange((current) =>
      group
        ? withTitle(current, group.id, id)
        : withPersonChange(current, person.id, (change) => ({ ...change, jobPositionId: id }))
    );
  const count = group?.personIds.length ?? 1;
  const subtitle =
    group?.match === 'near'
      ? 'Seamănă cu un post al clientului'
      : title
        ? 'Nu există încă la client'
        : 'Fișa nu scrie postul';
  const shared =
    count > 1 ? (
      <p className="text-[13px] text-muted-foreground">
        Se aplică tuturor celor {count} persoane cu funcția{' '}
        <span className="font-semibold text-foreground">{title}</span>: {names.join(', ')}. Funcția
        de pe fișă se păstrează oricum la fiecare.
      </p>
    ) : null;
  return (
    <DecideRow
      id="post"
      tone={group?.match === 'near' ? 'warning' : 'destructive'}
      title="Postul"
      subtitle={subtitle}
    >
      {positions.length === 0 ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => setAdding(true)}
            data-testid="person-post-new"
          >
            {title ? `Adaugă postul ${title}` : 'Adaugă postul'}
          </Button>
          {shared}
        </div>
      ) : (
        <>
          {shared}
          {decided && <Tag tone="success">Ales</Tag>}
          <div role="group" aria-labelledby="post-title" className="grid gap-2">
            {orderedByClosest(positions, group?.closestId ?? group?.proposedId ?? null).map(
              (position) => (
                <Option
                  key={position.id}
                  checked={decided && chosen === position.id}
                  onSelect={() => choose(position.id)}
                  label={position.name}
                  tag={
                    position.id === (group?.closestId ?? group?.proposedId) ? (
                      <Tag tone="muted">
                        {group?.match === 'near' ? 'Propus' : 'Cel mai apropiat'}
                      </Tag>
                    ) : null
                  }
                  detail={positionDetail(position)}
                  testId="person-post-option"
                />
              )
            )}
            <Option
              checked={false}
              onSelect={() => setAdding(true)}
              label={title ? `Adaugă un post nou: ${title}` : 'Adaugă un post nou'}
              detail="Se deschide fereastra postului, aceeași ca în fila Posturi de lucru. Postul se adaugă la client acum; riscurile și echipamentul le completezi după, pe pagina postului."
              testId="person-post-new"
            />
          </div>
        </>
      )}
      <JobPositionDialog
        clientId={clientId}
        editing={adding ? 'new' : null}
        initialName={title || undefined}
        onClose={() => setAdding(false)}
        onSaved={(position) => choose(position.id)}
      />
    </DecideRow>
  );
}

function unreadableDigit(value: string) {
  const at = value.search(/[^0-9]/);
  return at === -1 ? null : at + 1;
}

const ordinals = [
  '',
  'prima',
  'a doua',
  'a treia',
  'a patra',
  'a cincea',
  'a șasea',
  'a șaptea',
  'a opta',
  'a noua',
  'a zecea',
  'a unsprezecea',
  'a douăsprezecea',
  'a treisprezecea',
];

export function CnpDecision({
  context,
  person,
  onChange,
}: {
  context: ReviewContext;
  person: Person;
  onChange: Update;
}) {
  const change = context.changes.people[person.id];
  const read = resolveField(context, person, 'cnp');
  const written = String(read.options[0]?.value ?? read.value ?? '');
  const digit = unreadableDigit(written);
  const birthDate = resolveField(context, person, 'birthDate').value;
  const typed = change?.fields?.cnp?.value;
  const mode =
    change?.cnpCorrection === true
      ? 'correction'
      : typed === null
        ? 'none'
        : typed !== undefined
          ? 'own'
          : null;
  const [own, setOwn] = useState(typeof typed === 'string' ? typed : '');
  const ownValid = isValidCnp(own);
  const setMode = (next: 'correction' | 'own' | 'none', value?: string) =>
    onChange((current) => {
      const cleared = withPersonChange(current, person.id, (each) => ({
        ...each,
        cnpCorrection: next === 'correction' ? true : undefined,
      }));
      if (next === 'none') return withField(cleared, person.id, 'cnp', { value: null });
      if (next === 'own' && value) return withField(cleared, person.id, 'cnp', { value });
      return withField(cleared, person.id, 'cnp', null);
    });
  return (
    <DecideRow
      id="cnp"
      title="CNP-ul"
      subtitle={
        digit !== null && digit < ordinals.length
          ? `${ordinals[digit]!.charAt(0).toUpperCase()}${ordinals[digit]!.slice(1)} cifră nu se citește`
          : 'Cel de pe fișă nu e valid'
      }
    >
      {written && (
        <p className="font-mono text-lg tracking-wider tabular-nums" aria-label="CNP-ul de pe fișă">
          {written.replace(/[^0-9]/g, '_')}
        </p>
      )}
      {person.cnpCorrection && typeof birthDate === 'string' && (
        <p className="text-sm tabular-nums">
          După data nașterii de pe fișă, {formatRoDate(birthDate)}, CNP-ul corect pare{' '}
          {person.cnpCorrection}. Cu el, CNP-ul e valid.
        </p>
      )}
      <div role="group" aria-labelledby="cnp-title" className="grid gap-2">
        {person.cnpCorrection && (
          <Option
            checked={mode === 'correction'}
            onSelect={() => setMode('correction')}
            label={<span className="tabular-nums">Folosește {person.cnpCorrection}</span>}
            tag={<Tag tone="success">Valid</Tag>}
            testId="person-cnp-correction"
          />
        )}
        <Option
          checked={mode === 'own'}
          onSelect={() => ownValid && setMode('own', own)}
          label="Scrie alt CNP"
          detail={
            <span className="relative flex flex-wrap items-center gap-2">
              <Input
                aria-label="CNP"
                inputMode="numeric"
                placeholder="13 cifre"
                className="h-9 max-w-48 tabular-nums"
                value={own}
                aria-invalid={own.length === 13 && !ownValid}
                onChange={(event) => setOwn(event.target.value.replace(/\D/g, '').slice(0, 13))}
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={!ownValid}
                onClick={() => setMode('own', own)}
              >
                Folosește
              </Button>
              {own.length === 13 && !ownValid && (
                <span className="text-destructive">CNP-ul nu e valid.</span>
              )}
            </span>
          }
          testId="person-cnp-own"
        />
        <Option
          checked={mode === 'none'}
          onSelect={() => setMode('none')}
          label="Lasă fără CNP"
          detail="Îl completezi mai târziu, pe pagina lucrătorului."
          testId="person-cnp-none"
        />
      </div>
    </DecideRow>
  );
}

export function WorkplaceDecision({
  context,
  person,
  workplaces,
  onChange,
}: {
  context: ReviewContext;
  person: Person;
  workplaces: Workplace[];
  onChange: Update;
}) {
  const group = workplaceGroupOf(context.proposal, person);
  if (!group || workplaces.length <= 1) return null;
  const chosen = workplaceOf(context, person);
  const decided =
    context.changes.people[person.id]?.workplaceId !== undefined ||
    workplaceStatus(context.changes, group) === 'decided';
  const choose = (id: string | null) => onChange((current) => withWorkplace(current, group.id, id));
  return (
    <DecideRow
      id="workplace"
      tone="warning"
      title="Locul de muncă"
      subtitle={
        group.text ? (
          <>
            Pe fișă: <span className="font-semibold text-foreground">{group.text}</span>
          </>
        ) : (
          'Fișa nu scrie locul de muncă'
        )
      }
    >
      <p className="text-sm">
        {group.personIds.length > 1
          ? `Ce alegi aici se aplică tuturor celor ${group.personIds.length} cu același loc pe fișă.`
          : 'Alege unul dintre locurile de muncă ale clientului.'}{' '}
        Fără el, lucrătorul se creează, iar locul îl completezi după.
      </p>
      <div role="group" aria-labelledby="workplace-title" className="grid gap-2">
        {workplaces.map((workplace) => (
          <Option
            key={workplace.id}
            checked={decided && chosen === workplace.id}
            onSelect={() => choose(workplace.id)}
            label={workplace.name}
            tag={
              workplace.id === (group.proposedId ?? group.closestId) ? (
                <Tag tone="muted">Propus</Tag>
              ) : null
            }
          />
        ))}
        <Option
          checked={decided && chosen === null}
          onSelect={() => choose(null)}
          label="Fără loc de muncă deocamdată"
        />
      </div>
    </DecideRow>
  );
}

export function FieldChoice({
  context,
  person,
  name,
  onChange,
}: {
  context: ReviewContext;
  person: Person;
  name: FieldName;
  onChange: Update;
}) {
  const id = `choice-${name}`;
  const count = resolveField(context, person, name).options.length;
  return (
    <DecideRow
      id={id}
      title={fieldLabels[name]}
      subtitle={`Fișele scriu ${roCount(count, 'variantă', 'variante')}`}
    >
      <ChoiceCards
        context={context}
        person={person}
        name={name}
        labelledBy={`${id}-title`}
        onChange={onChange}
      />
    </DecideRow>
  );
}

export function ChoiceCards({
  context,
  person,
  name,
  labelledBy,
  onChange,
}: {
  context: ReviewContext;
  person: Person;
  name: FieldName;
  labelledBy: string;
  onChange: Update;
}) {
  const field = resolveField(context, person, name);
  const pages = pagesOf(context, person.id);
  const change = context.changes.people[person.id]?.fields?.[name];
  const typed = change?.value;
  const [other, setOther] = useState(typed === undefined || typed === null ? '' : String(typed));
  const [otherOpen, setOtherOpen] = useState(typed !== undefined);
  const [otherError, setOtherError] = useState<string | null>(null);
  const group = useId();
  const inputId = `${group}-other`;
  const picked = otherOpen ? null : (change?.option ?? null);
  const anyPicked = otherOpen || picked !== null;

  function submitOther(event: FormEvent) {
    event.preventDefault();
    const problem =
      other.trim() === ''
        ? dateFields.has(name)
          ? 'Scrie data, de exemplu 01.03.2024.'
          : 'Scrie valoarea.'
        : fieldProblem(name, other);
    setOtherError(problem);
    if (problem) return;
    onChange((current) => withFields(current, person.id, { [name]: typedValue(name, other) }));
  }

  return (
    <div role="radiogroup" aria-labelledby={labelledBy} className="flex min-w-0 flex-wrap gap-2">
      {field.options.map((option) => {
        const checked = picked === option.index;
        return (
          <div
            key={option.index}
            className={choiceCard}
            data-checked={checked}
            data-testid="person-choice-option"
          >
            <label className="flex min-w-0 cursor-pointer items-center gap-2.5 py-2 pr-3 pl-3 text-sm">
              <input
                type="radio"
                name={group}
                checked={checked}
                onChange={() => {
                  setOtherOpen(false);
                  onChange((current) =>
                    withField(current, person.id, name, { option: option.index })
                  );
                }}
                className="size-4 shrink-0 cursor-pointer accent-primary"
              />
              <span className="min-w-0 wrap-anywhere">{showChoice(name, option.value)}</span>
            </label>
            <PhotoNumbers
              pages={pages}
              pageIds={option.pageIds}
              tabIndex={anyPicked && !checked ? -1 : undefined}
              className="my-2 mr-2 border-l pl-2"
            />
          </div>
        );
      })}
      <div className={cn(choiceCard, otherOpen && 'basis-full flex-wrap')} data-checked={otherOpen}>
        <label className="flex min-w-0 cursor-pointer items-center gap-2.5 py-2 pr-3 pl-3 text-sm">
          <input
            type="radio"
            name={group}
            checked={otherOpen}
            onChange={() => setOtherOpen(true)}
            className="size-4 shrink-0 cursor-pointer accent-primary"
            data-testid="person-choice-other"
          />
          Altă valoare
        </label>
        {otherOpen && (
          <form className="grid basis-full gap-1.5 px-3 pb-3" noValidate onSubmit={submitOther}>
            <span className="flex flex-wrap items-center gap-2">
              <label htmlFor={inputId} className="sr-only">
                {fieldTitles[name]}
              </label>
              <FieldInput
                id={inputId}
                name={name}
                value={other}
                invalid={Boolean(otherError)}
                describedBy={otherError ? `${inputId}-error` : undefined}
                className="max-w-xs min-w-0 flex-1"
                onChange={setOther}
              />
              <Button type="submit" variant="outline" data-testid="person-choice-other-use">
                Folosește
              </Button>
            </span>
            {otherError && (
              <span id={`${inputId}-error`} className="text-[13px] text-destructive">
                {otherError}
              </span>
            )}
          </form>
        )}
      </div>
    </div>
  );
}

const choiceCard =
  'flex max-w-full min-w-0 items-center rounded-[10px] border bg-card has-checked:border-primary has-checked:ring-1 has-checked:ring-primary has-focus-visible:ring-[3px] has-focus-visible:ring-ring/50';

export function MatchDecision({
  context,
  person,
  clientId,
  decisions,
  onChange,
}: {
  context: ReviewContext;
  person: Person;
  clientId: string;
  decisions: Decision[];
  onChange: Update;
}) {
  const match = person.existing;
  if (!match) return null;
  const change = context.changes.people[person.id];
  const asked = match.matchedBy === 'name_only' && change?.existing === undefined;
  const rehire = isRehire(context, person);
  const twin = decisions.find((decision) => decision.key === 'match' && !asked);
  const name = matchedName(person);
  const leftAt = formerLeftOn(person);
  const hiredAt = person.fields.hiredAt.app;
  const hire = resolveField(context, person, 'hiredAt');
  const sheetHiredAt = hire.edited ? hire.value : hire.sheet;
  const employee = (
    <Link
      to="/clienti/$clientId/angajati/$employeeId"
      params={{ clientId, employeeId: match.employeeId }}
      className="underline"
    >
      Deschide lucrătorul
    </Link>
  );
  return (
    <DecideRow
      id="match"
      title={
        asked
          ? 'Este același lucrător?'
          : rehire
            ? 'Angajat din nou după plecare'
            : 'Același lucrător la două persoane'
      }
    >
      {asked && (
        <p className="text-sm">
          Fișa nu are CNP și nici data nașterii. Clientul are un singur lucrător cu același nume,{' '}
          {name}
          {hiredAt ? `, angajat la ${dateLabel(String(hiredAt))}` : ''}
          {leftAt ? `, plecat din firmă la ${dateLabel(leftAt)}` : ''}. {employee}
        </p>
      )}
      {rehire && leftAt && (
        <p className="text-sm">
          {name} a plecat din firmă la {dateLabel(leftAt)}, iar fișa scrie angajarea
          {typeof sheetHiredAt === 'string' ? ` la ${dateLabel(sheetHiredAt)}` : ' după plecare'}.
          În aplicație, o reangajare după o pauză e un lucrător nou, nu cel vechi readus. Îl poți
          crea ca lucrător nou, poți corecta mai jos data angajării, dacă e citită greșit, sau îl
          poți lăsa deoparte. {employee}
        </p>
      )}
      {twin && (
        <p className="text-sm">
          {twin.label}. Un lucrător se completează o singură dată: spune că nu e el sau lasă una
          dintre persoane deoparte.
        </p>
      )}
      <div role="group" aria-labelledby="match-title" className="grid gap-2">
        {asked && (
          <Option
            checked={false}
            onSelect={() =>
              onChange((current) =>
                withPersonChange(current, person.id, (each) => ({ ...each, existing: true }))
              )
            }
            label="Da, e același lucrător"
            detail="Îl completăm cu ce lipsește și cu instruirile de pe fișă."
            testId="person-match-confirm"
          />
        )}
        <Option
          checked={false}
          onSelect={() =>
            onChange((current) =>
              withMatchDeclined({ ...context, changes: current }, person, rehire)
            )
          }
          label={asked ? 'Nu, e altă persoană' : 'Creează-l ca lucrător nou'}
          detail={
            rehire
              ? 'Fără CNP și număr de marcă, care rămân la fostul lucrător. Îi alegi postul.'
              : 'Datele din aplicație nu se folosesc. Îi alegi postul.'
          }
          testId="person-match-decline"
        />
        {!asked && (
          <Option
            checked={false}
            onSelect={() =>
              onChange((current) =>
                withPersonChange(current, person.id, (each) => ({ ...each, state: 'set_aside' }))
              )
            }
            label="Lasă-l deoparte"
            detail="Nu îl creăm și nu îl completăm la confirmare."
            testId="person-match-aside"
          />
        )}
      </div>
    </DecideRow>
  );
}
