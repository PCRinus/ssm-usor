import { Button } from '@ssm-usor/ui/components/button';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Link, useNavigate } from '@tanstack/react-router';
import {
  BriefcaseBusiness,
  CalendarCheck,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  FileImage,
  UserRound,
} from 'lucide-react';
import { type ReactNode, useMemo, useRef, useState } from 'react';

import type { ImportDetail } from '@/api/generated/api';
import { BreadcrumbAside } from '@/app/breadcrumb-aside';
import { replayMask } from '@/app/observability/replay-masking';
import { Notice } from '@/components/notice';
import { Masked } from '@/components/replay';
import { roCount } from '@/features/employees/employee-format';

import { ImportActionBar } from '../import-action-bar';
import { ImportIssueBadge } from '../import-review-issues';
import { Includable } from '../include-switch';
import { PhotoPreviewDialog } from '../photo-preview-dialog';
import { PhotoStrip } from '../photo-strip';
import { sectionUnderlines, type StripPhoto } from '../photo-strip-model';
import { Fact, Facts, SectionHeader, StatusTag, Tag } from '../review-parts';
import {
  type Decision,
  decisionsOf,
  type FieldName,
  formerLeftOn,
  isExisting,
  leaving,
  matchedName,
  pagesOf,
  type Person,
  personIncluded,
  personName,
  type PersonState,
  positionOf,
  proposedPersonIncluded,
  resolveField,
  type ReviewContext,
  type SheetPage,
  trainingsByDomain,
  withMatchRestored,
  withPersonIncluded,
} from './employee-review-model';
import { PageThumb } from './page-thumb';
import {
  CnpDecision,
  DecideRow,
  FieldChoice,
  MatchDecision,
  PostDecision,
  WorkplaceDecision,
} from './person-decisions';
import { DataPending, ExistingComparison, PersonData } from './person-fields';
import {
  decisionStops,
  decisionTarget,
  domainPhotos,
  fieldOfDecision,
  groupPhotos,
  nextStop,
  orderedPhotos,
  photoLabel,
  type PhotoSection,
  showChoice,
  trainingSectionId,
  useSectionOnScreen,
  viewerDetail,
} from './person-sections';
import { PersonTrainings } from './person-trainings';
import { dateLabel, pageKindLabel, pagesPhotosLabel, trainingsLabel } from './review-format';
import { SheetPageView } from './sheet-page-view';
import { type ShowPage, ShowPageContext, ViewedPhotoContext } from './show-page';
import { fieldTarget } from './spot-targets';
import { positionName, useReviewContext } from './use-review-context';
import { type Highlight, PhotoCitations, ViewerChoice, WrittenCaption } from './viewer-aside';

const stateLabels: Record<PersonState, { label: string; tone: 'info' | 'success' | 'muted' }> = {
  to_check: { label: 'De verificat', tone: 'info' },
  checked: { label: 'Verificat', tone: 'success' },
  set_aside: { label: 'Lăsat deoparte', tone: 'muted' },
};

type Viewer = {
  photo: string;
  mode: { kind: 'photo' } | { kind: 'choice'; field: FieldName; queue: FieldName[] };
  spot: { pageId: string; target: string } | null;
};

const stripDescription = 'Subliniate: fotografiile secțiunii de pe ecran';

const rowKeys = new Set(['match', 'rehire', 'post', 'cnp', 'workplace']);

function decisionPhotos(context: ReviewContext, person: Person, decisions: Decision[]) {
  const fields: FieldName[] = [];
  for (const decision of decisions) {
    if (decision.key.startsWith('choice-')) {
      fields.push(decision.key.slice('choice-'.length) as FieldName);
    } else if (decision.key === 'post') fields.push('jobTitle');
    else if (decision.key === 'cnp') fields.push('cnp');
    else if (decision.key === 'workplace') fields.push('workplace');
  }
  return fields.flatMap((name) =>
    resolveField(context, person, name).options.flatMap((option) => option.pageIds)
  );
}

