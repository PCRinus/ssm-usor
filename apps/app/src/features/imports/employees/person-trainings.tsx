import {
  type SupplementaryTrainingReason,
  supplementaryTrainingReasonLabels,
  supplementaryTrainingReasons,
  trainingDomainLabels,
  trainingPhaseLabels,
} from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
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
import { CalendarCheck, FileImage, GraduationCap, Pencil } from 'lucide-react';
import { type FormEvent, type MouseEvent, type ReactNode, useState } from 'react';

import { DatePicker } from '@/components/date-picker';
import { Field } from '@/components/form-field';
import { maskPeople } from '@/components/mask-people';
import { Masked } from '@/components/replay';
import { roCount } from '@/features/employees/employee-format';
import { notOnSheet } from '@/features/trainings/training-format';
import { formatRoDate } from '@/lib/dates';

import { Includable } from '../include-switch';
import { Fact, Facts, SectionHeader, Tag } from '../review-parts';
import {
  type Changes,
  type Decision,
  type DomainTrainings,
  examinerValues,
  handoversOf,
  heldWith,
  isExisting,
  pagesOf,
  type Person,
  personName,
  proposedRowIncluded,
  proposedTestIncluded,
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
import { PhotoNumber, PhotoNumbers } from './person-photos';
import { domainPhotos, trainingSectionId } from './person-sections';
import { dateLabel, durationLabel, trainingsLabel } from './review-format';
import { admissionTarget, rowTarget } from './spot-targets';

type Update = (mutate: (current: Changes) => Changes) => void;

const monthYear = new Intl.DateTimeFormat('ro-RO', {
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

const notWritten = (words: string) => <span className="text-muted-foreground">{words}</span>;

function TrainerText({ values }: { values: RowValues }) {
  const jobTitle = values.trainerJobTitle ? `, ${values.trainerJobTitle}` : '';
  if (!values.trainerName) {
    return (
      <span>
        {notWritten(notOnSheet.name)}
        {jobTitle}
      </span>
    );
  }
  return (
    <span>
      <Masked>{values.trainerName}</Masked>
      {jobTitle}
    </span>
  );
}

function RowTags({ row, included }: { row: SheetRow; included: boolean }) {
  return (
    <>
      {row.flags.includes('month_only') && <Tag tone="muted">Doar luna pe fișă</Tag>}
      {row.flags.includes('unsigned') && !included && <Tag tone="warning">Nesemnat pe fișă</Tag>}
      {row.flags.includes('signature_unclear') && (
        <Tag tone="warning">Semnătura nu se vede clar</Tag>
      )}
    </>
  );
}

function rowNote(row: SheetRow, values: RowValues, included: boolean, who: string) {
  if (row.flags.includes('unsigned') && !included) {
    return maskPeople`Rândul e completat, dar rubrica semnăturii lui ${who} e goală. Nu-l preluăm decât dacă îl incluzi.`;
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

const editTarget = (event: MouseEvent) =>
  !(event.target as HTMLElement).closest('button, a, input, textarea, select, label');

const rowLine =
  'col-span-full grid scroll-mt-24 grid-cols-subgrid items-start gap-y-1 border-t px-5 py-2.5 outline-none focus-visible:bg-secondary/60';

function TrainingRow({
  context,
  person,
  row,
  page,
  pages,
  decision,
  onEdit,
  onChange,
}: {
  context: ReviewContext;
  person: Person;
  row: SheetRow;
  page: SheetPage;
  pages: SheetPage[];
  decision: Decision | undefined;
  onEdit: (row: SheetRow) => void;
  onChange: Update;
}) {
  const matched = isExisting(context, person);
  const values = rowValues(context.changes, row);
  const included = rowIncluded(context.changes, row, matched);
  const date = values.heldOn ? dateLabel(values.heldOn) : null;
  const name = `Instruirea ${trainingPhaseLabels[row.phase].toLowerCase()} din ${date ?? 'data necitită'}`;
  const include = (next: boolean) =>
    onChange((current) => withRow(current, row.id, (change) => ({ ...change, included: next })));
  const note = rowNote(row, values, included, personName(context, person));
  const missing = (label: string) => (
    <Tag tone={included ? 'destructive' : 'muted'} className="whitespace-normal">
      {label}
    </Tag>
  );
  const gap = values.heldOn === null;
  return (
    <li
      id={`row-${row.id}`}
      tabIndex={-1}
      className={cn(
        rowLine,
        included ? 'cursor-pointer hover:bg-secondary/50' : 'text-muted-foreground'
      )}
      data-testid="person-training-row"
      data-included={included}
      onClick={(event) => included && editTarget(event) && onEdit(row)}
    >
      <Includable
        id={`include-row-${row.id}`}
        name={name}
        included={included}
        proposed={proposedRowIncluded(row, matched)}
        agreement="feminine"
        testId="person-row-include"
        onChange={include}
        holdWordSpace
        collapsed={(toggle) => (
          <>
            <span className="col-start-2 col-end-[-2] row-start-1 flex min-h-6 items-center text-sm font-medium">
              {name}
            </span>
            <span className="col-start-[-2] row-start-1 flex h-6 items-center">{toggle}</span>
          </>
        )}
      >
        {(toggle) => (
          <>
            <span className="col-start-1 row-start-1 flex">
              <PhotoNumber
                pages={pages}
                pageId={page.id}
                about={`Instruire ${trainingDomainLabels[row.domain]} din ${date ?? 'data necitită'}`}
                spot={rowTarget(page, row.id)}
              />
            </span>
            <span className="col-start-2 row-start-1 grid min-w-0 gap-0.5 text-sm lg:contents">
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1 lg:contents">
                <span className="flex min-h-6 items-center font-semibold tabular-nums lg:col-start-2 lg:font-normal">
                  {date ?? missing('Data nu se citește')}
                </span>
                <span className="flex min-h-6 items-center tabular-nums lg:col-start-3">
                  {durationLabel(values.durationMinutes) ?? notWritten(notOnSheet.duration)}
                </span>
              </span>
              {row.phase !== 'periodic' && (
                <span className="lg:hidden">{trainingPhaseLabels[row.phase]}</span>
              )}
              <span className="flex min-h-6 items-center lg:col-start-4">
                <TrainerText values={values} />
              </span>
              <span className="grid min-w-0 gap-1 lg:col-start-5">
                <span className="flex min-h-6 flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-muted-foreground lg:text-foreground">
                    {row.phase === 'supplementary' && values.supplementaryReason
                      ? `${supplementaryTrainingReasonLabels[values.supplementaryReason as SupplementaryTrainingReason] ?? ''}. `
                      : ''}
                    {values.material ?? notWritten(notOnSheet.material)}
                  </span>
                  {row.flags.includes('unusual_duration') && included && (
                    <Tag tone="warning">Verifică pe fotografie</Tag>
                  )}
                  <RowTags row={row} included={included} />
                  {decision && !gap && (
                    <Tag tone="destructive" className="whitespace-normal">
                      {decision.label}
                    </Tag>
                  )}
                </span>
                {note && <span className="text-[13px] text-muted-foreground">{note}</span>}
              </span>
            </span>
            <span className="col-start-3 row-start-1 flex lg:col-start-6">
              <EditRowButton
                label={`Modifică instruirea din ${date ?? 'data necitită'}`}
                onClick={() => onEdit(row)}
              />
            </span>
            <span className="col-start-4 row-start-1 flex h-7 items-center lg:col-start-7">
              {toggle}
            </span>
          </>
        )}
      </Includable>
    </li>
  );
}

function EditRowButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      className="-my-0.5 text-muted-foreground"
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      <Pencil aria-hidden="true" />
    </Button>
  );
}

function TestLine({
  context,
  row,
  page,
  pages,
  label,
  matched,
  onChange,
}: {
  context: ReviewContext;
  row: SheetRow;
  page: SheetPage;
  pages: SheetPage[];
  label: string;
  matched: boolean;
  onChange: Update;
}) {
  const test = row.test!;
  const included = testIncluded(context.changes, row, matched);
  const inApp = testInApp(row, matched);
  const heldOn = rowValues(context.changes, row).heldOn;
  const { examinerName, examinerJobTitle: examinerTitle } = examinerValues(context.changes, row);
  const name = `Testul la angajare ${label}`;
  const take = (next: boolean) =>
    onChange((current) => withRow(current, row.id, (change) => ({ ...change, test: next })));
  const setExaminer = (field: 'examinerName' | 'examinerJobTitle', value: string) =>
    onChange((current) =>
      withRow(current, row.id, (change) => ({
        ...change,
        values: { ...change.values, [field]: value.trim() === '' ? null : value },
      }))
    );
  return (
    <div
      id={`test-${row.id}`}
      tabIndex={-1}
      className={cn(rowLine, 'bg-muted/50 text-sm')}
      data-testid="person-test"
      data-included={included}
    >
      <Includable
        id={`include-test-${row.id}`}
        name={name}
        included={included}
        proposed={proposedTestIncluded(row, matched)}
        testId="person-test-include"
        onChange={take}
        holdWordSpace
        collapsed={(toggle) => (
          <>
            <span className="col-start-2 col-end-[-2] row-start-1 flex min-h-6 items-center font-medium text-muted-foreground">
              {name}
            </span>
            <span className="col-start-[-2] row-start-1 flex h-6 items-center">{toggle}</span>
          </>
        )}
      >
        {(toggle) => (
          <>
            <span className="col-start-1 row-start-1 flex">
              <PhotoNumber
                pages={pages}
                pageId={page.id}
                about={name}
                spot={rowTarget(page, row.id)}
              />
            </span>
            <span className="col-start-2 col-end-[-3] row-start-1 grid min-w-0 gap-1">
              <span className="flex min-h-6 items-center font-semibold">
                Testul la angajare: verificat pe fișă
              </span>
              {inApp ? (
                <span className="text-muted-foreground">Testul e deja promovat în aplicație.</span>
              ) : test.verified ? (
                <span className="text-muted-foreground">
                  Examinator: {examinerName ? <Masked>{examinerName}</Masked> : notOnSheet.name}
                  {examinerTitle ? `, ${examinerTitle}` : ''}. Semnătura e în rubrica{' '}
                  <span className="font-semibold">Verificat</span> a instruirii{' '}
                  {trainingPhaseLabels[row.phase].toLowerCase()}
                  {heldOn ? ` din ${dateLabel(heldOn)}` : ''}.
                </span>
              ) : (
                <span className="text-muted-foreground">
                  Pe fișă nu se vede semnătura celui care a verificat cunoștințele. Include-l dacă
                  semnătura e pe originalul pe hârtie.
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
            <span className="col-start-[-2] row-start-1 flex h-7 items-center">{toggle}</span>
          </>
        )}
      </Includable>
    </div>
  );
}

function Admission({ row, page, pages }: { row: SheetRow; page: SheetPage; pages: SheetPage[] }) {
  const admission = row.admission;
  if (!admission?.admittedOn) return null;
  return (
    <div className={cn(rowLine, 'text-sm tabular-nums')}>
      <span className="col-start-1 row-start-1 flex">
        <PhotoNumber
          pages={pages}
          pageId={page.id}
          about={`Admis la lucru la ${dateLabel(admission.admittedOn)}`}
          spot={admissionTarget}
        />
      </span>
      <span className="col-start-2 col-end-[-1] row-start-1 flex min-h-6 items-center">
        <span>
          <span className="font-medium">Admis la lucru</span> la {dateLabel(admission.admittedOn)}
          {admission.admittedByName &&
            `, de ${[admission.admittedByName, admission.admittedByJobTitle].filter(Boolean).join(', ')}`}
        </span>
      </span>
    </div>
  );
}

function AnnualTest({
  context,
  row,
  page,
  pages,
  label,
  matched,
  onEdit,
  onChange,
}: {
  context: ReviewContext;
  row: SheetRow;
  page: SheetPage;
  pages: SheetPage[];
  label: string;
  matched: boolean;
  onEdit: (row: SheetRow) => void;
  onChange: Update;
}) {
  const included = testIncluded(context.changes, row, matched);
  const heldOn = rowValues(context.changes, row).heldOn;
  const name = `Testul anual ${label}, la ${dateLabel(heldOn) ?? 'o dată necitită'}`;
  const take = (next: boolean) =>
    onChange((current) => withRow(current, row.id, (change) => ({ ...change, test: next })));
  return (
    <div
      id={`test-${row.id}`}
      tabIndex={-1}
      className={cn(rowLine, 'bg-muted/50 text-sm', included && 'cursor-pointer')}
      data-testid="person-annual-test"
      data-included={included}
      onClick={(event) => included && editTarget(event) && onEdit(row)}
    >
      <Includable
        id={`include-test-${row.id}`}
        name={name}
        included={included}
        proposed={proposedTestIncluded(row, matched)}
        testId="person-annual-test-include"
        onChange={take}
        holdWordSpace
        collapsed={(toggle) => (
          <>
            <span className="col-start-2 col-end-[-2] row-start-1 flex min-h-6 items-center font-medium text-muted-foreground">
              {name}
            </span>
            <span className="col-start-[-2] row-start-1 flex h-6 items-center">{toggle}</span>
          </>
        )}
      >
        {(toggle) => (
          <>
            <span className="col-start-1 row-start-1 flex">
              <PhotoNumber
                pages={pages}
                pageId={page.id}
                about={name}
                spot={rowTarget(page, row.id)}
              />
            </span>
            <span className="col-start-2 col-end-[-3] row-start-1 grid min-w-0 gap-1">
              <span className="flex min-h-6 items-center">
                <span>
                  <span className="font-semibold">Testul anual {label}</span>, la{' '}
                  {dateLabel(heldOn) ?? 'o dată necitită'}: promovat pe fișă
                </span>
              </span>
              {!row.testOnly && (
                <span
                  className="text-muted-foreground"
                  data-testid="person-annual-test-with-training"
                >
                  Scris pe fișă în rândul instruirii periodice din aceeași zi. Instruirea și testul
                  se preiau fiecare cu comutatorul lor.
                </span>
              )}
            </span>
            <span className="col-start-[-3] row-start-1 flex">
              <EditRowButton
                label={`Modifică testul anual din ${dateLabel(heldOn) ?? 'data necitită'}`}
                onClick={() => onEdit(row)}
              />
            </span>
            <span className="col-start-[-2] row-start-1 flex h-7 items-center">{toggle}</span>
          </>
        )}
      </Includable>
    </div>
  );
}

const rowDecisionKeys = (rowId: string) => [`row-${rowId}`, `test-${rowId}`, `test-date-${rowId}`];

function DomainSection({
  context,
  person,
  domain,
  pages,
  decisions,
  onEdit,
  onEditTest,
  onChange,
}: {
  context: ReviewContext;
  person: Person;
  domain: DomainTrainings;
  pages: SheetPage[];
  decisions: Decision[];
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
  const headingId = `${trainingSectionId(domain.domain)}-title`;
  const own = new Set(
    [...all, ...domain.annualTests, ...(domain.hiring.test ? [domain.hiring.test] : [])].flatMap(
      ({ row }) => rowDecisionKeys(row.id)
    )
  );
  const open = decisions.filter((decision) => own.has(decision.key)).length;
  const rowDecision = (rowId: string) =>
    decisions.find((decision) => decision.key === `row-${rowId}`);
  const shell = (body: ReactNode, description?: ReactNode) => (
    <section
      id={trainingSectionId(domain.domain)}
      aria-labelledby={headingId}
      data-photo-section={trainingSectionId(domain.domain)}
      className="scroll-mt-24 overflow-hidden rounded-xl border bg-card shadow-xs"
      data-testid={`person-trainings-${domain.domain}`}
    >
      <div className="border-b px-5 py-3.5">
        <SectionHeader
          icon={GraduationCap}
          headingId={headingId}
          title={`Instruire ${label}`}
          description={description}
          status={open > 0 ? <Tag tone="destructive">{open} de hotărât</Tag> : null}
        />
      </div>
      {body}
    </section>
  );
  if (domain.pages.length === 0) {
    return shell(
      <p className="px-5 py-4 text-sm text-muted-foreground">
        Printre fotografii nu e nicio fișă {label} a lui{' '}
        <Masked>{personName(context, person)}</Masked>. Dacă are una, o aduci cu un import nou.
      </p>
    );
  }
  return shell(
    <div className="grid grid-cols-[auto_minmax(0,1fr)_auto_auto] gap-x-3 pb-1 lg:grid-cols-[auto_max-content_max-content_fit-content(18rem)_minmax(0,1fr)_auto_auto]">
      {domain.hiring.rows.length > 0 && (
        <>
          <h3 className="col-span-full px-5 pt-3 pb-2 text-sm font-semibold">La angajare</h3>
          <ul className="col-span-full grid grid-cols-subgrid">
            {domain.hiring.rows.map(({ row, page }) => (
              <TrainingRow
                key={row.id}
                context={context}
                person={person}
                row={row}
                page={page}
                pages={pages}
                decision={rowDecision(row.id)}
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
              label={label}
              matched={matched}
              onChange={onChange}
            />
          )}
        </>
      )}
      {domain.periodic.length > 0 && (
        <>
          <h3 className="col-span-full border-t px-5 pt-3 pb-2 text-sm font-semibold first:border-t-0">
            Instruire periodică{' '}
            <span className="font-normal text-muted-foreground tabular-nums">
              {domain.periodic.length === 1
                ? 'un rând'
                : roCount(domain.periodic.length, 'rând', 'rânduri')}
            </span>
          </h3>
          <ul className="col-span-full grid grid-cols-subgrid">
            {domain.periodic.map(({ row, page }) => (
              <TrainingRow
                key={row.id}
                context={context}
                person={person}
                row={row}
                page={page}
                pages={pages}
                decision={rowDecision(row.id)}
                onEdit={onEdit}
                onChange={onChange}
              />
            ))}
          </ul>
        </>
      )}
      {domain.annualTests.map(({ row, page }) => (
        <AnnualTest
          key={row.id}
          context={context}
          row={row}
          page={page}
          pages={pages}
          label={label}
          matched={matched}
          onEdit={onEditTest}
          onChange={onChange}
        />
      ))}
      {domain.inApp.length > 0 && (
        <div
          className="col-span-full grid gap-1 border-t px-5 py-2.5 text-sm"
          data-testid="person-trainings-in-app"
        >
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
      <p className="col-span-full border-t px-5 py-3 text-[13px] text-muted-foreground">
        Rândurile sunt transcrise de pe fișa pe hârtie, iar originalul rămâne la client. Nu cerem
        semnături pentru ele: pe fișa din aplicație apar ca semnate pe hârtie.
      </p>
    </div>,
    <Facts>
      <Fact icon={CalendarCheck}>
        {trainingsLabel(all.length)}
        {taken < all.length ? `, ${taken} se preiau` : ''}
      </Fact>
      <span className="inline-flex items-center gap-1.5">
        <FileImage aria-hidden="true" className="size-3.5 shrink-0 text-muted-foreground" />
        {domain.pages.length === 1 ? 'fotografia' : 'fotografiile'}
        <PhotoNumbers
          pages={pages}
          pageIds={domainPhotos(domain)}
          about={`Instruire ${label}`}
          shown={domain.pages.length}
        />
      </span>
    </Facts>
  );
}

export function PersonTrainings({
  context,
  person,
  decisions,
  onChange,
}: {
  context: ReviewContext;
  person: Person;
  decisions: Decision[];
  onChange: Update;
}) {
  const [editing, setEditing] = useState<SheetRow | null>(null);
  const [editingTest, setEditingTest] = useState<SheetRow | null>(null);
  const pages = pagesOf(context, person.id);
  const domains = trainingsByDomain(context, person.id);
  const handovers = handoversOf(context, person);
  return (
    <div className="grid scroll-mt-24 gap-5" id="trainings">
      {handovers.dates.length + handovers.undated.length > 0 && (
        <div className="grid gap-1 text-sm" data-testid="person-handovers">
          {handovers.dates.map((date) => (
            <p key={date}>
              Pe fișă e consemnată o preluare la {formatRoDate(date)}. Instruirile dinainte au fost
              făcute sub alt serviciu de prevenire.
            </p>
          ))}
          {handovers.undated.map((text) => (
            <p key={text}>Pe fișă e consemnată o preluare: „{text}”.</p>
          ))}
        </div>
      )}
      {domains.map((domain) => (
        <DomainSection
          key={domain.domain}
          context={context}
          person={person}
          domain={domain}
          pages={pages}
          decisions={decisions}
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
  const { examinerName: initialName, examinerJobTitle: initialTitle } = examinerValues(
    context.changes,
    row
  );
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
              {!row.testOnly && ' Data e și a instruirii periodice din același rând.'}
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field id="test-taken-on" label="Data" mark="required" className="sm:col-span-2">
              <DatePicker id="test-taken-on" value={heldOn} onChange={setHeldOn} />
            </Field>
            <Field id="test-examiner" label="Examinator" mark="optional">
              <Input
                id="test-examiner"
                value={examinerName}
                placeholder={notOnSheet.name}
                maxLength={160}
                onChange={(event) => setExaminerName(event.target.value)}
              />
            </Field>
            <Field id="test-examiner-title" label="Funcția examinatorului" mark="optional">
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
    const examiner = test ? examinerValues(context.changes, test.row).examinerName : null;
    const takenOn = test ? rowValues(context.changes, test.row).heldOn : null;
    const testText =
      test && testInApp(test.row, matched) ? (
        'Promovat, deja în aplicație'
      ) : tested ? (
        <>
          {`Promovat, verificat pe fișă${takenOn ? ` la ${dateLabel(takenOn)}` : ''}`}
          {examiner && maskPeople` de ${examiner}`}
        </>
      ) : domain.hiring.rows.length > 0 ? (
        'Neverificat pe fișă'
      ) : (
        'Fără test'
      );
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
              {row.test?.test === 'annual' && ' Data e și a testului anual din același rând.'}
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="mt-4 grid gap-4 sm:grid-cols-2">
            <Field id="row-held-on" label="Data" mark="required">
              <DatePicker id="row-held-on" value={heldOn} onChange={setHeldOn} />
            </Field>
            <Field
              id="row-duration"
              label="Durata, în minute"
              mark="optional"
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
                placeholder={notOnSheet.duration}
                onChange={(event) => setDuration(event.target.value)}
              />
            </Field>
            <Field id="row-trainer" label="Instruit de" mark="optional">
              <Input
                id="row-trainer"
                value={trainerName}
                placeholder={notOnSheet.name}
                maxLength={160}
                onChange={(event) => setTrainerName(event.target.value)}
              />
            </Field>
            <Field id="row-trainer-title" label="Funcția instructorului" mark="optional">
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
            <Field id="row-material" label="Materialul" mark="optional" className="sm:col-span-2">
              <Textarea
                id="row-material"
                value={material}
                placeholder={notOnSheet.material}
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
