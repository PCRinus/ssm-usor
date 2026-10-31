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
import { useState } from 'react';

import type { ImportDetail } from '@/api/generated/api';

import { photosLabel } from '../import-format';
import {
  type Changes,
  ownerOf,
  personName,
  type ReviewContext,
  type SheetPage,
  unplacedPages,
} from './employee-review-model';
import { PageThumb } from './page-thumb';
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
      : `${trainingsLabel(page.rows.length)}${dated.length > 1 ? `, din ${dateLabel(dated[0]!)} până la ${dateLabel(dated.at(-1)!)}` : ''}`;
  return { rows, unreadable: page.unreadable };
}

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
  const pages = unplacedPages(context.proposal);
  if (pages.length === 0) return null;
  const waiting = pages.filter((page) => context.changes.pages[page.id] === undefined);
  return (
    <Card className="gap-0 overflow-hidden py-0" data-testid="employee-hub-unplaced">
      <div className="grid gap-1 border-b px-5 py-4">
        <h2 className="text-lg font-semibold">
          {pages.length === 1
            ? 'O fotografie neatribuită'
            : `${photosLabel(pages.length)} neatribuite`}
        </h2>
        <p className="text-sm text-muted-foreground">
          Nu le-am putut lega de nicio persoană. Dacă nu le atribui, le lăsăm deoparte.
          {waiting.length < pages.length &&
            ` Ai hotărât pentru ${pages.length - waiting.length} din ${pages.length}.`}
        </p>
      </div>
      <ul className="divide-y">
        {pages.map((page, index) => {
          const owner = ownerOf(context, page);
          const person = context.proposal.people.find((each) => each.id === owner);
          const decided = context.changes.pages[page.id] !== undefined;
          return (
            <li
              key={page.id}
              className="grid grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-x-3 gap-y-2 px-5 py-3 sm:grid-cols-[2.5rem_minmax(0,1fr)_auto]"
              data-testid="employee-hub-unplaced-page"
            >
              <button
                type="button"
                aria-label={`Mărește ${pageFileName(page)}`}
                onClick={() => setOpen(index)}
              >
                <PageThumb detail={detail} page={page} className="h-12 w-10" />
              </button>
              <span className="grid min-w-0">
                <span className="truncate font-medium">{pageFileName(page)}</span>
                <span className="text-[13px] text-muted-foreground">
                  {pageKindLabel(page)}. {readSummary(page).rows}.
                  {decided &&
                    (person
                      ? ` Atribuită lui ${personName(context, person)}.`
                      : ' Lăsată deoparte.')}
                </span>
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="col-start-2 w-fit sm:col-start-auto"
                onClick={() => setOpen(index)}
              >
                {decided ? 'Schimbă' : 'Atribuie…'}
              </Button>
            </li>
          );
        })}
      </ul>
      <UnplacedDialog
        detail={detail}
        context={context}
        pages={pages}
        index={open}
        onIndex={setOpen}
        onSave={(pageId, personId) => onChange((current) => withPage(current, pageId, personId))}
      />
    </Card>
  );
}

function UnplacedDialog({
  detail,
  context,
  pages,
  index,
  onIndex,
  onSave,
}: {
  detail: ImportDetail;
  context: ReviewContext;
  pages: SheetPage[];
  index: number | null;
  onIndex: (index: number | null) => void;
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
  onSave,
}: {
  detail: ImportDetail;
  context: ReviewContext;
  pages: SheetPage[];
  index: number;
  onIndex: (index: number | null) => void;
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
        <SheetPageView importId={detail.id} page={page} className="h-[min(60svh,36rem)]" />
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
                  <NativeSelectOption key={person.id} value={person.id}>
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
                Nu preluăm nimic de pe ea și nu o păstrăm la niciun angajat.
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
