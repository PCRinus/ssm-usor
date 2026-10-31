import { Button } from '@ssm-usor/ui/components/button';
import { Checkbox } from '@ssm-usor/ui/components/checkbox';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Link, useNavigate } from '@tanstack/react-router';
import { CircleAlert } from 'lucide-react';
import { useState } from 'react';

import type { ImportDetail } from '@/api/generated/api';
import { Notice } from '@/components/notice';

import { Tag } from '../review-parts';
import { SourceDialog, type SourceRequest } from '../source-dialog';
import {
  decisionsOf,
  isExisting,
  leaving,
  pagesOf,
  type Person,
  personName,
  type PersonState,
  positionOf,
  resolveField,
  type ReviewContext,
  withPersonChange,
} from './employee-review-model';
import {
  CnpDecision,
  DecideCard,
  FieldChoice,
  PostDecision,
  WorkplaceDecision,
} from './person-decisions';
import { ExistingComparison, FieldsCard } from './person-fields';
import { PersonTrainings } from './person-trainings';
import { PhotoColumn, PhotoThumbs } from './photo-column';
import { dateLabel, pageFileName, pagesPhotosLabel } from './review-format';
import { SaveStatus } from './save-status';
import { ShowPageContext } from './show-page';
import { positionName, useReviewContext } from './use-review-context';

const stateLabels: Record<PersonState, { label: string; tone: 'info' | 'success' | 'muted' }> = {
  to_check: { label: 'De verificat', tone: 'info' },
  checked: { label: 'Verificat', tone: 'success' },
  set_aside: { label: 'Lăsat deoparte', tone: 'muted' },
};

const wideScreen = () =>
  typeof window.matchMedia === 'function' && window.matchMedia('(min-width: 1024px)').matches;

