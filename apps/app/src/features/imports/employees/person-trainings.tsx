import {
  type SupplementaryTrainingReason,
  supplementaryTrainingReasonLabels,
  supplementaryTrainingReasons,
  trainingDomainLabels,
  trainingPhaseLabels,
} from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { Card } from '@ssm-usor/ui/components/card';
import { Checkbox } from '@ssm-usor/ui/components/checkbox';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ssm-usor/ui/components/dialog';
import { Input } from '@ssm-usor/ui/components/input';
import { NativeSelect, NativeSelectOption } from '@ssm-usor/ui/components/native-select';
import { Textarea } from '@ssm-usor/ui/components/textarea';
import { cn } from '@ssm-usor/ui/lib/utils';
import { type FormEvent, type ReactNode, useState } from 'react';

import { DatePicker } from '@/components/date-picker';
import { Field } from '@/components/form-field';
import { roCount } from '@/features/employees/employee-format';

import { Tag } from '../review-parts';
import {
  type Changes,
  type DomainTrainings,
  heldWith,
  isExisting,
  pagesOf,
  type Person,
  personName,
  type ReviewContext,
  rowIncluded,
  type RowValues,
  rowValues,
  type SheetPage,
  type SheetRow,
  testInApp,
  testIncluded,
  trainingsByDomain,
  withRow,
} from './employee-review-model';
import { PageButton } from './photo-column';
import { dateLabel, durationLabel, trainingsLabel } from './review-format';

type Update = (mutate: (current: Changes) => Changes) => void;

