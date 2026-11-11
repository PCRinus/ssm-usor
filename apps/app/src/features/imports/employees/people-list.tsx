import { Card } from '@ssm-usor/ui/components/card';
import { Link } from '@tanstack/react-router';
import {
  BriefcaseBusiness,
  Calendar,
  CalendarCheck,
  FileImage,
  TriangleAlert,
  UsersRound,
} from 'lucide-react';

import type { ImportDetail } from '@/api/generated/api';

import { Includable } from '../include-switch';
import { Fact, Facts, SectionHeader, StatusTag, Tag } from '../review-parts';
import {
  type Changes,
  decisionSummary,
  ownRows,
  pagesOf,
  peopleGroups,
  personIncluded,
  type PersonView,
  positionOf,
  proposedPersonIncluded,
  resolveField,
  type ReviewContext,
  withPersonIncluded,
} from './employee-review-model';
import { PageThumb } from './page-thumb';
import { dateLabel, pagesPhotosLabel, peopleLabel, trainingsLabel } from './review-format';
import { type Position, positionName } from './use-review-context';

export const peopleSectionId = 'employee-hub-people';

export function PeopleList({
  detail,
  clientId,
  context,
  views,
  positions,
  photos,
  toCheck,
  onChange,
}: {
  detail: ImportDetail;
  clientId: string;
  context: ReviewContext;
  views: PersonView[];
  positions: Position[];
  photos: string;
  toCheck: number;
  onChange: (mutate: (current: Changes) => Changes) => void;
}) {
  return (
    <section aria-labelledby={peopleSectionId} className="scroll-mt-24">
      <Card className="gap-0 overflow-hidden py-0">
        <div className="border-b px-4 py-4 sm:px-5">
          <SectionHeader
            headingId={peopleSectionId}
            icon={UsersRound}
            title="Persoane"
            description={
              <Facts>
                <Fact icon={UsersRound}>{peopleLabel(views.length)}</Fact>
                <Fact icon={FileImage}>{photos}</Fact>
              </Facts>
            }
            status={
              toCheck > 0 ? (
                <Tag tone="info" testId="section-status">
                  {toCheck} de verificat
                </Tag>
              ) : (
                <StatusTag status={{ kind: 'done' }} />
              )
            }
          />
        </div>
        {peopleGroups(views).map((group) => (
          <div
            key={group.key}
            data-testid="employee-hub-group"
            data-group={group.key}
            className="border-b last:border-b-0"
          >
            <h3 className="border-b bg-muted/40 px-4 py-2 text-sm font-semibold sm:px-5">
              {group.title}{' '}
              <span className="font-normal text-muted-foreground tabular-nums">
                {group.views.length}
              </span>
            </h3>
            <ul className="divide-y">
              {group.views.map((view) => (
                <PersonRow
                  key={view.person.id}
                  detail={detail}
                  clientId={clientId}
                  context={context}
                  view={view}
                  positions={positions}
                  onChange={onChange}
                />
              ))}
            </ul>
          </div>
        ))}
      </Card>
    </section>
  );
}

function PersonRow({
  detail,
  clientId,
  context,
  view,
  positions,
  onChange,
}: {
  detail: ImportDetail;
  clientId: string;
  context: ReviewContext;
  view: PersonView;
  positions: Position[];
  onChange: (mutate: (current: Changes) => Changes) => void;
}) {
  const { person } = view;
  const pages = pagesOf(context, person.id);
  const title = resolveField(context, person, 'jobTitle').value;
  const hiredAt = resolveField(context, person, 'hiredAt').value;
  const post = positionName(positions, positionOf(context, person)) ?? title;
  const rows = ownRows(context, person.id).filter(({ row }) => !row.testOnly).length;
  const summary = decisionSummary(view);
  return (
    <li data-testid="employee-hub-person" data-state={view.state}>
      <Includable
        id={`include-hub-${person.id}`}
        name={view.name}
        included={personIncluded(context, person)}
        proposed={proposedPersonIncluded(context, person)}
        testId="employee-hub-include"
        collapsedClassName="px-4 py-3 sm:pr-5 sm:pl-[4.75rem]"
        onChange={(next) =>
          onChange((current) => withPersonIncluded({ ...context, changes: current }, person, next))
        }
      >
        {(toggle) => (
          <div className="group/row relative grid grid-cols-[2.5rem_minmax(0,1fr)_auto] items-start gap-x-4 px-4 py-3 transition-colors hover:bg-muted/50 sm:pr-5 md:grid-cols-[2.5rem_minmax(0,1.25fr)_minmax(0,1fr)_auto] md:items-center">
            {pages[0] ? (
              <PageThumb detail={detail} page={pages[0]} className="h-12 w-10" />
            ) : (
              <span className="block h-12 w-10 rounded-md bg-secondary" aria-hidden="true" />
            )}
            <span className="grid min-w-0 gap-1 md:contents">
              <span className="grid min-w-0 gap-0.5">
                <Link
                  to="/clienti/$clientId/angajati/import/$importId/$personId"
                  params={{ clientId, importId: detail.id, personId: person.id }}
                  className="w-fit max-w-full truncate text-[15px] font-semibold underline-offset-[3px] outline-none group-hover/row:underline after:absolute after:inset-0 after:content-[''] focus-visible:underline focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset"
                  data-testid="employee-hub-person-link"
                >
                  {view.name}
                </Link>
                <Facts>
                  {post && (
                    <Fact icon={BriefcaseBusiness} label="Postul">
                      {post}
                    </Fact>
                  )}
                  {hiredAt && (
                    <Fact icon={Calendar} label="Angajat">
                      din {dateLabel(String(hiredAt))}
                    </Fact>
                  )}
                  <Fact icon={CalendarCheck}>{trainingsLabel(rows)}</Fact>
                  <Fact icon={FileImage}>
                    {pages.length > 0 ? pagesPhotosLabel(pages) : 'Fără fotografii'}
                  </Fact>
                </Facts>
              </span>
              <span
                className="grid min-w-0 gap-1 text-sm"
                data-testid="employee-hub-person-summary"
              >
                {summary.count > 0 ? (
                  <span className="flex min-w-0 flex-wrap items-start gap-x-2 gap-y-1 md:flex-nowrap">
                    <Tag tone="destructive" className="mt-px tabular-nums">
                      {summary.count} de hotărât
                    </Tag>
                    <span className="min-w-0">{summary.text}</span>
                  </span>
                ) : (
                  view.state === 'to_check' && (
                    <span className="text-muted-foreground">Nimic de hotărât pe fișe</span>
                  )
                )}
                {view.notes.length > 0 && (
                  <span className="flex items-start gap-2 text-[13px] font-medium text-warning-foreground">
                    <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                    {view.notes.map((note) => note.tag).join(' · ')}
                  </span>
                )}
              </span>
            </span>
            <span className="relative z-10 flex items-center pt-0.5 md:pt-0">{toggle}</span>
          </div>
        )}
      </Includable>
    </li>
  );
}