export function EmployeePersonPage({
  detail,
  clientId,
  personId,
}: {
  detail: ImportDetail;
  clientId: string;
  personId: string;
}) {
  const navigate = useNavigate();
  const { review, context, positions, workplaces } = useReviewContext(detail, clientId);
  const people = context.proposal.people;
  const index = people.findIndex((each) => each.id === personId);
  const person = people[index];
  const pages = person ? pagesOf(context, person.id) : [];
  const [current, setCurrent] = useState<string | null>(pages[0]?.id ?? null);
  const [railOpen, setRailOpen] = useState(true);
  const [fullScreen, setFullScreen] = useState<SourceRequest | null>(null);

  if (!person) {
    return (
      <Notice variant="destructive" data-testid="person-missing">
        Persoana nu mai e în import.{' '}
        <Link
          to="/clients/$clientId/employees/import/$importId"
          params={{ clientId, importId: detail.id }}
          className="underline"
        >
          Înapoi la listă
        </Link>
      </Notice>
    );
  }

  const name = personName(context, person);
  const state = context.states[person.id] ?? 'to_check';
  const decisions = decisionsOf(context, person);
  const previous = people[index - 1];
  const next = people[index + 1];
  const existing = isExisting(person);
  const leftOn = resolveField(context, person, 'leftOn').value;
  const included = context.changes.people[person.id]?.included ?? person.proposedIncluded;

  const showPage = (pageId: string) => {
    setCurrent(pageId);
    setRailOpen(true);
    if (!wideScreen()) {
      const page = pages.find((each) => each.id === pageId);
      if (page) {
        setFullScreen({
          title: name,
          sources: [page, ...pages.filter((each) => each !== page)].map((each) => ({
            file: each.label,
            quote: '',
            label: pageFileName(each),
          })),
        });
      }
    }
  };

  const go = (to: Person | undefined) => {
    review.update((changes) => leaving({ ...context, changes }, person));
    if (to) {
      void navigate({
        to: '/clients/$clientId/employees/import/$importId/$personId',
        params: { clientId, importId: detail.id, personId: to.id },
      });
    } else {
      void navigate({
        to: '/clients/$clientId/employees/import/$importId',
        params: { clientId, importId: detail.id },
      });
    }
  };

  const setAside = (aside: boolean) =>
    review.update((current) =>
      withPersonChange(current, person.id, (change) => ({
        ...change,
        state: aside ? 'set_aside' : undefined,
      }))
    );

  const postId = positionOf(context, person);
  const contact = person.flags.some((flag) => flag.code === 'no_contact');
  const anchors = new Set(decisions.map((decision) => decision.anchor));
  const choiceFields = decisions
    .filter((decision) => decision.key.startsWith('choice-'))
    .map((decision) => decision.key.slice('choice-'.length) as Parameters<typeof resolveField>[2]);

  return (
    <ShowPageContext value={showPage}>
      <div className="grid gap-5" data-testid="person-page" data-state={state}>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="grid gap-1">
            <h1 className="text-2xl font-semibold tracking-tight">{name}</h1>
            <p className="text-sm text-muted-foreground">
              Din {pagesPhotosLabel(pages)}.{' '}
              {existing
                ? 'Ce are deja în aplicație nu se schimbă fără alegerea ta.'
                : 'Valorile se preiau așa cum sunt, dacă nu le schimbi.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Tag tone={stateLabels[state].tone} testId="person-state">
              {stateLabels[state].label}
            </Tag>
            <Link
              to="/clients/$clientId/employees/import/$importId"
              params={{ clientId, importId: detail.id }}
              className="text-sm text-muted-foreground tabular-nums hover:underline"
            >
              Persoana {index + 1} din {people.length}
            </Link>
            <Button
              variant="outline"
              size="sm"
              data-testid="person-set-aside"
              onClick={() => setAside(state !== 'set_aside')}
            >
              {state === 'set_aside' ? 'Ia-l înapoi la verificat' : 'Lasă-l deoparte'}
            </Button>
          </div>
        </div>
        <SaveStatus review={review} />
        <div
          className={cn(
            'grid items-start gap-6',
            railOpen ? 'lg:grid-cols-[360px_minmax(0,1fr)]' : 'lg:grid-cols-[4rem_minmax(0,1fr)]'
          )}
        >
          <PhotoColumn
            detail={detail}
            pages={pages}
            current={current}
            open={railOpen}
            name={name}
            onCurrent={setCurrent}
            onOpen={setRailOpen}
          />
          <div className="grid min-w-0 gap-4">
            <PhotoThumbs detail={detail} pages={pages} name={name} onShow={showPage} />
            {state === 'set_aside' && (
              <Notice variant="info">
                {name} e lăsat deoparte: nu se creează la confirmare. Îl poți lua înapoi oricând
                înainte de confirmare.
              </Notice>
            )}
            {decisions.length > 0 && (
              <section
                role="alert"
                aria-labelledby="person-decisions"
                className="grid gap-2 rounded-xl border border-destructive-border bg-destructive-soft px-5 py-4 text-destructive-foreground"
                data-testid="person-decisions"
              >
                <h2 id="person-decisions" className="flex items-center gap-2 font-semibold">
                  <CircleAlert className="size-4" aria-hidden="true" />
                  {decisions.length === 1
                    ? 'Un lucru de rezolvat aici'
                    : `${decisions.length} lucruri de rezolvat aici`}
                </h2>
                <ul className="grid list-disc gap-1 pl-6 text-sm">
                  {decisions.map((decision) => (
                    <li key={decision.key}>
                      <a
                        href={`#${decision.key.startsWith('choice-') ? decision.key : decision.anchor}`}
                        className="underline"
                      >
                        {decision.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            {existing && (
              <Notice variant="info" data-testid="person-existing-notice">
                {name} e deja angajat al clientului, cu{' '}
                {person.existing?.matchedBy === 'cnp'
                  ? 'același CNP'
                  : 'același nume și aceeași dată a nașterii'}
                . Importul îl completează: adaugă ce lipsește și instruirile noi de pe fișă. Ce are
                deja în aplicație rămâne așa, dacă nu alegi altfel.{' '}
                <Link
                  to="/clients/$clientId/employees/$employeeId"
                  params={{ clientId, employeeId: person.existing!.employeeId }}
                  className="underline"
                >
                  Deschide angajatul
                </Link>
              </Notice>
            )}
            {anchors.has('post') && (
              <PostDecision
                context={context}
                person={person}
                positions={positions}
                clientId={clientId}
                onChange={review.update}
              />
            )}
            {anchors.has('cnp') && (
              <CnpDecision context={context} person={person} onChange={review.update} />
            )}
            {anchors.has('workplace') && (
              <WorkplaceDecision
                context={context}
                person={person}
                workplaces={workplaces}
                onChange={review.update}
              />
            )}
            {choiceFields.map((field) => (
              <FieldChoice
                key={field}
                context={context}
                person={person}
                name={field}
                onChange={review.update}
              />
            ))}
            {leftOn !== null && !existing && (
              <DecideCard
                id="leaver"
                tone="warning"
                title={`A plecat din firmă la ${dateLabel(String(leftOn))}`}
              >
                <label className="flex items-start gap-3 text-sm">
                  <Checkbox
                    checked={included}
                    data-testid="person-leaver-include"
                    onCheckedChange={(checked) =>
                      review.update((current) =>
                        withPersonChange(current, person.id, (change) => ({
                          ...change,
                          included: checked === true ? true : undefined,
                        }))
                      )
                    }
                  />
                  <span>
                    Preia-l ca fost angajat, cu instruirile lui.{' '}
                    <span className="text-muted-foreground">
                      Fără bifă nu îl creăm; apare la Foști angajați dacă îl preiei.
                    </span>
                  </span>
                </label>
              </DecideCard>
            )}
            {existing ? (
              <ExistingComparison context={context} person={person} onChange={review.update} />
            ) : (
              <div className="grid gap-4 xl:grid-cols-2">
                <FieldsCard
                  context={context}
                  person={person}
                  group="personal"
                  onChange={review.update}
                />
                <div className="grid content-start gap-4">
                  <FieldsCard
                    context={context}
                    person={person}
                    group="employment"
                    onChange={review.update}
                    notes={{
                      jobTitle: (
                        <span className="text-[13px] text-muted-foreground">
                          {postId && !anchors.has('post')
                            ? `Intră pe postul ${positionName(positions, postId) ?? 'ales'}.`
                            : 'Așa scrie pe fișă. Postul îl alegi mai sus.'}
                        </span>
                      ),
                      employeeNumber: contact ? (
                        <span
                          className="text-[13px] text-muted-foreground"
                          data-testid="person-no-contact"
                        >
                          Fără email sau telefon. Îl adaugi când îl inviți în portal.
                        </span>
                      ) : undefined,
                    }}
                  />
                  <FieldsCard
                    context={context}
                    person={person}
                    group="medical"
                    onChange={review.update}
                  />
                </div>
              </div>
            )}
            <PersonTrainings context={context} person={person} onChange={review.update} />
          </div>
        </div>
        <nav
          aria-label="Persoana anterioară și următoarea"
          className="sticky bottom-0 z-10 -mx-1 grid gap-3 border-t bg-background/95 px-1 py-3 backdrop-blur sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center"
        >
          <Button variant="outline" onClick={() => go(previous)} data-testid="person-previous">
            {previous ? `Anterioara: ${personName(context, previous)}` : 'Lista persoanelor'}
          </Button>
          <p className="text-sm text-muted-foreground" data-testid="person-leaving">
            {statusSentence(context, person, name, decisions.length)}
          </p>
          <Button onClick={() => go(next)} data-testid="person-next">
            {next ? `Următoarea: ${personName(context, next)}` : 'Înapoi la listă'}
          </Button>
        </nav>
        <SourceDialog
          importId={detail.id}
          request={fullScreen}
          onClose={() => setFullScreen(null)}
        />
      </div>
    </ShowPageContext>
  );
}

function statusSentence(context: ReviewContext, person: Person, name: string, open: number) {
  const state = context.states[person.id] ?? 'to_check';
  if (state === 'set_aside') return `${name} e lăsat deoparte. Ce ai schimbat se salvează pe loc.`;
  if (open > 0) {
    return `${name} rămâne de verificat până rezolvi ${open === 1 ? 'ce e semnalat' : `cele ${open} lucruri`}. Ce ai completat se salvează pe loc.`;
  }
  if (state === 'checked') return `${name} e verificat. Ce schimbi se salvează pe loc.`;
  return `Când treci la următoarea, ${name} e marcat verificat, cu alegerile de acum. Ce ai schimbat se salvează pe loc.`;
}
