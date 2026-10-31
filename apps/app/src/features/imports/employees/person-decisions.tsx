import { isValidCnp } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { Input } from '@ssm-usor/ui/components/input';
import { cn } from '@ssm-usor/ui/lib/utils';
import { type ReactNode, useState } from 'react';

import { roCount } from '@/features/employees/employee-format';
import { JobPositionDialog } from '@/features/job-positions/job-position-dialog';
import { staffCategoryLabels } from '@/features/job-positions/job-position-schema';
import { formatRoDate } from '@/lib/dates';

import { Tag } from '../review-parts';
import {
  type Changes,
  fieldLabels,
  type FieldName,
  type Person,
  personName,
  positionOf,
  resolveField,
  type ReviewContext,
  titleGroupOf,
  titleStatus,
  withField,
  withPersonChange,
  workplaceGroupOf,
  workplaceOf,
  workplaceStatus,
} from './employee-review-model';
import { PageButton } from './photo-column';
import { orderedByClosest, withTitle, withWorkplace } from './review-changes';
import { dateLabel } from './review-format';
import type { Position, Workplace } from './use-review-context';

type Update = (mutate: (current: Changes) => Changes) => void;

export function DecideCard({
  id,
  title,
  tone = 'destructive',
  children,
}: {
  id: string;
  title: ReactNode;
  tone?: 'destructive' | 'warning';
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className={cn(
        'grid scroll-mt-32 gap-3 rounded-xl border-[1.5px] bg-card px-5 py-4',
        tone === 'destructive' ? 'border-destructive-border' : 'border-warning-border'
      )}
      data-testid={`person-decide-${id}`}
    >
      <h2 id={`${id}-title`} className="text-base font-semibold">
        {title}
      </h2>
      {children}
    </section>
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
    roCount(position.employeeCount, 'angajat', 'angajați'),
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
  const heading =
    group?.match === 'near' ? (
      <>«{title}» seamănă cu un post al clientului</>
    ) : title ? (
      <>«{title}» nu există la client</>
    ) : (
      'Fișa nu scrie postul'
    );
  return (
    <DecideCard
      id="post"
      tone={group?.match === 'near' ? 'warning' : 'destructive'}
      title={
        <>
          {heading}
          {count > 1 && (
            <span className="font-normal text-muted-foreground">
              {' '}
              · {roCount(count, 'persoană', 'persoane')}
            </span>
          )}
        </>
      }
    >
      {count > 1 && (
        <p className="text-sm">
          Același post e scris pe fișele a {roCount(count, 'persoană', 'persoane')}:{' '}
          {personName(context, person)}, {names.join(', ')}. Ce alegi aici se aplică tuturor celor{' '}
          {count}. Funcția de pe fișă se păstrează oricum la fiecare.
        </p>
      )}
      {decided && <Tag tone="success">Ales</Tag>}
      <p className="text-sm font-medium">Alege un post existent</p>
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
                  <Tag tone="muted">{group?.match === 'near' ? 'Propus' : 'Cel mai apropiat'}</Tag>
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
      <JobPositionDialog
        clientId={clientId}
        editing={adding ? 'new' : null}
        initialName={title || undefined}
        onClose={() => setAdding(false)}
        onSaved={(position) => choose(position.id)}
      />
    </DecideCard>
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
    <DecideCard
      id="cnp"
      title={
        digit !== null && digit < ordinals.length
          ? `${ordinals[digit]!.charAt(0).toUpperCase()}${ordinals[digit]!.slice(1)} cifră din CNP nu se citește`
          : 'CNP-ul de pe fișă nu e valid'
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
          detail="Îl completezi mai târziu, pe pagina angajatului."
          testId="person-cnp-none"
        />
      </div>
    </DecideCard>
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
    <DecideCard
      id="workplace"
      tone="warning"
      title={
        <>
          {group.text ? `Locul de muncă «${group.text}»` : 'Fișa nu scrie locul de muncă'}
          {group.personIds.length > 1 && (
            <span className="font-normal text-muted-foreground">
              {' '}
              · {roCount(group.personIds.length, 'persoană', 'persoane')}
            </span>
          )}
        </>
      }
    >
      <p className="text-sm">
        {group.personIds.length > 1
          ? `Ce alegi aici se aplică tuturor celor ${group.personIds.length} cu același loc pe fișă.`
          : 'Alege unul dintre locurile de muncă ale clientului.'}{' '}
        Fără el, angajatul se creează, iar locul îl completezi după.
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
    </DecideCard>
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
  const field = resolveField(context, person, name);
  const pages = context.proposal.pages.filter((page) =>
    field.options.some((option) => option.pageIds.includes(page.id))
  );
  const chosen = context.changes.people[person.id]?.fields?.[name]?.option;
  const show = (value: string | number) =>
    name === 'birthDate' || name === 'hiredAt' || name === 'leftOn'
      ? dateLabel(String(value))
      : String(value);
  return (
    <DecideCard id={`choice-${name}`} title={`${fieldLabels[name]}: fișele scriu valori diferite`}>
      <div role="group" aria-labelledby={`choice-${name}-title`} className="grid gap-2">
        {field.options.map((option) => (
          <Option
            key={option.index}
            checked={chosen === option.index}
            onSelect={() =>
              onChange((current) => withField(current, person.id, name, { option: option.index }))
            }
            label={show(option.value)}
            tag={
              <span className="flex gap-1">
                {option.pageIds.map((pageId) => (
                  <PageButton key={pageId} pages={pages} pageId={pageId} />
                ))}
              </span>
            }
          />
        ))}
      </div>
    </DecideCard>
  );
}