function stripPhotos(detail: ImportDetail, pages: SheetPage[]): StripPhoto[] {
  return pages.map((page) => ({
    key: page.id,
    label: photoLabel(pages, page),
    caption: pageKindLabel(page),
    thumb: (className) => <PageThumb detail={detail} page={page} className={className} />,
  }));
}

function decisionElement(decision: Decision) {
  const field = fieldOfDecision(decision.key);
  const ids = [
    decision.key === 'rehire' ? 'match' : decision.key,
    field ? `field-${field}` : null,
    decisionTarget(decision.key),
    field ? 'person-data' : null,
    decision.anchor,
  ];
  for (const id of ids) {
    const element = id ? document.getElementById(id) : null;
    if (element) return element;
  }
  return null;
}

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
  const { proposal } = context;
  const moved = context.changes.pages;
  const pages = useMemo(
    () => pagesOf({ proposal, changes: { pages: moved } }, personId),
    [proposal, moved, personId]
  );
  const photos = useMemo(() => stripPhotos(detail, pages), [detail, pages]);
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [highlight, setHighlight] = useState<Highlight | null>(null);
  const [typing, setTyping] = useState(false);
  const focusAfterViewer = useRef<string | null>(null);
  const lastChoice = useRef<FieldName | null>(null);
  const [opened, setOpened] = useState<{ section: string; photo: string } | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const lastJump = useRef<string | null>(null);
  const decisions = person ? decisionsOf(context, person) : [];
  const openChoiceFields = decisions
    .filter((decision) => decision.key.startsWith('choice-'))
    .map((decision) => decision.key.slice('choice-'.length) as FieldName);
  // A choice answered stays on the page until the member leaves it, so the radio just moved with
  // the arrow keys keeps the focus and can still be changed.
  const [choiceFields, setChoiceFields] = useState(openChoiceFields);
  const newChoices = openChoiceFields.filter((field) => !choiceFields.includes(field));
  if (newChoices.length > 0) setChoiceFields([...choiceFields, ...newChoices]);
  const anchors = new Set(decisions.map((decision) => decision.anchor));
  const leftOn = person ? resolveField(context, person, 'leftOn').value : null;
  const existing = person ? isExisting(context, person) : false;
  const leaver = leftOn !== null && !existing;
  const domains = person ? trainingsByDomain(context, person.id) : [];
  const rowDecisions = decisions.filter(
    (decision) => rowKeys.has(decision.key) || decision.key.startsWith('choice-')
  );
  const decisionsShown =
    rowDecisions.some((decision) => !decision.key.startsWith('choice-')) ||
    choiceFields.length > 0 ||
    leaver;
  const sections: PhotoSection[] = [
    ...(decisionsShown
      ? [
          {
            key: 'decisions',
            photos: orderedPhotos(
              pages,
              person
                ? [
                    ...decisionPhotos(context, person, rowDecisions),
                    ...choiceFields.flatMap((field) =>
                      resolveField(context, person, field).options.flatMap(
                        (option) => option.pageIds
                      )
                    ),
                    ...(leaver
                      ? resolveField(context, person, 'leftOn').options.flatMap(
                          (option) => option.pageIds
                        )
                      : []),
                  ]
                : []
            ),
          },
        ]
      : []),
    { key: 'data', photos: orderedPhotos(pages, person ? groupPhotos(context, person) : []) },
    ...domains.map((domain) => ({
      key: trainingSectionId(domain.domain),
      photos: orderedPhotos(pages, domainPhotos(domain)),
    })),
  ];
  const onScreen = useSectionOnScreen(sections);

  if (!person) {
    return (
      <Notice variant="destructive" data-testid="person-missing">
        Persoana nu mai e în import.{' '}
        <Link
          to="/clienti/$clientId/angajati/import/$importId"
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
  const previous = people[index - 1];
  const next = people[index + 1];
  const declined = person.existing !== null && !existing;
  const former = existing ? formerLeftOn(person) : null;
  const included = personIncluded(context, person);
  const section = onScreen?.key ?? 'data';
  const sectionPhotos = onScreen?.photos ?? [];
  const ringed =
    (opened?.section === section ? opened.photo : null) ?? sectionPhotos[0] ?? pages[0]?.id ?? null;

  const showPhoto = (pageId: string) => {
    if (viewer?.mode.kind === 'photo') setHighlight(null);
    setViewer((current) => (current ? { ...current, photo: pageId } : current));
    setOpened({ section, photo: pageId });
  };

  const chosenHighlight = (field: FieldName): Highlight | null => {
    const option = resolveField(context, person, field).options.find(
      (each) => each.index === context.changes.people[person.id]?.fields?.[field]?.option
    );
    return option
      ? {
          photos: option.pageIds,
          caption: <WrittenCaption field={field} value={showChoice(field, option.value)} />,
        }
      : null;
  };

  const showPage: ShowPage = (pageId, { choice, spot } = {}) => {
    if (viewer === null && document.activeElement instanceof HTMLElement)
      opener.current = document.activeElement;
    setOpened({ section, photo: pageId });
    setHighlight(choice ? chosenHighlight(choice) : null);
    setViewer((current) => {
      if (choice) {
        const queue = current?.mode.kind === 'choice' ? current.mode.queue : openChoiceFields;
        return {
          photo: pageId,
          mode: {
            kind: 'choice',
            field: choice,
            queue: queue.includes(choice) ? queue : [...queue, choice],
          },
          spot: null,
        };
      }
      return {
        photo: pageId,
        mode: current?.mode ?? { kind: 'photo' },
        spot: spot ? { pageId, target: spot } : null,
      };
    });
  };

  const spotOn = (pageId: string) => {
    if (viewer?.mode.kind === 'choice') {
      const { field } = viewer.mode;
      const cited = resolveField(context, person, field).options.some((option) =>
        option.pageIds.includes(pageId)
      );
      return cited ? fieldTarget(field) : null;
    }
    return viewer?.spot?.pageId === pageId ? viewer.spot.target : null;
  };

  const openChoiceInViewer = (field: FieldName) => {
    const options = resolveField(context, person, field).options;
    const change = context.changes.people[person.id]?.fields?.[field];
    const chosen = options.find((option) => option.index === change?.option);
    const cited = options.flatMap((option) => option.pageIds);
    const photo =
      (viewer && cited.includes(viewer.photo) ? viewer.photo : null) ??
      orderedPhotos(pages, chosen?.pageIds ?? cited)[0] ??
      viewer?.photo;
    if (photo) showPage(photo, { choice: field });
  };

  const closeViewer = () => {
    lastChoice.current = viewer?.mode.kind === 'choice' ? viewer.mode.field : null;
    setViewer(null);
    setHighlight(null);
    setTyping(false);
  };

  const giveFocusBack = (event: Event) => {
    const after = focusAfterViewer.current;
    focusAfterViewer.current = null;
    const choice = lastChoice.current;
    lastChoice.current = null;
    const target =
      (after ? document.getElementById(after) : null) ??
      (opener.current?.isConnected ? opener.current : null) ??
      (choice ? document.getElementById(`choice-${choice}`) : null) ??
      document.querySelector<HTMLElement>('[data-testid="person-decisions"] [role="group"]') ??
      document.querySelector<HTMLElement>('[data-testid="person-strip"] [aria-current="true"]');
    opener.current = null;
    if (!target) return;
    event.preventDefault();
    if (after) target.scrollIntoView({ block: 'center' });
    target.focus({ preventScroll: true });
  };

  const go = (to: Person | undefined) => {
    review.update((changes) => leaving({ ...context, changes }, person));
    if (to) {
      void navigate({
        to: '/clienti/$clientId/angajati/import/$importId/$personId',
        params: { clientId, importId: detail.id, personId: to.id },
      });
    } else {
      void navigate({
        to: '/clienti/$clientId/angajati/import/$importId',
        params: { clientId, importId: detail.id },
      });
    }
  };

  const jump = () => {
    const stop = nextStop(decisionStops(decisions, decisionElement), lastJump.current);
    if (!stop) return;
    lastJump.current = stop.key;
    const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? true;
    stop.element.scrollIntoView({ block: 'center', behavior: calm ? 'auto' : 'smooth' });
    stop.element.focus({ preventScroll: true });
  };

  const postId = positionOf(context, person);
  const jobTitle = resolveField(context, person, 'jobTitle').value;
  const hiredAt = resolveField(context, person, 'hiredAt').value;
  const post = (postId && positionName(positions, postId)) || (jobTitle ? String(jobTitle) : null);
  const trainingCount = domains.reduce(
    (sum, domain) => sum + domain.hiring.rows.length + domain.periodic.length,
    0
  );

  const header = (toggle: ReactNode) => (
    <div className="grid gap-2">
      <div className="flex items-start justify-between gap-4">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight wrap-anywhere" {...replayMask}>
            {name}
          </h1>
          {state !== 'set_aside' && (
            <Tag tone={stateLabels[state].tone} testId="person-state">
              {stateLabels[state].label}
            </Tag>
          )}
        </div>
        <span className="flex h-8 shrink-0 items-center">{toggle}</span>
      </div>
      <Facts>
        {post && (
          <Fact icon={BriefcaseBusiness} label={postId ? 'Postul' : 'Funcția pe fișă'}>
            {post}
          </Fact>
        )}
        {typeof hiredAt === 'string' && (
          <Fact icon={CalendarDays} label="Data angajării">
            din {dateLabel(hiredAt)}
          </Fact>
        )}
        <Fact icon={CalendarCheck}>{trainingsLabel(trainingCount)}</Fact>
        <Fact icon={FileImage}>{pagesPhotosLabel(pages)}</Fact>
      </Facts>
    </div>
  );

  return (
    <ShowPageContext value={showPage}>
      <div className="grid gap-5" data-testid="person-page" data-state={state}>
        <BreadcrumbAside>
          <nav aria-label="Persoanele din import" className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              aria-label={
                previous ? `Persoana anterioară: ${personName(context, previous)}` : undefined
              }
              title={previous ? `Persoana anterioară: ${personName(context, previous)}` : undefined}
              disabled={!previous}
              data-testid="person-previous"
              onClick={() => go(previous)}
            >
              <ChevronLeft aria-hidden="true" />
              {!previous && <span className="sr-only">Persoana anterioară</span>}
            </Button>
            <span className="text-sm whitespace-nowrap tabular-nums" data-testid="person-position">
              <span className="max-sm:sr-only">Persoana </span>
              {index + 1} din {people.length}
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label={next ? `Persoana următoare: ${personName(context, next)}` : undefined}
              title={next ? `Persoana următoare: ${personName(context, next)}` : undefined}
              disabled={!next}
              data-testid="person-pager-next"
              onClick={() => go(next)}
            >
              <ChevronRight aria-hidden="true" />
              {!next && <span className="sr-only">Persoana următoare</span>}
            </Button>
          </nav>
        </BreadcrumbAside>
        <Includable
          id={`include-person-${person.id}`}
          name={name}
          personal
          included={included}
          proposed={proposedPersonIncluded(context, person)}
          testId="person-include"
          collapsed={header}
          onChange={(value) =>
            review.update((current) =>
              withPersonIncluded({ ...context, changes: current }, person, value)
            )
          }
        >
          {header}
        </Includable>
        {state === 'set_aside' && !leaver && (
          <Notice variant="info">
            <Masked>{name}</Masked> e lăsat deoparte: nu se creează la confirmare. Pornește
            comutatorul de lângă nume ca să-l iei înapoi la verificat.
          </Notice>
        )}
        {declined && (
          <Notice variant="info" data-testid="person-declined-notice">
            Îl creăm ca lucrător nou, nu îl completăm pe <Masked>{matchedName(person)}</Masked> din
            aplicație.{' '}
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto px-0"
              onClick={() => review.update((current) => withMatchRestored(current, person))}
            >
              E totuși același lucrător
            </Button>
          </Notice>
        )}
        {existing && (
          <Notice variant="info" data-testid="person-existing-notice">
            <Masked>{name}</Masked> {former ? 'a fost' : 'e deja'} lucrător al clientului, cu{' '}
            {person.existing?.matchedBy === 'cnp'
              ? 'același CNP'
              : person.existing?.matchedBy === 'name_only'
                ? 'același nume'
                : 'același nume și aceeași dată a nașterii'}
            {former ? `, și a plecat din firmă la ${dateLabel(former)}` : ''}. Importul îl
            completează: adaugă ce lipsește și instruirile noi de pe fișă. Ce are deja în aplicație
            rămâne așa, dacă nu alegi altfel.{' '}
            <Link
              to="/clienti/$clientId/angajati/$employeeId"
              params={{ clientId, employeeId: person.existing!.employeeId }}
              className="underline"
            >
              Deschide lucrătorul
            </Link>
          </Notice>
        )}
        {decisionsShown && (
          <section
            aria-labelledby="person-decisions-title"
            data-photo-section="decisions"
            className="overflow-hidden rounded-xl border bg-card shadow-xs"
            data-testid="person-decisions"
          >
            <div className="border-b px-5 py-3.5">
              <SectionHeader
                icon={CircleAlert}
                headingId="person-decisions-title"
                title="De hotărât"
                status={
                  rowDecisions.length > 0 ? (
                    <Tag tone="destructive" testId="person-decisions-count">
                      {roCount(rowDecisions.length, 'alegere', 'alegeri')}
                    </Tag>
                  ) : (
                    <StatusTag status={{ kind: 'done' }} />
                  )
                }
              />
            </div>
            {anchors.has('match') && (
              <MatchDecision
                context={context}
                person={person}
                clientId={clientId}
                decisions={decisions}
                onChange={review.update}
              />
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
            {leaver && (
              <DecideRow
                id="leaver"
                tone="warning"
                title="A plecat din firmă"
                subtitle={`la ${dateLabel(String(leftOn))}`}
              >
                <p className="text-sm" data-testid="person-leaver-note">
                  {included
                    ? 'Îl preluăm ca fost lucrător, cu instruirile lui, și apare la Foști lucrători. Oprește comutatorul de lângă nume dacă nu vrei să-l preiei.'
                    : 'Nu îl preluăm decât dacă pornești comutatorul de lângă nume: apare atunci la Foști lucrători, cu instruirile lui.'}
                </p>
              </DecideRow>
            )}
          </section>
        )}
        <section
          id="person-data"
          tabIndex={-1}
          aria-labelledby="person-data-title"
          data-photo-section="data"
          className="scroll-mt-24 overflow-hidden rounded-xl border bg-card shadow-xs outline-none"
        >
          <div className="border-b px-5 py-3.5">
            <SectionHeader
              icon={UserRound}
              headingId="person-data-title"
              title="Datele de pe fișe"
              statusBelowOnPhone
              description={
                existing
                  ? 'Completează lucrătorul din aplicație.'
                  : 'Se preiau la crearea lucrătorului.'
              }
              status={
                state === 'set_aside' ? null : (
                  <DataPending context={context} person={person} decisions={decisions} />
                )
              }
            />
          </div>
          {existing ? (
            <ExistingComparison
              context={context}
              person={person}
              decisions={decisions}
              onChange={review.update}
            />
          ) : (
            <PersonData
              context={context}
              person={person}
              decisions={decisions}
              onChange={review.update}
              notes={{
                jobTitle: (
                  <span className="text-[13px] text-muted-foreground">
                    {postId && !anchors.has('post') ? (
                      <>
                        Intră pe postul{' '}
                        <span className="font-semibold text-foreground">
                          {positionName(positions, postId) ?? 'ales'}
                        </span>
                        .
                      </>
                    ) : (
                      'Așa scrie pe fișă. Postul îl alegi mai sus.'
                    )}
                  </span>
                ),
              }}
            />
          )}
        </section>
        <PersonTrainings
          context={context}
          person={person}
          decisions={decisions}
          clientId={clientId}
          onChange={review.update}
        />
        <ImportActionBar
          label="Verificarea persoanei"
          save={review}
          testId="person-bar"
          leading={
            pages.length > 0 ? (
              <PhotoStrip
                photos={photos}
                ringed={ringed}
                underlined={sectionUnderlines(sectionPhotos, pages.length)}
                onOpen={(pageId) => showPage(pageId)}
                label={`Fotografiile lui ${name}`}
                description={stripDescription}
                testId="person-strip"
              />
            ) : undefined
          }
          summary={
            decisions.length > 0 ? (
              <ImportIssueBadge
                tone="destructive"
                hint="Mergi la următoarea alegere"
                onClick={jump}
              >
                {decisions.length} de hotărât
              </ImportIssueBadge>
            ) : state === 'set_aside' ? (
              <Tag tone="muted">Lăsat deoparte</Tag>
            ) : (
              <StatusTag status={{ kind: 'done' }} />
            )
          }
        >
          <Button
            onClick={() => go(next)}
            data-testid="person-next"
            aria-label={next ? `Persoana următoare: ${personName(context, next)}` : undefined}
            title={next ? `Persoana următoare: ${personName(context, next)}` : undefined}
            className="md:w-48"
          >
            {next ? 'Persoana următoare' : 'Înapoi la listă'}
          </Button>
        </ImportActionBar>
        <ViewedPhotoContext value={viewer?.photo ?? null}>
          <PhotoPreviewDialog
            photos={pages.map((page) => ({
              key: page.id,
              name,
              detail: viewerDetail(pages, page),
              view: (
                <SheetPageView
                  importId={detail.id}
                  page={page}
                  spot={spotOn(page.id)}
                  className="h-full rounded-none"
                />
              ),
            }))}
            current={viewer?.photo ?? null}
            onCurrent={showPhoto}
            onClose={closeViewer}
            onCloseAutoFocus={giveFocusBack}
            strip={(key) => (
              <div
                className={cn(
                  'flex min-w-0 items-center gap-4 max-sm:flex-col max-sm:items-stretch max-sm:gap-1',
                  typing && 'max-sm:hidden'
                )}
              >
                <PhotoStrip
                  photos={photos}
                  ringed={key}
                  underlined={new Set(highlight?.photos ?? [])}
                  onOpen={showPhoto}
                  label={`Fotografiile lui ${name}`}
                  size="viewer"
                  positionClassName="sm:hidden"
                  className="min-w-0 sm:flex-[0_1_auto]"
                  testId="viewer-strip"
                />
                {(highlight || viewer?.mode.kind === 'choice') && (
                  <p
                    className="text-[13px] text-muted-foreground sm:max-w-56"
                    aria-live="polite"
                    data-testid="viewer-underline-caption"
                  >
                    {highlight?.caption ?? 'Alege o variantă ca să vezi pe ce fotografii apare'}
                  </p>
                )}
              </div>
            )}
            aside={(key) => {
              const page = pages.find((each) => each.id === key);
              if (!page || !viewer) return null;
              return viewer.mode.kind === 'choice' ? (
                <ViewerChoice
                  context={context}
                  person={person}
                  field={viewer.mode.field}
                  queue={viewer.mode.queue}
                  decisions={decisions}
                  onHighlight={setHighlight}
                  onTyping={setTyping}
                  onGo={openChoiceInViewer}
                  onClose={closeViewer}
                  save={review}
                  onChange={review.update}
                />
              ) : (
                <PhotoCitations
                  key={key}
                  context={context}
                  person={person}
                  decisions={decisions}
                  page={page}
                  onHighlight={setHighlight}
                  onOpenChoice={openChoiceInViewer}
                  onOpenRow={(target) => {
                    focusAfterViewer.current = target;
                    closeViewer();
                  }}
                />
              );
            }}
          />
        </ViewedPhotoContext>
      </div>
    </ShowPageContext>
  );
}
