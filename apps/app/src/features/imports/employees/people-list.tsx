import { Card } from '@ssm-usor/ui/components/card';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Link } from '@tanstack/react-router';
import { Info } from 'lucide-react';
import { useState } from 'react';

import type { ImportDetail } from '@/api/generated/api';

import { Tag } from '../review-parts';
import {
  isExisting,
  ownRows,
  pagesOf,
  type PersonState,
  type PersonView,
  positionOf,
  resolveField,
  type ReviewContext,
  titleGroupOf,
  toCheckGroups,
} from './employee-review-model';
import { PageThumb } from './page-thumb';
import { dateLabel, pagesPhotosLabel, trainingsLabel } from './review-format';
import { type Position, positionName } from './use-review-context';

const tabs = [
  { state: 'to_check', label: 'De verificat' },
  { state: 'checked', label: 'Verificați' },
  { state: 'set_aside', label: 'Lăsați deoparte' },
  { state: 'all', label: 'Toate' },
] as const;

type Tab = (typeof tabs)[number]['state'];

export function PeopleList({
  detail,
  clientId,
  context,
  views,
  positions,
}: {
  detail: ImportDetail;
  clientId: string;
  context: ReviewContext;
  views: PersonView[];
  positions: Position[];
}) {
  const [tab, setTab] = useState<Tab>('to_check');
  const count = (state: Tab) =>
    state === 'all' ? views.length : views.filter((view) => view.state === state).length;
  const shown = tab === 'all' ? views : views.filter((view) => view.state === tab);
  const groups =
    tab === 'to_check'
      ? (() => {
          const { decide, unopened } = toCheckGroups(views);
          return [
            { title: 'Cu ceva de hotărât', views: decide },
            { title: 'Încă nedeschise', views: unopened },
          ].filter((group) => group.views.length > 0);
        })()
      : [{ title: null, views: shown }];
  return (
    <section aria-labelledby="employee-hub-people" className="grid gap-3">
      <h2 id="employee-hub-people" className="text-lg font-semibold">
        Persoanele de pe fișe
      </h2>
      <Card className="gap-0 overflow-hidden py-0">
        <div className="flex flex-wrap items-center gap-3 border-b px-4 py-2.5">
          <nav aria-label="Filtrează persoanele după stare" className="flex flex-wrap gap-1">
            {tabs.map((each) => (
              <button
                key={each.state}
                type="button"
                aria-current={tab === each.state ? 'page' : undefined}
                data-testid={`employee-hub-tab-${each.state}`}
                onClick={() => setTab(each.state)}
                className={cn(
                  'inline-flex min-h-9 items-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors',
                  tab === each.state
                    ? 'bg-secondary text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {each.label}
                <span className="rounded bg-background/70 px-1 text-xs tabular-nums">
                  {count(each.state)}
                </span>
              </button>
            ))}
          </nav>
          <span className="ml-auto hidden text-sm text-muted-foreground sm:inline">
            În ordinea fotografiilor
          </span>
        </div>
        {shown.length === 0 ? (
          <p className="px-5 py-8 text-center text-sm text-muted-foreground">
            {tab === 'to_check'
              ? 'Ai verificat pe toată lumea. Poți crea angajații.'
              : 'Nicio persoană aici.'}
          </p>
        ) : (
          groups.map((group) => (
            <div key={group.title ?? 'all'} data-testid="employee-hub-group">
              {group.title && (
                <h3 className="border-b bg-muted/40 px-5 py-2 text-sm font-semibold">
                  {group.title}{' '}
                  <span className="font-normal text-muted-foreground tabular-nums">
                    {group.views.length}
                  </span>
                </h3>
              )}
              <ul className="divide-y">
                {group.views.map((view) => (
                  <PersonRow
                    key={view.person.id}
                    detail={detail}
                    clientId={clientId}
                    context={context}
                    view={view}
                    positions={positions}
                  />
                ))}
              </ul>
            </div>
          ))
        )}
        <p className="flex gap-2.5 border-t px-5 py-3.5 text-sm text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            Deschizi o persoană, te uiți peste ce e semnalat și treci la următoarea: o marcăm
            verificată. Cine are ceva de hotărât rămâne aici până hotărăști.
          </span>
        </p>
      </Card>
    </section>
  );
}

const stateTags: Record<PersonState, { tone: 'info' | 'success' | 'muted'; label: string }> = {
  to_check: { tone: 'info', label: 'De verificat' },
  checked: { tone: 'success', label: 'Verificat' },
  set_aside: { tone: 'muted', label: 'Lăsat deoparte' },
};

function PersonRow({
  detail,
  clientId,
  context,
  view,
  positions,
}: {
  detail: ImportDetail;
  clientId: string;
  context: ReviewContext;
  view: PersonView;
  positions: Position[];
}) {
  const { person } = view;
  const pages = pagesOf(context, person.id);
  const title = resolveField(context, person, 'jobTitle').value;
  const hiredAt = resolveField(context, person, 'hiredAt').value;
  const group = titleGroupOf(context.proposal, person);
  const postId = positionOf(context, person);
  const rows = ownRows(context, person.id).filter(({ row }) => !row.testOnly).length;
  const postNote = isExisting(person)
    ? 'Angajat existent'
    : group?.match === 'none' && !context.changes.jobTitles[group.id]
      ? 'Se hotărăște mai sus'
      : postId && positionName(positions, postId) !== title
        ? `Propus: ${positionName(positions, postId)}`
        : null;
  const link = {
    to: '/clients/$clientId/employees/import/$importId/$personId',
    params: { clientId, importId: detail.id, personId: person.id },
  } as const;
  return (
    <li
      className="grid grid-cols-[2.5rem_minmax(0,1fr)] items-start gap-x-3 gap-y-1.5 px-5 py-3 md:grid-cols-[2rem_2.5rem_minmax(0,1.3fr)_minmax(0,1fr)_6.5rem_minmax(0,1.6fr)]"
      data-testid="employee-hub-person"
      data-state={view.state}
    >
      <span className="hidden pt-1 text-sm text-muted-foreground tabular-nums md:block">
        {view.number}
      </span>
      <Link {...link} tabIndex={-1} aria-hidden="true">
        {pages[0] ? (
          <PageThumb detail={detail} page={pages[0]} className="h-12 w-10" />
        ) : (
          <span className="block h-12 w-10 rounded-md bg-secondary" />
        )}
      </Link>
      <span className="grid min-w-0">
        <Link
          {...link}
          className="truncate font-medium hover:underline"
          data-testid="employee-hub-person-link"
        >
          {view.name}
        </Link>
        <span className="text-[13px] text-muted-foreground">
          {pages.length > 0 ? pagesPhotosLabel(pages) : 'Fără fotografii'}
          <span className="md:hidden">
            {title ? `, ${title}` : ''}
            {hiredAt ? `, din ${dateLabel(String(hiredAt))}` : ''}
          </span>
        </span>
      </span>
      <span className="col-start-2 hidden min-w-0 text-sm md:col-start-auto md:grid">
        <span className="truncate">{title ?? '—'}</span>
        {postNote && (
          <span
            className={cn(
              'text-[13px]',
              postNote === 'Se hotărăște mai sus' ? 'text-destructive' : 'text-muted-foreground'
            )}
          >
            {postNote}
          </span>
        )}
      </span>
      <span className="hidden text-sm tabular-nums md:block">
        {hiredAt ? dateLabel(String(hiredAt)) : <span className="text-destructive">Lipsește</span>}
        <span className="block text-[13px] text-muted-foreground">{trainingsLabel(rows)}</span>
      </span>
      <span className="col-start-2 flex flex-wrap gap-1.5 md:col-start-auto">
        {view.state !== 'to_check' && (
          <Tag tone={stateTags[view.state].tone}>{stateTags[view.state].label}</Tag>
        )}
        {view.decisions.map((decision) => (
          <Tag key={decision.key} tone={decision.tone}>
            {decision.tag}
          </Tag>
        ))}
        {view.notes.slice(0, view.decisions.length > 0 ? 1 : 2).map((note) => (
          <Tag key={note.key} tone="warning">
            {note.tag}
          </Tag>
        ))}
        {view.state === 'to_check' && view.decisions.length === 0 && view.notes.length === 0 && (
          <Tag tone="muted">Nedeschisă</Tag>
        )}
      </span>
    </li>
  );
}
