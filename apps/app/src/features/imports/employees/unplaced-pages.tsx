import { Button } from '@ssm-usor/ui/components/button';
import { Card } from '@ssm-usor/ui/components/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ssm-usor/ui/components/dialog';
import { NativeSelect, NativeSelectOption } from '@ssm-usor/ui/components/native-select';
import { cn } from '@ssm-usor/ui/lib/utils';
import { CalendarCheck, ChevronRight, FileText, Image as ImageIcon } from 'lucide-react';
import { useState } from 'react';

import type { ImportDetail } from '@/api/generated/api';
import { replayMask } from '@/app/observability/replay-masking';
import { Masked } from '@/components/replay';

import { PhotoPreviewDialog } from '../photo-preview-dialog';
import { Fact, Facts, SectionHeader, StatusTag, Tag } from '../review-parts';
import {
  type Changes,
  ownerOf,
  personName,
  type ReviewContext,
  type SheetPage,
  unplacedPages,
} from './employee-review-model';
import { EnlargeablePageThumb } from './page-thumb';
import { withPage } from './review-changes';
import { dateLabel, pageFileName, pageKindLabel, trainingsLabel } from './review-format';
import { SheetPageView } from './sheet-page-view';

function readSummary(page: SheetPage) {
  const dated = page.rows
    .map((row) => row.heldOn)
    .filter((date): date is string => date !== null)
    .sort();
  const rows =
    page.rows.length === 0
      ? 'Niciun rând de instruire'
      : `${trainingsLabel(page.rows.length)}${dated.length > 1 ? `, ${dateLabel(dated[0]!)} – ${dateLabel(dated.at(-1)!)}` : ''}`;
  return { rows, unreadable: page.unreadable };
}

export const unplacedSectionId = 'employee-hub-unplaced-heading';

