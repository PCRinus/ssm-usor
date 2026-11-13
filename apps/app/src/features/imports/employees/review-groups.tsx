import { Button } from '@ssm-usor/ui/components/button';
import { Card } from '@ssm-usor/ui/components/card';
import { NativeSelect, NativeSelectOption } from '@ssm-usor/ui/components/native-select';
import { BriefcaseBusiness, Check, Info, MapPin, UsersRound } from 'lucide-react';
import { type ReactNode, useState } from 'react';

import { Masked } from '@/components/replay';
import { JobPositionDialog } from '@/features/job-positions/job-position-dialog';

import { Fact, Facts, SectionHeader, StatusTag, Tag } from '../review-parts';
import {
  type Changes,
  type GroupStatus,
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

export const postsSectionId = 'employee-hub-posts';
export const workplacesSectionId = 'employee-hub-workplaces';

const statusTags = {
  decide: null,
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

function OpenTag({ statuses }: { statuses: GroupStatus[] }) {
  const decide = statuses.filter((status) => status === 'decide').length;
  const confirm = statuses.filter((status) => status === 'confirm').length;
  if (decide + confirm === 0) return <StatusTag status={{ kind: 'done' }} />;
  return (
    <Tag tone={decide > 0 ? 'destructive' : 'warning'} testId="section-status">
      {decide > 0 ? `${decide + confirm} de hotărât` : `${confirm} de confirmat`}
    </Tag>
  );
}

function SectionCard({
  headingId,
  icon,
  title,
  description,
  status,
  children,
}: {
  headingId: string;
  icon: typeof MapPin;
  title: string;
  description: string;
  status: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={headingId} className="scroll-mt-24">
      <Card className="gap-0 overflow-hidden py-0" data-testid={headingId}>
        <div className="border-b px-4 py-4 sm:px-5">
          <SectionHeader
            headingId={headingId}
            icon={icon}
            title={title}
            description={description}
            status={status}
          />
        </div>
        <div className="divide-y">{children}</div>
      </Card>
    </section>
  );
}

function GroupRow({
  tone,
  title,
  status,
  facts,
  children,
  testId,
}: {
  tone: GroupStatus;
  title: string;
  status: ReactNode;
  facts: ReactNode;
  children: ReactNode;
  testId: string;
}) {
  return (
    <div
      className="grid gap-x-6 gap-y-3 px-4 py-4 sm:pr-5 sm:pl-[4.625rem] lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
      data-testid={testId}
      data-status={tone}
    >
      <div className="grid min-w-0 gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-[15px] font-semibold">{title}</h3>
          {status}
        </div>
        <Facts>{facts}</Facts>
      </div>
      <div className="flex flex-wrap items-end gap-2 lg:justify-end">{children}</div>
    </div>
  );
}

const peopleFact = (count: number, people: string) => (
  <Fact icon={UsersRound} wrap>
    {peopleLabel(count)}: <Masked>{people}</Masked>
  </Fact>
);

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
        {ordered.length > 0 ? 'Adaugă un post nou' : 'Adaugă postul'}
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
  const noPositions = !proposal.clientHasPositions && positions.length === 0;
  return (
    <SectionCard
      headingId={postsSectionId}
      icon={BriefcaseBusiness}
      title="Posturi de lucru"
      description={
        noPositions
          ? 'Clientul nu are încă posturi. Adaugă câte unul pentru fiecare funcție de pe fișe; îl completezi apoi pe pagina postului.'
          : 'Fiecare lucrător intră pe un post al clientului. Pentru aceeași funcție scrisă pe mai multe fișe hotărăști o singură dată.'
      }
      status={<OpenTag statuses={asked.map((group) => titleStatus(changes, group))} />}
    >
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
            tone={status}
            title={group.title}
            status={statusTags[status]}
            facts={
              <>
                {status === 'decided' && (
                  <Fact icon={BriefcaseBusiness} wrap>
                    Primesc postul {positionName(positions, decidedId) ?? 'ales'}
                  </Fact>
                )}
                {status === 'confirm' && (
                  <Fact icon={BriefcaseBusiness} wrap>
                    Propunem {proposed}, postul clientului cel mai apropiat ca nume
                  </Fact>
                )}
                {peopleFact(group.personIds.length, people)}
              </>
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
          className="flex gap-2.5 px-4 py-3.5 text-sm text-muted-foreground sm:px-5"
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
      <JobPositionDialog
        clientId={clientId}
        editing={newFor ? 'new' : null}
        initialName={newFor?.title}
        onClose={() => setNewFor(null)}
        onSaved={(position) => newFor && choose(newFor, position.id)}
      />
    </SectionCard>
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
    <SectionCard
      headingId={workplacesSectionId}
      icon={MapPin}
      title="Locuri de muncă"
      description="Pentru același loc de muncă scris pe mai multe fișe hotărăști o singură dată. Un lucrător fără loc de muncă se poate crea, iar locul îl completezi după."
      status={<OpenTag statuses={asked.map((group) => workplaceStatus(changes, group))} />}
    >
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
    </SectionCard>
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
      tone={status}
      title={title}
      status={statusTags[status]}
      facts={
        <>
          <Fact icon={MapPin} wrap>
            {status === 'decided'
              ? decidedId
                ? `Primesc ${workplaceName(workplaces, decidedId)}`
                : 'Rămân fără loc de muncă'
              : status === 'confirm'
                ? `Propunem ${proposed}`
                : group.text
                  ? 'Nu se potrivește cu niciun loc de muncă al clientului'
                  : 'Fișele nu scriu locul de muncă'}
          </Fact>
          {peopleFact(group.personIds.length, people)}
        </>
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