const monthYear = new Intl.DateTimeFormat('ro-RO', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

const trainerText = (values: RowValues) =>
  [values.trainerName, values.trainerJobTitle].filter(Boolean).join(', ');

function RowTags({ row, included }: { row: SheetRow; included: boolean }) {
  return (
    <>
      {row.flags.includes('month_only') && <Tag tone="muted">Doar luna pe fișă</Tag>}
      {row.fromThemes.length > 0 && <Tag tone="muted">Din tematica clientului</Tag>}
      {row.flags.includes('unsigned') && !included && <Tag tone="warning">Nesemnat pe fișă</Tag>}
      {row.flags.includes('signature_unclear') && (
        <Tag tone="warning">Semnătura nu se vede clar</Tag>
      )}
    </>
  );
}

function rowNote(row: SheetRow, values: RowValues, included: boolean, who: string) {
  if (row.flags.includes('unsigned') && !included) {
    return `Rândul e completat, dar rubrica semnăturii lui ${who} e goală. Nu-l preluăm decât dacă îl bifezi.`;
  }
  if (!included) return null;
  const notes: string[] = [];
  if (row.flags.includes('unusual_duration') && values.durationMinutes !== null) {
    notes.push(
      row.phase === 'periodic'
        ? `${values.durationMinutes} min — verifică pe fotografie. O instruire periodică ține de obicei 60, 90 sau 120 de minute. Se preia așa dacă nu o schimbi.`
        : `${values.durationMinutes} min — verifică pe fotografie: pare scurtă pentru o instruire ${trainingPhaseLabels[row.phase].toLowerCase()}. Se preia așa dacă nu o schimbi.`
    );
  }
  if (row.flags.includes('before_hire')) {
    notes.push(
      'Data e dinaintea angajării — verifică pe fotografie. Se preia așa dacă nu o schimbi.'
    );
  }
  return notes.length > 0 ? notes.join(' ') : null;
}

function IncludeBox({
  row,
  included,
  label,
  onChange,
}: {
  row: SheetRow;
  included: boolean;
  label: string;
  onChange: Update;
}) {
  return (
    <Checkbox
      checked={included}
      aria-label={label}
      data-testid="person-row-include"
      onCheckedChange={(checked) =>
        onChange((current) =>
          withRow(current, row.id, (change) => ({ ...change, included: checked === true }))
        )
      }
    />
  );
}

function TrainingRow({
  context,
  person,
  row,
  page,
  pages,
  onEdit,
  onChange,
}: {
  context: ReviewContext;
  person: Person;
  row: SheetRow;
  page: SheetPage;
  pages: SheetPage[];
  onEdit: (row: SheetRow) => void;
  onChange: Update;
}) {
  const values = rowValues(context.changes, row);
  const included = rowIncluded(context.changes, row, isExisting(context, person));
  const date = values.heldOn ? dateLabel(values.heldOn) : null;
  const note = rowNote(row, values, included, personName(context, person));
  const missing = (value: unknown, label: string) =>
    value === null || value === '' ? (
      <Tag tone={included ? 'destructive' : 'muted'}>{label}</Tag>
    ) : null;
  return (
    <li
      className={cn('grid gap-1 py-2.5', !included && 'text-muted-foreground')}
      data-testid="person-training-row"
      data-included={included}
    >
      <div className="grid grid-cols-[1.25rem_minmax(0,1fr)_auto_auto] items-start gap-x-3 gap-y-1 sm:grid-cols-[1.25rem_1.5rem_6.5rem_5rem_minmax(0,1fr)_auto]">
        <IncludeBox
          row={row}
          included={included}
          label={`Preia instruirea ${trainingPhaseLabels[row.phase].toLowerCase()} din ${date ?? 'data necitită'}`}
          onChange={onChange}
        />
        <span className="col-start-3 row-start-1 flex sm:col-start-auto sm:row-start-auto">
          <PageButton pages={pages} pageId={page.id} />
        </span>
        <span className="col-start-2 flex flex-wrap items-center gap-1.5 text-sm tabular-nums sm:col-start-auto">
          {date ?? missing(null, 'Data nu se citește')}
          <span className="sm:hidden">
            {row.phase !== 'periodic' && ` · ${trainingPhaseLabels[row.phase]}`}
          </span>
        </span>
        <span className="col-span-3 col-start-2 flex flex-wrap items-center gap-1.5 text-sm tabular-nums sm:col-span-1 sm:col-start-auto">
          {durationLabel(values.durationMinutes) ?? missing(null, 'Durata nu se citește')}
        </span>
        <span className="col-span-3 col-start-2 text-sm sm:col-span-1 sm:col-start-auto">
          {trainerText(values) || missing(null, 'Instructorul nu se citește')}
        </span>
        <span className="col-start-4 row-start-1 flex sm:col-start-auto sm:row-start-auto">
          <Button
            type="button"
            variant="link"
            size="sm"
            className="h-6 px-1"
            onClick={() => onEdit(row)}
          >
            Schimbă<span className="sr-only"> instruirea din {date ?? 'data necitită'}</span>
          </Button>
        </span>
        <span className="col-span-3 col-start-2 grid gap-1 text-sm sm:col-start-3">
          <span className="line-clamp-2">
            {row.phase === 'supplementary' && values.supplementaryReason
              ? `${supplementaryTrainingReasonLabels[values.supplementaryReason as SupplementaryTrainingReason] ?? ''}. `
              : ''}
            {values.material ?? missing(null, 'Materialul lipsește')}
          </span>
          <span className="flex flex-wrap gap-1 empty:hidden">
            {row.flags.includes('unusual_duration') && included && (
              <Tag tone="warning">Verifică pe fotografie</Tag>
            )}
            <RowTags row={row} included={included} />
          </span>
        </span>
      </div>
      {note && <p className="pl-8 text-[13px] text-muted-foreground sm:pl-17">{note}</p>}
    </li>
  );
}

function TestLine({
  context,
  row,
  page,
  pages,
  matched,
  onChange,
}: {
  context: ReviewContext;
  row: SheetRow;
  page: SheetPage;
  pages: SheetPage[];
  matched: boolean;
  onChange: Update;
}) {
  const test = row.test!;
  const included = testIncluded(context.changes, row, matched);
  const inApp = testInApp(row, matched);
  const heldOn = rowValues(context.changes, row).heldOn;
  const values = context.changes.rows[row.id]?.values ?? {};
  const examinerName = ('examinerName' in values ? values.examinerName : test.examinerName) as
    string | null;
  const examinerTitle = (
    'examinerJobTitle' in values ? values.examinerJobTitle : test.examinerJobTitle
  ) as string | null;
  const id = `test-${row.id}`;
  const setExaminer = (name: 'examinerName' | 'examinerJobTitle', value: string) =>
    onChange((current) =>
      withRow(current, row.id, (change) => ({
        ...change,
        values: { ...change.values, [name]: value.trim() === '' ? null : value },
      }))
    );
  return (
    <div
      className="grid grid-cols-[1.25rem_minmax(0,1fr)_auto] items-start gap-3 rounded-lg bg-muted/50 px-3 py-2.5"
      data-testid="person-test"
      data-included={included}
    >
      <Checkbox
        id={id}
        checked={included}
        onCheckedChange={(checked) =>
          onChange((current) =>
            withRow(current, row.id, (change) => ({ ...change, test: checked === true }))
          )
        }
      />
      <span className="grid gap-1 text-sm">
        <label htmlFor={id} className="font-medium">
          Testul la angajare: verificat pe fișă
        </label>
        {inApp ? (
          <span className="text-muted-foreground">Testul e deja promovat în aplicație.</span>
        ) : test.verified ? (
          <span className="text-muted-foreground">
            Examinator:{' '}
            {[examinerName, examinerTitle].filter(Boolean).join(', ') || 'nu se citește'}. Semnătura
            e în rubrica «Verificat» a instruirii {trainingPhaseLabels[row.phase].toLowerCase()}
            {heldOn ? ` din ${dateLabel(heldOn)}` : ''}.
          </span>
        ) : (
          <span className="text-muted-foreground">
            Pe fișă nu se vede semnătura celui care a verificat cunoștințele. Bifează dacă semnătura
            e pe originalul pe hârtie.
          </span>
        )}
        {!included && !inApp && (
          <span data-testid="person-test-unverified">
            Testul la angajare nu a putut fi verificat pe fișă: semnătura nu se vede clar sau
            lipsește.
          </span>
        )}
        {included && (!examinerName || !examinerTitle) && (
          <span className="grid gap-2 sm:grid-cols-2">
            <Input
              aria-label="Numele examinatorului"
              placeholder="Numele examinatorului"
              defaultValue={examinerName ?? ''}
              onBlur={(event) => setExaminer('examinerName', event.target.value)}
            />
            <Input
              aria-label="Funcția examinatorului"
              placeholder="Funcția examinatorului"
              defaultValue={examinerTitle ?? ''}
              onBlur={(event) => setExaminer('examinerJobTitle', event.target.value)}
            />
          </span>
        )}
      </span>
      <PageButton pages={pages} pageId={page.id} />
    </div>
  );
}

function Admission({ row, page, pages }: { row: SheetRow; page: SheetPage; pages: SheetPage[] }) {
  const admission = row.admission;
  if (!admission?.admittedOn) return null;
  return (
    <div className="flex items-start justify-between gap-3 text-sm tabular-nums">
      <span>
        <span className="font-medium">Admis la lucru</span> la {dateLabel(admission.admittedOn)}
        {admission.admittedByName &&
          `, de ${[admission.admittedByName, admission.admittedByJobTitle].filter(Boolean).join(', ')}`}
      </span>
      <PageButton pages={pages} pageId={page.id} />
    </div>
  );
}

function photoNumbers(pages: SheetPage[], own: SheetPage[]) {
  const numbers = own.map((page) => pages.indexOf(page) + 1).filter((number) => number > 0);
  if (numbers.length === 0) return '';
  if (numbers.length === 1) return `fotografia ${numbers[0]}`;
  return `fotografiile ${numbers.slice(0, -1).join(', ')} și ${numbers.at(-1)}`;
}

function DomainSection({
  context,
  person,
  domain,
  pages,
  onEdit,
  onEditTest,
  onChange,
}: {
  context: ReviewContext;
  person: Person;
  domain: DomainTrainings;
  pages: SheetPage[];
  onEdit: (row: SheetRow) => void;
  onEditTest: (row: SheetRow) => void;
  onChange: Update;
}) {
  const [showInApp, setShowInApp] = useState(false);
  const label = trainingDomainLabels[domain.domain];
  const matched = isExisting(context, person);
  const all = [...domain.hiring.rows, ...domain.periodic];
  const taken = all.filter(({ row }) => rowIncluded(context.changes, row, matched)).length;
  const workplaceRow = domain.hiring.rows.find(({ row }) => row.phase === 'workplace');
  if (domain.pages.length === 0) {
    return (
      <Card className="gap-2 px-5 py-4" data-testid={`person-trainings-${domain.domain}`}>
        <h2 className="text-base font-semibold">Instruire {label}</h2>
        <p className="text-sm text-muted-foreground">
          Printre fotografii nu e nicio fișă {label} a lui {personName(context, person)}. Dacă are
          una, o aduci cu un import nou.
        </p>
      </Card>
    );
  }
  return (
    <Card className="gap-3 px-5 py-4" data-testid={`person-trainings-${domain.domain}`}>
      <div className="grid gap-0.5">
        <h2 className="text-base font-semibold">Instruire {label}</h2>
        <p className="text-sm text-muted-foreground tabular-nums">
          Fișa individuală de instruire {label}, {photoNumbers(pages, domain.pages)}.{' '}
          {trainingsLabel(all.length)}
          {taken < all.length ? `, ${taken} se preiau` : ''}.
        </p>
      </div>
      {domain.hiring.rows.length > 0 && (
        <div className="grid gap-2">
          <h3 className="text-sm font-semibold">La angajare</h3>
          <ul className="divide-y">
            {domain.hiring.rows.map(({ row, page }) => (
              <TrainingRow
                key={row.id}
                context={context}
                person={person}
                row={row}
                page={page}
                pages={pages}
                onEdit={onEdit}
                onChange={onChange}
              />
            ))}
          </ul>
          {workplaceRow && (
            <Admission row={workplaceRow.row} page={workplaceRow.page} pages={pages} />
          )}
          {domain.hiring.test && (
            <TestLine
              context={context}
              row={domain.hiring.test.row}
              page={domain.hiring.test.page}
              pages={pages}
              matched={matched}
              onChange={onChange}
            />
          )}
        </div>
      )}
      {domain.periodic.length > 0 && (
        <div className="grid gap-1">
          <h3 className="text-sm font-semibold">
            Instruire periodică{' '}
            <span className="font-normal text-muted-foreground tabular-nums">
              {domain.periodic.length === 1
                ? 'un rând'
                : roCount(domain.periodic.length, 'rând', 'rânduri')}
            </span>
          </h3>
          <ul className="divide-y">
            {domain.periodic.map(({ row, page }) => (
              <TrainingRow
                key={row.id}
                context={context}
                person={person}
                row={row}
                page={page}
                pages={pages}
                onEdit={onEdit}
                onChange={onChange}
              />
            ))}
          </ul>
        </div>
      )}
      {domain.annualTests.map(({ row, page }) => {
        const included = testIncluded(context.changes, row, matched);
        const heldOn = rowValues(context.changes, row).heldOn;
        return (
          <div
            key={row.id}
            className="grid grid-cols-[1.25rem_minmax(0,1fr)_auto_auto] items-start gap-3 rounded-lg bg-muted/50 px-3 py-2.5 text-sm"
            data-testid="person-annual-test"
          >
            <Checkbox
              checked={included}
              aria-label={`Preia testul anual din ${dateLabel(heldOn) ?? 'data necitită'}`}
              onCheckedChange={(checked) =>
                onChange((current) =>
                  withRow(current, row.id, (change) => ({ ...change, test: checked === true }))
                )
              }
            />
            <span>
              <span className="font-medium">Testul anual {label}</span>, la{' '}
              {dateLabel(heldOn) ?? 'o dată necitită'}: promovat pe fișă
            </span>
            <PageButton pages={pages} pageId={page.id} />
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-6 px-1"
              onClick={() => onEditTest(row)}
            >
              Schimbă
              <span className="sr-only">
                {' '}
                testul anual din {dateLabel(heldOn) ?? 'data necitită'}
              </span>
            </Button>
          </div>
        );
      })}
      {domain.inApp.length > 0 && (
        <div className="grid gap-1 text-sm" data-testid="person-trainings-in-app">
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span>
              {domain.inApp.length === 1
                ? 'O instruire de pe fișă e deja în aplicație'
                : `${roCount(domain.inApp.length, 'instruire', 'instruiri')} de pe fișă sunt deja în aplicație`}
            </span>
            <span className="text-muted-foreground">
              cu aceeași dată și același fel. Nu le adăugăm a doua oară.
            </span>
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto px-0"
              aria-expanded={showInApp}
              onClick={() => setShowInApp(!showInApp)}
            >
              {showInApp ? 'Ascunde-le' : 'Arată-le'}
            </Button>
          </p>
          {showInApp && (
            <ul className="grid gap-0.5 text-muted-foreground tabular-nums">
              {domain.inApp.map(({ row }) => (
                <li key={row.id}>
                  {trainingPhaseLabels[row.phase]}, {dateLabel(row.heldOn) ?? 'fără dată'}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      <p className="text-[13px] text-muted-foreground">
        Rândurile sunt transcrise de pe fișa pe hârtie, iar originalul rămâne la client. Nu cerem
        semnături pentru ele: pe fișa din aplicație apar ca semnate pe hârtie.
      </p>
    </Card>
  );
}

export function PersonTrainings({
  context,
  person,
  onChange,
}: {
  context: ReviewContext;
  person: Person;
  onChange: Update;
}) {
  const [editing, setEditing] = useState<SheetRow | null>(null);
  const [editingTest, setEditingTest] = useState<SheetRow | null>(null);
  const pages = pagesOf(context, person.id);
  const domains = trainingsByDomain(context, person.id);
  return (
    <div className="grid gap-4" id="trainings">
      {domains.map((domain) => (
        <DomainSection
          key={domain.domain}
          context={context}
          person={person}
          domain={domain}
          pages={pages}
          onEdit={setEditing}
          onEditTest={setEditingTest}
          onChange={onChange}
        />
      ))}
      <AfterImport context={context} person={person} domains={domains} />
      {editing && (
        <RowDialog
          row={editing}
          values={rowValues(context.changes, editing)}
          onClose={() => setEditing(null)}
          onSave={(values) =>
            onChange((current) =>
              withRow(current, editing.id, (change) => ({
                ...change,
                values: { ...change.values, ...values },
              }))
            )
          }
        />
      )}
      {editingTest && (
        <TestDialog
          context={context}
          row={editingTest}
          onClose={() => setEditingTest(null)}
          onSave={(values) =>
            onChange((current) =>
              withRow(current, editingTest.id, (change) => ({
                ...change,
                values: { ...change.values, ...values },
              }))
            )
          }
        />
      )}
    </div>
  );
}

function TestDialog({
  context,
  row,
  onClose,
  onSave,
}: {
  context: ReviewContext;
  row: SheetRow;
  onClose: () => void;
  onSave: (values: Record<'heldOn' | 'examinerName' | 'examinerJobTitle', string | null>) => void;
}) {
  const own = context.changes.rows[row.id]?.values ?? {};
  const initialName = 'examinerName' in own ? own.examinerName : (row.test?.examinerName ?? null);
  const initialTitle =
    'examinerJobTitle' in own ? own.examinerJobTitle : (row.test?.examinerJobTitle ?? null);
  const [heldOn, setHeldOn] = useState(rowValues(context.changes, row).heldOn ?? '');
  const [examinerName, setExaminerName] = useState(String(initialName ?? ''));
  const [examinerTitle, setExaminerTitle] = useState(String(initialTitle ?? ''));
  const text = (value: string) => (value.trim() === '' ? null : value.trim());

  function submit(event: FormEvent) {
    event.preventDefault();
    onSave({
      heldOn: heldOn || null,
      examinerName: text(examinerName),
      examinerJobTitle: text(examinerTitle),
    });
    onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg" data-testid="person-test-dialog">
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>Testul anual {trainingDomainLabels[row.domain]}</DialogTitle>
            <DialogDescription>
              Corectează ce s-a citit greșit. Se preia așa cum lași aici.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field id="test-taken-on" label="Data" mark="required" className="sm:col-span-2">
              <DatePicker id="test-taken-on" value={heldOn} onChange={setHeldOn} />
            </Field>
            <Field id="test-examiner" label="Examinator" mark="required">
              <Input
                id="test-examiner"
                value={examinerName}
                maxLength={160}
                onChange={(event) => setExaminerName(event.target.value)}
              />
            </Field>
            <Field id="test-examiner-title" label="Funcția examinatorului" mark="required">
              <Input
                id="test-examiner-title"
                value={examinerTitle}
                maxLength={160}
                onChange={(event) => setExaminerTitle(event.target.value)}
              />
            </Field>
          </DialogBody>
          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={onClose}>
              Renunță
            </Button>
            <Button type="submit" data-testid="person-test-save">
              Salvează
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AfterImport({
  context,
  person,
  domains,
}: {
  context: ReviewContext;
  person: Person;
  domains: DomainTrainings[];
}) {
  const matched = isExisting(context, person);
  const columns = domains.map((domain) => {
    const included = [...domain.hiring.rows, ...domain.periodic].filter(({ row }) =>
      rowIncluded(context.changes, row, matched)
    );
    const periodic = domain.periodic
      .filter(({ row }) => rowIncluded(context.changes, row, matched))
      .map(({ row }) => ({ row, heldOn: rowValues(context.changes, row).heldOn }))
      .filter((each): each is { row: SheetRow; heldOn: string } => each.heldOn !== null)
      .sort((a, b) => a.heldOn.localeCompare(b.heldOn));
    const last = periodic.at(-1) ?? null;
    const test = domain.hiring.test;
    const tested = test && testIncluded(context.changes, test.row, matched);
    const own = test ? (context.changes.rows[test.row.id]?.values ?? {}) : {};
    const examiner = 'examinerName' in own ? own.examinerName : test?.row.test?.examinerName;
    const takenOn = test ? rowValues(context.changes, test.row).heldOn : null;
    const testText =
      test && testInApp(test.row, matched)
        ? 'Promovat, deja în aplicație'
        : tested
          ? `Promovat, verificat pe fișă${takenOn ? ` la ${dateLabel(takenOn)}` : ''}${examiner ? ` de ${examiner}` : ''}`
          : domain.hiring.rows.length > 0
            ? 'Neverificat pe fișă'
            : 'Fără test';
    return { domain, included, last, testText };
  });
  const latest = columns
    .flatMap((column) => (column.last ? [column.last] : []))
    .sort((a, b) => b.heldOn.localeCompare(a.heldOn))[0];
  const together = latest ? heldWith(context, person.id, latest.row) : 0;
  return (
    <section
      aria-labelledby="person-after"
      className="grid gap-3 rounded-xl border border-dashed px-5 py-4"
      data-testid="person-after-import"
    >
      <div className="grid gap-0.5">
        <h2 id="person-after" className="text-base font-semibold">
          După import
        </h2>
        <p className="text-sm text-muted-foreground">
          Cum va arăta instruirea în aplicație, cu alegerile de acum.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        {columns.map(({ domain, included, last, testText }) => (
          <div key={domain.domain} className="grid content-start gap-2 text-sm">
            <span className="flex items-center gap-2 font-semibold">
              {trainingDomainLabels[domain.domain]}
              {included.length === 0 && <Tag tone="warning">Neinstruit</Tag>}
            </span>
            <dl className="grid gap-1.5">
              <AfterFact label="Ultima instruire periodică">
                {last
                  ? last.row.flags.includes('month_only')
                    ? monthYear.format(new Date(`${last.heldOn}T00:00:00Z`))
                    : dateLabel(last.heldOn)
                  : included.length > 0
                    ? 'Doar instruirea la angajare'
                    : `Fără nicio instruire ${trainingDomainLabels[domain.domain]} până nu o înregistrezi`}
              </AfterFact>
              <AfterFact label="Testul la angajare">{testText}</AfterFact>
            </dl>
          </div>
        ))}
      </div>
      {latest && together > 0 && (
        <p className="text-sm text-muted-foreground" data-testid="person-after-held">
          Instruirea {trainingPhaseLabels[latest.row.phase].toLowerCase()}{' '}
          {trainingDomainLabels[latest.row.domain]} din {dateLabel(latest.heldOn)} o{' '}
          {together === 1
            ? 'mai are pe fișă un coleg'
            : `au pe fișe încă ${roCount(together, 'coleg', 'colegi')}`}
          , cu același instructor. În Instruiri ținute devine o singură instruire, cu{' '}
          {roCount(together + 1, 'participant', 'participanți')}.
        </p>
      )}
    </section>
  );
}

function AfterFact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular-nums">{children}</dd>
    </div>
  );
}

function RowDialog({
  row,
  values,
  onClose,
  onSave,
}: {
  row: SheetRow;
  values: RowValues;
  onClose: () => void;
  onSave: (values: Partial<Record<keyof RowValues, string | number | null>>) => void;
}) {
  const [heldOn, setHeldOn] = useState(values.heldOn ?? '');
  const [duration, setDuration] = useState(
    values.durationMinutes === null ? '' : String(values.durationMinutes)
  );
  const [trainerName, setTrainerName] = useState(values.trainerName ?? '');
  const [trainerJobTitle, setTrainerJobTitle] = useState(values.trainerJobTitle ?? '');
  const [material, setMaterial] = useState(values.material ?? '');
  const [reason, setReason] = useState(values.supplementaryReason ?? '');
  const durationInvalid =
    duration !== '' &&
    !(/^\d+$/.test(duration) && Number(duration) >= 1 && Number(duration) <= 600);
  const text = (value: string) => (value.trim() === '' ? null : value.trim());

  function submit(event: FormEvent) {
    event.preventDefault();
    if (durationInvalid) return;
    onSave({
      heldOn: heldOn || null,
      durationMinutes: duration === '' ? null : Number(duration),
      trainerName: text(trainerName),
      trainerJobTitle: text(trainerJobTitle),
      material: text(material),
      ...(row.phase === 'supplementary' ? { supplementaryReason: reason || null } : {}),
    });
    onClose();
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg" data-testid="person-row-dialog">
        <form onSubmit={submit} noValidate>
          <DialogHeader>
            <DialogTitle>
              {trainingPhaseLabels[row.phase]} {trainingDomainLabels[row.domain]}
              {values.heldOn ? `, ${dateLabel(values.heldOn)}` : ''}
            </DialogTitle>
            <DialogDescription>
              Corectează ce s-a citit greșit. Se preia așa cum lași aici.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field id="row-held-on" label="Data" mark="required">
              <DatePicker id="row-held-on" value={heldOn} onChange={setHeldOn} />
            </Field>
            <Field
              id="row-duration"
              label="Durata, în minute"
              mark="required"
              error={
                durationInvalid
                  ? { type: 'range', message: 'Scrie un număr de minute între 1 și 600.' }
                  : undefined
              }
            >
              <Input
                id="row-duration"
                inputMode="numeric"
                value={duration}
                onChange={(event) => setDuration(event.target.value)}
              />
            </Field>
            <Field id="row-trainer" label="Instruit de" mark="required">
              <Input
                id="row-trainer"
                value={trainerName}
                maxLength={160}
                onChange={(event) => setTrainerName(event.target.value)}
              />
            </Field>
            <Field id="row-trainer-title" label="Funcția instructorului" mark="required">
              <Input
                id="row-trainer-title"
                value={trainerJobTitle}
                maxLength={160}
                onChange={(event) => setTrainerJobTitle(event.target.value)}
              />
            </Field>
            {row.phase === 'supplementary' && (
              <Field id="row-reason" label="Motivul" mark="required" className="sm:col-span-2">
                <NativeSelect
                  id="row-reason"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                >
                  <NativeSelectOption value="">Alege motivul…</NativeSelectOption>
                  {supplementaryTrainingReasons.map((each) => (
                    <NativeSelectOption key={each} value={each}>
                      {supplementaryTrainingReasonLabels[each]}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </Field>
            )}
            <Field id="row-material" label="Materialul" mark="required" className="sm:col-span-2">
              <Textarea
                id="row-material"
                value={material}
                rows={3}
                onChange={(event) => setMaterial(event.target.value)}
              />
            </Field>
          </DialogBody>
          <DialogFooter className="mt-6">
            <Button type="button" variant="outline" onClick={onClose}>
              Renunță
            </Button>
            <Button type="submit" data-testid="person-row-save">
              Salvează
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