export function UnplacedPages({
  detail,
  context,
  onChange,
}: {
  detail: ImportDetail;
  context: ReviewContext;
  onChange: (mutate: (current: Changes) => Changes) => void;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const [enlarged, setEnlarged] = useState<string | null>(null);
  const pages = unplacedPages(context.proposal);
  if (pages.length === 0) return null;
  const toAssign = pages.filter((page) => context.changes.pages[page.id] === undefined).length;
  return (
    <section aria-labelledby={unplacedSectionId} className="scroll-mt-24">
      <Card className="gap-0 overflow-hidden py-0" data-testid="employee-hub-unplaced">
        <div className="border-b px-4 py-4 sm:px-5">
          <SectionHeader
            headingId={unplacedSectionId}
            icon={ImageIcon}
            title="Fotografii neatribuite"
            description="Nu le-am putut lega de nicio persoană. Cele pe care nu le atribui rămân deoparte."
            status={
              toAssign > 0 ? (
                <Tag tone="warning" testId="section-status">
                  {toAssign} de atribuit
                </Tag>
              ) : (
                <StatusTag status={{ kind: 'done' }} />
              )
            }
          />
        </div>
        <ul className="divide-y">
          {pages.map((page, index) => (
            <UnplacedRow
              key={page.id}
              detail={detail}
              context={context}
              page={page}
              onOpen={() => setOpen(index)}
              onEnlarge={() => setEnlarged(page.id)}
            />
          ))}
        </ul>
        <UnplacedDialog
          detail={detail}
          context={context}
          pages={pages}
          index={open}
          onIndex={setOpen}
          onEnlarge={setEnlarged}
          onSave={(pageId, personId) => onChange((current) => withPage(current, pageId, personId))}
        />
        <PhotoPreviewDialog
          photos={pages.map((page, index) => ({
            key: page.id,
            name: pageFileName(page),
            detail: `Fotografia neatribuită ${index + 1} din ${pages.length} · ${pageKindLabel(page)} · ${lowerFirst(readSummary(page).rows)}`,
            view: (
              <SheetPageView importId={detail.id} page={page} className="h-full rounded-none" />
            ),
          }))}
          current={enlarged}
          onCurrent={setEnlarged}
          onClose={() => setEnlarged(null)}
          actions={(pageId) => (
            <Button
              variant="outline"
              data-testid="photo-preview-assign"
              onClick={() => {
                setEnlarged(null);
                setOpen(pages.findIndex((page) => page.id === pageId));
              }}
            >
              Atribuie…
            </Button>
          )}
        />
      </Card>
    </section>
  );
}

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

function UnplacedRow({
  detail,
  context,
  page,
  onOpen,
  onEnlarge,
}: {
  detail: ImportDetail;
  context: ReviewContext;
  page: SheetPage;
  onOpen: () => void;
  onEnlarge: () => void;
}) {
  const owner = ownerOf(context, page);
  const person = context.proposal.people.find((each) => each.id === owner);
  const decided = context.changes.pages[page.id] !== undefined;
  const name = pageFileName(page);
  return (
    <li
      className="group/row relative grid grid-cols-[3.5rem_minmax(0,1fr)_1rem] items-center gap-x-4 gap-y-1 px-4 py-2.5 transition-colors hover:bg-muted/50 sm:grid-cols-[3.5rem_minmax(0,1fr)_auto_1rem] sm:px-5"
      data-testid="employee-hub-unplaced-page"
    >
      <span className="relative z-10 row-span-3 row-start-1 sm:row-span-1">
        <EnlargeablePageThumb
          detail={detail}
          page={page}
          label={`Deschide mare ${name}`}
          testId="employee-hub-unplaced-enlarge"
          onEnlarge={onEnlarge}
        />
      </span>
      <span className="grid min-w-0 gap-0.5 max-sm:contents">
        <button
          type="button"
          aria-label={`Atribuie ${name}`}
          title={name}
          data-testid="employee-hub-unplaced-open"
          onClick={onOpen}
          className="min-w-0 cursor-pointer truncate max-sm:col-start-2 text-left text-[15px] font-semibold underline-offset-[3px] outline-none group-hover/row:underline after:absolute after:inset-0 after:content-[''] focus-visible:underline focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-inset"
        >
          {name}
        </button>
        <span className="min-w-0 max-sm:col-start-2">
          <Facts>
            <Fact icon={FileText}>{pageKindLabel(page)}</Fact>
            <Fact icon={CalendarCheck} wrap>
              {readSummary(page).rows}
            </Fact>
          </Facts>
        </span>
      </span>
      <span className="col-start-2 justify-self-start sm:col-start-3 sm:row-start-1 sm:justify-self-end">
        {!decided ? (
          <Tag tone="warning">De atribuit</Tag>
        ) : person ? (
          <Tag tone="success">
            La <Masked>{personName(context, person)}</Masked>
          </Tag>
        ) : (
          <Tag tone="muted">Lăsată deoparte</Tag>
        )}
      </span>
      <ChevronRight
        className="col-start-3 row-span-3 row-start-1 size-4 text-muted-foreground sm:col-start-4 sm:row-span-1"
        aria-hidden="true"
      />
    </li>
  );
}

function UnplacedDialog({
  detail,
  context,
  pages,
  index,
  onIndex,
  onEnlarge,
  onSave,
}: {
  detail: ImportDetail;
  context: ReviewContext;
  pages: SheetPage[];
  index: number | null;
  onIndex: (index: number | null) => void;
  onEnlarge: (pageId: string) => void;
  onSave: (pageId: string, personId: string | null) => void;
}) {
  return (
    <Dialog open={index !== null} onOpenChange={(open) => !open && onIndex(null)}>
      {index !== null && pages[index] && (
        <UnplacedContent
          key={pages[index].id}
          detail={detail}
          context={context}
          pages={pages}
          index={index}
          onIndex={onIndex}
          onEnlarge={onEnlarge}
          onSave={onSave}
        />
      )}
    </Dialog>
  );
}

function UnplacedContent({
  detail,
  context,
  pages,
  index,
  onIndex,
  onEnlarge,
  onSave,
}: {
  detail: ImportDetail;
  context: ReviewContext;
  pages: SheetPage[];
  index: number;
  onIndex: (index: number | null) => void;
  onEnlarge: (pageId: string) => void;
  onSave: (pageId: string, personId: string | null) => void;
}) {
  const page = pages[index]!;
  const current = ownerOf(context, page);
  const [choice, setChoice] = useState<'person' | 'aside'>(current ? 'person' : 'aside');
  const [personId, setPersonId] = useState(current ?? '');
  const summary = readSummary(page);
  const position = detail.files.findIndex((file) => file.id === page.fileId) + 1;
  const name = pageFileName(page);
  return (
    <DialogContent
      data-testid="employee-unplaced-dialog"
      className="flex max-h-[calc(100svh-2rem)] flex-col sm:max-w-[min(1100px,calc(100vw-4rem))]"
    >
      <DialogHeader>
        <DialogTitle>A cui e fotografia {name}?</DialogTitle>
        <DialogDescription>
          Nu am putut-o lega de nicio persoană.
          {page.unreadable.length > 0 && ` Nu se citește: ${page.unreadable.join(', ')}.`}{' '}
          <span className="tabular-nums">
            Fotografia {position} din {detail.files.length} încărcate · Neatribuită {index + 1} din{' '}
            {pages.length}
          </span>
        </DialogDescription>
      </DialogHeader>
      <div className="grid min-h-0 flex-1 gap-5 overflow-auto md:grid-cols-[minmax(0,1fr)_20rem]">
        <SheetPageView
          importId={detail.id}
          page={page}
          className="h-[min(60svh,36rem)]"
          onEnlarge={() => onEnlarge(page.id)}
        />
        <div className="grid content-start gap-5">
          <section className="grid gap-2">
            <h3 className="font-semibold">Ce am citit pe ea</h3>
            <dl className="grid grid-cols-[6rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-sm">
              <dt className="text-muted-foreground">Pagina</dt>
              <dd>{pageKindLabel(page)}</dd>
              <dt className="text-muted-foreground">Rânduri</dt>
              <dd className="tabular-nums">{summary.rows}</dd>
            </dl>
          </section>
          <fieldset className="grid gap-2">
            <legend className="mb-2 font-semibold">Atribuie fotografia</legend>
            <label
              className={cn(
                'grid gap-2 rounded-lg border p-3 text-sm',
                choice === 'person' && 'border-primary bg-primary/5'
              )}
            >
              <span className="flex items-center gap-2">
                <input
                  type="radio"
                  name="unplaced-choice"
                  checked={choice === 'person'}
                  onChange={() => setChoice('person')}
                />
                <span className="font-medium">O persoană de pe fișe</span>
              </span>
              <NativeSelect
                size="sm"
                aria-label="Alege persoana"
                value={personId}
                onChange={(event) => {
                  setPersonId(event.target.value);
                  setChoice('person');
                }}
              >
                <NativeSelectOption value="">Alege persoana…</NativeSelectOption>
                {context.proposal.people.map((person) => (
                  <NativeSelectOption key={person.id} value={person.id} {...replayMask}>
                    {personName(context, person)}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </label>
            <label
              className={cn(
                'grid gap-1 rounded-lg border p-3 text-sm',
                choice === 'aside' && 'border-primary bg-primary/5'
              )}
            >
              <span className="flex items-center gap-2">
                <input
                  type="radio"
                  name="unplaced-choice"
                  checked={choice === 'aside'}
                  onChange={() => setChoice('aside')}
                />
                <span className="font-medium">Las-o deoparte</span>
              </span>
              <span className="text-muted-foreground">
                Nu preluăm nimic de pe ea și nu o păstrăm la niciun lucrător.
              </span>
            </label>
            <p className="text-[13px] text-muted-foreground">
              Dacă o atribui, rândurile de pe ea apar la persoana aleasă, cu fotografia ca sursă, și
              le verifici acolo.
            </p>
          </fieldset>
        </div>
      </div>
      <DialogFooter className="flex-wrap sm:justify-between">
        <span className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={index === 0}
            onClick={() => onIndex(index - 1)}
          >
            Fotografia anterioară
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={index >= pages.length - 1}
            onClick={() => onIndex(index + 1)}
          >
            {index < pages.length - 1
              ? `Următoarea: ${pageFileName(pages[index + 1]!)}`
              : 'Următoarea'}
          </Button>
        </span>
        <span className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => onIndex(null)}>
            Renunță
          </Button>
          <Button
            type="button"
            data-testid="employee-unplaced-save"
            disabled={choice === 'person' && !personId}
            onClick={() => {
              onSave(page.id, choice === 'person' ? personId : null);
              onIndex(index < pages.length - 1 ? index + 1 : null);
            }}
          >
            Salvează
          </Button>
        </span>
      </DialogFooter>
    </DialogContent>
  );
}
