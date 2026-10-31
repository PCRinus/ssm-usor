import { Button } from '@ssm-usor/ui/components/button';
import { Card } from '@ssm-usor/ui/components/card';
import { NativeSelect, NativeSelectOption } from '@ssm-usor/ui/components/native-select';
import { BriefcaseBusiness, Check, Info, MapPin } from 'lucide-react';
import { type ReactNode, useState } from 'react';

import { JobPositionDialog } from '@/features/job-positions/job-position-dialog';

import { Tag } from '../review-parts';
import {
  type Changes,
  type JobTitleGroup,
  personName,
  type ReviewContext,
  titleStatus,
  type WorkplaceGroup,
  workplaceStatus,
} from './employee-review-model';
import { orderedByClosest, withTitle, withWorkplace } from './review-changes';
import { joinNames, peopleLabel } from './review-format';
import { type Position, positionName, type Workplace, workplaceName } from './use-review-context';

const forAll = (count: number) =>
  count === 1 ? '' : count === 2 ? ' pentru amândoi' : ` pentru toți ${count}`;

const statusTags = {
  decide: (
    <Tag tone="destructive" testId="group-status">
      De hotărât
    </Tag>
  ),
  confirm: (
    <Tag tone="warning" testId="group-status">
      De confirmat
    </Tag>
  ),
  decided: (
    <Tag tone="success" icon={<Check aria-hidden="true" />} testId="group-status">
      Hotărât
    </Tag>
  ),
  exact: null,
};

function GroupRow({
  icon,
  tone,
  title,
  count,
  status,
  text,
  children,
  testId,
}: {
  icon: ReactNode;
  tone: 'decide' | 'confirm' | 'decided' | 'exact';
  title: string;
  count: number;
  status: ReactNode;
  text: ReactNode;
  children: ReactNode;
  testId: string;
}) {
  return (
    <div
      className="grid gap-x-4 gap-y-3 border-b px-5 py-4 last:border-b-0 md:grid-cols-[2.25rem_minmax(0,1fr)_minmax(0,22rem)]"
      data-testid={testId}
      data-status={tone}
    >
      <span
        className={
          tone === 'decide'
            ? 'hidden size-9 place-items-center rounded-lg bg-destructive-soft text-destructive-foreground md:grid'
            : tone === 'confirm'
              ? 'hidden size-9 place-items-center rounded-lg bg-warning text-warning-foreground md:grid'
              : 'hidden size-9 place-items-center rounded-lg bg-secondary md:grid'
        }
        aria-hidden="true"
      >
        {icon}
      </span>
      <div className="grid min-w-0 gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold">
            {title}{' '}
            <span className="font-normal text-muted-foreground">· {peopleLabel(count)}</span>
          </h3>
          {status}
        </div>
        <p className="text-sm text-muted-foreground">{text}</p>
      </div>
      <div className="flex flex-wrap items-end gap-2">{children}</div>
    </div>
  );
}

function ChoosePosition({
  group,
  positions,
  onChoose,
  onNew,
}: {
  group: JobTitleGroup;
  positions: Position[];
  onChoose: (id: string) => void;
  onNew: () => void;
}) {
  const ordered = orderedByClosest(positions, group.closestId ?? group.proposedId);
  const [picked, setChosen] = useState<string | null>(null);
  const chosen = picked ?? ordered[0]?.id ?? '';
  return (
    <>
      {ordered.length > 0 && (
        <span className="grid w-full gap-1.5 sm:w-auto sm:min-w-56">
          <label htmlFor={`post-${group.id}`} className="text-[13px] font-medium">
            Alege un post existent
          </label>
          <span className="flex gap-2">
            <NativeSelect
              id={`post-${group.id}`}
              size="sm"
              value={chosen}
              onChange={(event) => setChosen(event.target.value)}
            >
              {ordered.map((position) => (
                <NativeSelectOption key={position.id} value={position.id}>
                  {position.id === (group.closestId ?? group.proposedId)
                    ? `${position.name}, cel mai apropiat`
                    : position.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <Button
              type="button"
              variant="outline"
              size="sm"
              data-testid="group-use"
              onClick={() => chosen && onChoose(chosen)}
            >
              Folosește{forAll(group.personIds.length)}
            </Button>
          </span>
        </span>
      )}
      {ordered.length > 0 && <span className="pb-1.5 text-sm text-muted-foreground">sau</span>}
      <Button
        type="button"
        variant="outline"
        size="sm"
        data-testid="group-new-post"
        onClick={onNew}
      >
        Adaugă un post nou
      </Button>
    </>
  );
}

export function TitleGroups({
  context,
  positions,
  clientId,
  onChange,
}: {
  context: ReviewContext;
  positions: Position[];
  clientId: string;
  onChange: (mutate: (current: Changes) => Changes) => void;
}) {
  const [newFor, setNewFor] = useState<JobTitleGroup | null>(null);
  const [changing, setChanging] = useState<string[]>([]);
  const { proposal, changes } = context;
  const nameOf = (id: string) => {
    const person = proposal.people.find((each) => each.id === id);
    return person ? personName(context, person) : '';
  };
  const asked = proposal.jobTitles.filter((group) => group.match !== 'exact');
  const exact = proposal.jobTitles.filter((group) => group.match === 'exact');
  const exactCount = exact.reduce((total, group) => total + group.personIds.length, 0);
  if (proposal.jobTitles.length === 0) return null;
  const choose = (group: JobTitleGroup, id: string) => {
    onChange((current) => withTitle(current, group.id, id));
    setChanging((list) => list.filter((each) => each !== group.id));
  };
  return (
    <section aria-labelledby="employee-hub-posts" className="grid gap-3">
      <div className="grid gap-1">
        <h2 id="employee-hub-posts" className="text-lg font-semibold">
          Posturile de pe fișe
        </h2>
        <p className="text-sm text-muted-foreground">
          Fiecare angajat intră pe un post al clientului. Pentru același post scris pe mai multe
          fișe hotărăști o singură dată.
        </p>
      </div>
      <Card className="gap-0 overflow-hidden py-0">
        {asked.map((group) => {
          const status = titleStatus(changes, group);
          const people = joinNames(group.personIds.map(nameOf));
          const decidedId = changes.jobTitles[group.id]?.jobPositionId ?? group.proposedId;
          const proposed = positionName(positions, group.proposedId);
          const editing = changing.includes(group.id) || status === 'decide';
          return (
            <GroupRow
              key={group.id}
              testId="employee-hub-title"
              icon={<BriefcaseBusiness className="size-4" />}
              tone={status}
              title={group.title}
              count={group.personIds.length}
              status={statusTags[status]}
              text={
                status === 'decided'
                  ? `Primesc postul ${positionName(positions, decidedId) ?? 'ales'}. ${people}.`
                  : status === 'confirm'
                    ? `Propunem ${proposed}, postul clientului cel mai apropiat ca nume. ${people}.`
                    : `Nu există la client. ${people}.`
              }
            >
              {editing ? (
                <ChoosePosition
                  group={group}
                  positions={positions}
                  onChoose={(id) => choose(group, id)}
                  onNew={() => setNewFor(group)}
                />
              ) : status === 'confirm' && group.proposedId ? (
                <>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    data-testid="group-confirm"
                    onClick={() => choose(group, group.proposedId!)}
                  >
                    Confirmă {proposed}
                    {forAll(group.personIds.length)}
                  </Button>
                  <Button
                    type="button"
                    variant="link"
                    size="sm"
                    onClick={() => setChanging((list) => [...list, group.id])}
                  >
                    Alege alt post
                  </Button>
                </>
              ) : (
                <Button
                  type="button"
                  variant="link"
                  size="sm"
                  onClick={() => setChanging((list) => [...list, group.id])}
                >
                  Schimbă postul
                </Button>
              )}
            </GroupRow>
          );
        })}
        {exactCount > 0 && (
          <p
            className="flex gap-2.5 px-5 py-3.5 text-sm text-muted-foreground"
            data-testid="employee-hub-titles-exact"
          >
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              {asked.length > 0
                ? `Celelalte ${peopleLabel(exactCount)} au pe fișă exact un post al clientului și l-au primit: `
                : `${exactCount === 1 ? 'Persoana are' : `Toate cele ${peopleLabel(exactCount)} au`} pe fișă exact un post al clientului și l-au primit: `}
              {exact
                .map(
                  (group) =>
                    `${positionName(positions, group.proposedId) ?? group.title} ${group.personIds.length}`
                )
                .join(', ')}
              .
            </span>
          </p>
        )}
      </Card>
      <JobPositionDialog
        clientId={clientId}
        editing={newFor ? 'new' : null}
        initialName={newFor?.title}
        onClose={() => setNewFor(null)}
        onSaved={(position) => newFor && choose(newFor, position.id)}
      />
    </section>
  );
}

export function WorkplaceGroups({
  context,
  workplaces,
  onChange,
}: {
  context: ReviewContext;
  workplaces: Workplace[];
  onChange: (mutate: (current: Changes) => Changes) => void;
}) {
  const [changing, setChanging] = useState<string[]>([]);
  const { proposal, changes } = context;
  if (workplaces.length <= 1) return null;
  const asked = proposal.workplaces.filter((group) => group.match !== 'exact');
  if (asked.length === 0) return null;
  const nameOf = (id: string) => {
    const person = proposal.people.find((each) => each.id === id);
    return person ? personName(context, person) : '';
  };
  return (
    <section aria-labelledby="employee-hub-workplaces" className="grid gap-3">
      <div className="grid gap-1">
        <h2 id="employee-hub-workplaces" className="text-lg font-semibold">
          Locurile de muncă de pe fișe
        </h2>
        <p className="text-sm text-muted-foreground">
          Pentru același loc de muncă scris pe mai multe fișe hotărăști o singură dată. Un angajat
          fără loc de muncă se poate crea, iar locul îl completezi după.
        </p>
      </div>
      <Card className="gap-0 overflow-hidden py-0">
        {asked.map((group) => (
          <WorkplaceRow
            key={group.id}
            group={group}
            people={joinNames(group.personIds.map(nameOf))}
            workplaces={workplaces}
            status={workplaceStatus(changes, group)}
            decidedId={changes.workplaces[group.id]?.workplaceId}
            editing={changing.includes(group.id)}
            onEdit={() => setChanging((list) => [...list, group.id])}
            onChoose={(id) => {
              onChange((current) => withWorkplace(current, group.id, id));
              setChanging((list) => list.filter((each) => each !== group.id));
            }}
          />
        ))}
      </Card>
    </section>
  );
}

function WorkplaceRow({
  group,
  people,
  workplaces,
  status,
  decidedId,
  editing,
  onEdit,
  onChoose,
}: {
  group: WorkplaceGroup;
  people: string;
  workplaces: Workplace[];
  status: ReturnType<typeof workplaceStatus>;
  decidedId: string | null | undefined;
  editing: boolean;
  onEdit: () => void;
  onChoose: (id: string | null) => void;
}) {
  const [picked, setChosen] = useState<string | null>(null);
  const chosen = picked ?? group.closestId ?? group.proposedId ?? workplaces[0]?.id ?? '';
  const proposed = workplaceName(workplaces, group.proposedId);
  const title = group.text || 'Fără loc de muncă pe fișă';
  return (
    <GroupRow
      testId="employee-hub-workplace"
      icon={<MapPin className="size-4" />}
      tone={status}
      title={title}
      count={group.personIds.length}
      status={statusTags[status]}
      text={
        status === 'decided'
          ? `${decidedId ? `Primesc ${workplaceName(workplaces, decidedId)}` : 'Rămân fără loc de muncă'}. ${people}.`
          : status === 'confirm'
            ? `Propunem ${proposed}. ${people}.`
            : `${group.text ? 'Nu se potrivește cu niciun loc de muncă al clientului.' : 'Fișele nu scriu locul de muncă.'} ${people}.`
      }
    >
      {status === 'decided' && !editing ? (
        <Button type="button" variant="link" size="sm" onClick={onEdit}>
          Schimbă
        </Button>
      ) : status === 'confirm' && !editing && group.proposedId ? (
        <>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onChoose(group.proposedId)}
          >
            Confirmă {proposed}
          </Button>
          <Button type="button" variant="link" size="sm" onClick={onEdit}>
            Alege alt loc
          </Button>
        </>
      ) : (
        <>
          <span className="flex w-full gap-2 sm:w-auto sm:min-w-56">
            <NativeSelect
              size="sm"
              aria-label={`Locul de muncă pentru ${title}`}
              value={chosen}
              onChange={(event) => setChosen(event.target.value)}
            >
              {workplaces.map((workplace) => (
                <NativeSelectOption key={workplace.id} value={workplace.id}>
                  {workplace.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            <Button type="button" variant="outline" size="sm" onClick={() => onChoose(chosen)}>
              Folosește
            </Button>
          </span>
          <Button type="button" variant="link" size="sm" onClick={() => onChoose(null)}>
            Lasă fără loc de muncă
          </Button>
        </>
      )}
    </GroupRow>
  );
}
