import {
  dutiesAcknowledgementErrorReasons,
  type DutiesAcknowledgementStatus,
  formatEmployeeName,
} from '@ssm-usor/contracts';
import { Badge } from '@ssm-usor/ui/components/badge';
import { Button } from '@ssm-usor/ui/components/button';
import {
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ssm-usor/ui/components/dialog';
import { Notice } from '@ssm-usor/ui/components/notice';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import { useIsPhone } from '@ssm-usor/ui/hooks/use-mobile';
import { saveFile } from '@ssm-usor/ui/lib/save-file';
import { toast } from '@ssm-usor/ui/lib/toast';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Link } from '@tanstack/react-router';
import { Check, FileDown, LoaderCircle, Pencil, PenLine, Trash2 } from 'lucide-react';
import { type FormEvent, type ReactNode, useState } from 'react';

import {
  deleteDutiesAcknowledgementRecord,
  type DutiesAcknowledgementResponse,
  type DutiesAcknowledgementResponseAnnex,
  type EmployeeResponse,
  getDutiesAcknowledgementSheet,
  recordDutiesAcknowledgement,
} from '@/api/generated/api';
import { apiErrorBody, apiErrorReason, ApiHttpError } from '@/api/http';
import { useApi } from '@/api/use-api';
import { openedHere } from '@/app/opener';
import { useHoldOpen } from '@/components/close-guard';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { DatePicker } from '@/components/date-picker';
import { FormDialog } from '@/components/form-dialog';
import { Field } from '@/components/form-field';
import { LoadFailed } from '@/components/load-failed';
import { Masked } from '@/components/replay';
import { SectionCard } from '@/components/section-card';
import { TodoLine } from '@/components/todo-line';
import { uploadFailureMessage } from '@/features/client-files/client-file-format';
import {
  SummaryList,
  SummaryNote,
  summaryQuiet,
  SummaryRow,
} from '@/features/clients/details/summary-list';
import { documentLink } from '@/features/documents/document-sets';
import { EmployeeJobPositionDialog } from '@/features/employees/employee-job-position-dialog';
import { noScan, type ScanChoice, useScanUpload } from '@/features/signatures/agreement-scan';
import { AgreementScanField } from '@/features/signatures/agreement-scan-field';
import { ScanLink } from '@/features/signatures/scan-link';
import { commonFailure } from '@/lib/api-errors';
import { formatRoDate, todayIso } from '@/lib/dates';

import { dutiesCardTitle, sheetHolder, signAgainReason } from './duties-format';
import {
  invalidateDutiesAcknowledgement,
  useDutiesAcknowledgement,
} from './use-duties-acknowledgement';

type Employee = EmployeeResponse['employee'];
type Annex = NonNullable<DutiesAcknowledgementResponseAnnex>;
type DutiesRecord = NonNullable<DutiesAcknowledgementResponse['current']>;

const warning = 'border-warning-border bg-warning text-warning-foreground';
const success = 'border-success-border bg-success text-success-foreground';
const values = '[&_dd>div:first-child]:font-medium';
const actionsClass = 'flex flex-wrap gap-2 max-sm:grid max-sm:[&>*]:w-full';
const linkClass = 'underline decoration-border underline-offset-4 hover:decoration-current';

const stateLabels: Partial<Record<DutiesAcknowledgementStatus, string>> = {
  to_sign: 'De semnat',
  signed: 'Semnată pe hârtie',
  sign_again: 'De semnat din nou',
};

function StateBadge({ status }: { status: DutiesAcknowledgementStatus }) {
  const signed = status === 'signed';
  return (
    <Badge
      variant="outline"
      data-testid="duties-acknowledgement-state"
      data-state={status}
      className={signed ? success : warning}
    >
      {signed && <Check aria-hidden="true" />}
      {stateLabels[status]}
    </Badge>
  );
}

function Note({ testId, children }: { testId?: string; children: ReactNode }) {
  return (
    <SummaryNote data-testid={testId} className="font-normal">
      {children}
    </SummaryNote>
  );
}

function AnnexLine({ annex, clientId }: { annex: Annex; clientId?: string }) {
  return (
    <>
      Anexa {annex.number} din{' '}
      {clientId ? (
        <Link
          {...documentLink('occupational_safety', clientId, annex.documentId)}
          state={openedHere}
          data-testid="duties-acknowledgement-document"
          className={linkClass}
        >
          documentul 13
        </Link>
      ) : (
        'documentul 13'
      )}
      , emis la <span className="tabular-nums">{formatRoDate(annex.issueDate)}</span>
    </>
  );
}

function TodoAction({ phone, children }: { phone: boolean; children: ReactNode }) {
  return (
    <Button asChild variant="secondary" size="sm" className={cn(phone && 'w-full')}>
      {children}
    </Button>
  );
}

function downloadFailure(cause: unknown) {
  if (apiErrorReason(cause) === 'pdf_unavailable') {
    return 'Convertorul PDF nu este disponibil. Încearcă din nou peste câteva minute.';
  }
  return (
    commonFailure(cause) ?? 'Nu am putut descărca fișa. Verifică conexiunea și încearcă din nou.'
  );
}

// `readOnly` is an archived client, whose records no longer change; a former worker's sheet is
// read the same way and no longer signed.
export function DutiesAcknowledgementCard({
  employee,
  readOnly,
}: {
  employee: Employee;
  readOnly: boolean;
}) {
  const { request, queryClient } = useApi();
  const phone = useIsPhone();
  const query = useDutiesAcknowledgement(employee.clientId, employee.id);
  const [downloading, setDownloading] = useState(false);
  const [recording, setRecording] = useState<Annex | null>(null);
  const [removing, setRemoving] = useState<DutiesRecord | null>(null);
  const [movingPost, setMovingPost] = useState(false);
  const former = employee.status === 'terminated';
  const locked = readOnly || former;
  const data = query.data;
  const status = data?.status;
  // Signed is judged on the annex's text, so the latest revision may not be the one signed.
  const sheet = status === 'signed' && data?.current ? data.current.annex : data?.annex;

  async function download() {
    setDownloading(true);
    try {
      const file = await getDutiesAcknowledgementSheet(employee.clientId, employee.id, request);
      saveFile(
        file,
        file instanceof File
          ? file.name
          : `Fisa-atributii-SSM-${formatEmployeeName(employee).replace(/\s+/g, '-')}.pdf`
      );
    } catch (cause) {
      toast.error(downloadFailure(cause));
      if (cause instanceof ApiHttpError && cause.status === 409) {
        void invalidateDutiesAcknowledgement(queryClient, employee.clientId, employee.id);
      }
    } finally {
      setDownloading(false);
    }
  }

  const downloadButton = (label: string) => (
    <Button
      key="download"
      variant="secondary"
      size="sm"
      data-testid="duties-acknowledgement-download"
      disabled={downloading}
      onClick={() => void download()}
    >
      {downloading ? (
        <LoaderCircle aria-hidden="true" className="animate-spin" />
      ) : (
        <FileDown aria-hidden="true" />
      )}
      {label}
    </Button>
  );
  const recordButton = (
    <Button
      key="record"
      variant="secondary"
      size="sm"
      data-testid="duties-acknowledgement-paper"
      onClick={() => setRecording(data?.annex ?? null)}
    >
      <PenLine aria-hidden="true" />
      Înregistrează fișa semnată pe hârtie…
    </Button>
  );

  const buttons: ReactNode[] = [];
  if (status === 'to_sign' || status === 'sign_again') {
    if (!locked) {
      buttons.push(downloadButton('Descarcă fișa pentru semnare pe hârtie'), recordButton);
    }
  } else if (status === 'signed' && data?.current) {
    buttons.push(downloadButton('Descarcă fișa'));
    if (!locked) {
      const current = data.current;
      buttons.push(
        <Button
          key="remove"
          variant="secondary"
          size="sm"
          data-testid="duties-acknowledgement-remove"
          onClick={() => setRemoving(current)}
        >
          <Trash2 aria-hidden="true" />
          Șterge înregistrarea…
        </Button>
      );
    }
  }

  return (
    <SectionCard
      data-testid="duties-acknowledgement-card"
      data-status={status}
      className="gap-4"
      title={dutiesCardTitle}
      help="angajati.atributii-ssm"
      longTitle
    >
      {!data ? (
        query.isError ? (
          <LoadFailed
            error={query.error}
            busy={query.isFetching}
            onRetry={() => void query.refetch()}
          >
            Nu am putut încărca fișa atribuțiilor SSM.
          </LoadFailed>
        ) : (
          <Skeleton className="h-16 w-full" />
        )
      ) : (
        <>
          {data.status === 'not_issued' || data.status === 'no_annex' ? (
            <MissingAnnex
              employee={employee}
              data={data}
              locked={locked}
              phone={phone}
              onMovePost={() => setMovingPost(true)}
            />
          ) : (
            <SummaryList className={values}>
              <SummaryRow label="Stare">
                <StateBadge status={data.status} />
                <StateNote data={data} locked={locked} readOnly={readOnly} />
              </SummaryRow>
              {sheet && (
                <SummaryRow
                  label={data.status === 'sign_again' ? 'Fișa nouă' : 'Fișa'}
                  testId="duties-acknowledgement-sheet"
                >
                  <AnnexLine annex={sheet} clientId={employee.clientId} />
                  <Note>{sheetHolder(sheet.position.name, sheet.roles)}</Note>
                </SummaryRow>
              )}
              {data.status === 'signed' && data.current && (
                <SummaryRow label="Scan" testId="duties-acknowledgement-scan">
                  {data.current.clientFileId ? (
                    <ScanLink
                      clientId={employee.clientId}
                      employeeId={employee.id}
                      fileId={data.current.clientFileId}
                      testId="duties-acknowledgement-scan-link"
                    />
                  ) : (
                    <span className={cn('font-normal', summaryQuiet)}>Fără scan atașat</span>
                  )}
                </SummaryRow>
              )}
              {data.status === 'sign_again' && data.current && (
                <EarlierRow employee={employee} record={data.current} />
              )}
              {!locked && data.status !== 'signed' && (
                <SummaryRow label="Ce urmează">
                  <span data-testid="duties-acknowledgement-next">
                    {data.status === 'sign_again'
                      ? 'Descarcă fișa nouă și dă-o lucrătorului s-o semneze. Cea veche rămâne la dosar.'
                      : 'Descarc-o și dă-o lucrătorului s-o semneze de mână. Apoi înregistreaz-o aici, cu ziua semnării.'}
                  </span>
                </SummaryRow>
              )}
            </SummaryList>
          )}
          {buttons.length > 0 && (
            <div data-testid="duties-acknowledgement-actions" className={actionsClass}>
              {buttons}
            </div>
          )}
        </>
      )}
      <PaperSheetDialog employee={employee} annex={recording} onClose={() => setRecording(null)} />
      <RemoveRecordDialog employee={employee} record={removing} onClose={() => setRemoving(null)} />
      <EmployeeJobPositionDialog
        clientId={employee.clientId}
        employee={movingPost ? employee : null}
        onClose={() => setMovingPost(false)}
      />
    </SectionCard>
  );
}

function StateNote({
  data,
  locked,
  readOnly,
}: {
  data: DutiesAcknowledgementResponse;
  locked: boolean;
  readOnly: boolean;
}) {
  if (data.status === 'signed' && data.current) {
    return (
      <Note testId="duties-acknowledgement-detail">
        pe <span className="tabular-nums">{formatRoDate(data.current.signedOn)}</span>
      </Note>
    );
  }
  if (locked) {
    return (
      <Note testId="duties-acknowledgement-detail">
        {readOnly
          ? 'Clientul e arhivat: fișa nu se mai semnează.'
          : 'Fost lucrător: fișa nu se mai semnează.'}
      </Note>
    );
  }
  if (data.status === 'sign_again' && data.revision) {
    return (
      <Note testId="duties-acknowledgement-detail">
        {signAgainReason(data.reasons, formatRoDate(data.revision.issueDate))}
      </Note>
    );
  }
  return null;
}

function EarlierRow({ employee, record }: { employee: Employee; record: DutiesRecord }) {
  return (
    <SummaryRow label="Semnată anterior" testId="duties-acknowledgement-earlier">
      <AnnexLine annex={record.annex} />
      <Note>
        pe hârtie, pe <span className="tabular-nums">{formatRoDate(record.signedOn)}</span>
        {record.clientFileId && (
          <>
            {' · '}
            <ScanLink
              clientId={employee.clientId}
              employeeId={employee.id}
              fileId={record.clientFileId}
              testId="duties-acknowledgement-earlier-scan"
              label="scanul fișei"
            />
          </>
        )}
      </Note>
    </SummaryRow>
  );
}

function MissingAnnex({
  employee,
  data,
  locked,
  phone,
  onMovePost,
}: {
  employee: Employee;
  data: DutiesAcknowledgementResponse;
  locked: boolean;
  phone: boolean;
  onMovePost: () => void;
}) {
  const documents = (
    <TodoAction phone={phone}>
      <Link
        to="/clienti/$clientId/documente-ssm"
        params={{ clientId: employee.clientId }}
        state={openedHere}
      >
        Deschide Documentație SSM
      </Link>
    </TodoAction>
  );
  const archivedPost = data.status === 'no_annex' && employee.jobPosition.archived;
  let text: ReactNode;
  let action: ReactNode;
  if (data.status === 'not_issued') {
    text =
      'Documentul 13, cu atribuțiile SSM ale posturilor, nu este emis încă. Fișa se întocmește din anexa postului.';
    action = documents;
  } else if (archivedPost) {
    text = (
      <>
        Postul lucrătorului, {employee.jobPosition.name}, e arhivat, deci nu are anexă în documentul
        13. Mută lucrătorul pe un post curent.
      </>
    );
    action = (
      <Button
        variant="secondary"
        size="sm"
        data-testid="duties-acknowledgement-move-post"
        className={cn(phone && 'w-full')}
        onClick={onMovePost}
      >
        <Pencil aria-hidden="true" />
        Schimbă postul
      </Button>
    );
  } else {
    text = (
      <>
        Postul {employee.jobPosition.name} nu are anexă în documentul 13
        {data.revision && (
          <>
            , emis la <span className="tabular-nums">{formatRoDate(data.revision.issueDate)}</span>
          </>
        )}
        , înaintea postului. Emite din nou documentul 13.
      </>
    );
    action = documents;
  }
  return (
    <>
      {locked ? (
        <p data-testid="duties-acknowledgement-missing" className={cn('text-sm', summaryQuiet)}>
          {text}
        </p>
      ) : (
        <TodoLine data-testid="duties-acknowledgement-missing" action={action}>
          {text}
        </TodoLine>
      )}
      {data.current && (
        <SummaryList className={cn(values, 'border-t border-border/70 pt-3')}>
          <EarlierRow employee={employee} record={data.current} />
        </SummaryList>
      )}
    </>
  );
}

const saveFailed = 'Nu am putut salva starea fișei. Verifică conexiunea și încearcă din nou.';
const revisionMoved =
  'Documentul 13 a fost emis din nou între timp. Descarcă fișa nouă și dă-o lucrătorului la semnat.';

// The annex is the one shown when the dialog opened: a refetch while it is open must not make the
// paper signed on one revision count for another.
function PaperSheetDialog({
  employee,
  annex,
  onClose,
}: {
  employee: Employee;
  annex: Annex | null;
  onClose: () => void;
}) {
  return (
    <FormDialog open={annex !== null} onClose={onClose}>
      {annex && <PaperSheetForm employee={employee} annex={annex} onClose={onClose} />}
    </FormDialog>
  );
}

function PaperSheetForm({
  employee,
  annex,
  onClose,
}: {
  employee: Employee;
  annex: Annex;
  onClose: () => void;
}) {
  const { request, queryClient } = useApi();
  const [signedOn, setSignedOn] = useState(todayIso);
  const [scan, setScan] = useState<ScanChoice>(noScan);
  const [dateError, setDateError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [superseded, setSuperseded] = useState(false);
  const upload = useScanUpload(employee, setScan);
  useHoldOpen(busy);
  const future = 'Data semnării nu poate fi în viitor.';
  const early = `Data semnării nu poate fi înaintea emiterii documentului 13, pe ${formatRoDate(annex.issueDate)}.`;
  const dateProblem = (value: string) => {
    if (!value) return 'Alege data semnării.';
    if (value > todayIso()) return future;
    if (value < annex.issueDate) return early;
    return null;
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    const problem = dateProblem(signedOn);
    setDateError(problem);
    if (problem) return;
    setBusy(true);
    setError(null);
    let clientFileId: string | null;
    try {
      clientFileId = await upload(scan);
    } catch (cause) {
      setError(uploadFailureMessage(cause));
      setBusy(false);
      return;
    }
    try {
      await recordDutiesAcknowledgement(
        employee.clientId,
        employee.id,
        { revisionId: annex.revisionId, signedOn, clientFileId },
        request
      );
      await invalidateDutiesAcknowledgement(queryClient, employee.clientId, employee.id);
      toast.success('Fișa semnată pe hârtie este înregistrată.');
      onClose();
    } catch (cause) {
      setBusy(false);
      const issues = apiErrorBody(cause)?.issues ?? [];
      if (issues.some((issue) => issue.path === 'signedOn')) {
        setDateError(signedOn > todayIso() ? future : early);
        return;
      }
      if (apiErrorReason(cause) === dutiesAcknowledgementErrorReasons.revisionNotCurrent) {
        setError(revisionMoved);
        setSuperseded(true);
        void invalidateDutiesAcknowledgement(queryClient, employee.clientId, employee.id);
        return;
      }
      setError(commonFailure(cause) ?? saveFailed);
    }
  }

  return (
    <DialogContent
      data-testid="duties-acknowledgement-paper-dialog"
      className="sm:max-w-md"
      showCloseButton={!busy}
    >
      <form onSubmit={(event) => void submit(event)} aria-busy={busy} noValidate>
        <DialogHeader>
          <DialogTitle>Fișa semnată pe hârtie</DialogTitle>
          <DialogDescription>
            Fișa de luare la cunoștință a atribuțiilor SSM semnată de mână de{' '}
            <Masked className="font-medium text-foreground">{formatEmployeeName(employee)}</Masked>.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="mt-5 grid gap-5">
          <Field
            id="duties-acknowledgement-signed-on"
            label="Data semnării"
            error={dateError ? { type: 'manual', message: dateError } : undefined}
          >
            <DatePicker
              id="duties-acknowledgement-signed-on"
              testId="duties-acknowledgement-signed-on"
              value={signedOn}
              min={annex.issueDate}
              max={todayIso()}
              disabled={busy}
              invalid={Boolean(dateError)}
              describedBy={dateError ? 'duties-acknowledgement-signed-on-error' : undefined}
              onChange={setSignedOn}
              required
            />
          </Field>
          <AgreementScanField
            id="duties-acknowledgement-file"
            label="Scanul fișei"
            clientId={employee.clientId}
            employeeId={employee.id}
            value={scan}
            onChange={setScan}
            disabled={busy}
          />
        </DialogBody>
        {error && (
          <Notice variant="destructive" data-testid="duties-acknowledgement-error" className="mt-4">
            {error}
          </Notice>
        )}
        <DialogFooter className="mt-6">
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
            Renunță
          </Button>
          <Button
            type="submit"
            data-testid="duties-acknowledgement-paper-submit"
            disabled={busy || superseded}
          >
            {busy ? 'Se salvează…' : 'Înregistrează'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function RemoveRecordDialog({
  employee,
  record,
  onClose,
}: {
  employee: Employee;
  record: DutiesRecord | null;
  onClose: () => void;
}) {
  const { request, queryClient } = useApi();
  const [error, setError] = useState<string | null>(null);
  const [shown, setShown] = useState(record);
  if (record && record !== shown) {
    setShown(record);
    setError(null);
  }

  async function remove() {
    if (!record) return;
    setError(null);
    try {
      await deleteDutiesAcknowledgementRecord(employee.clientId, employee.id, record.id, request);
      await invalidateDutiesAcknowledgement(queryClient, employee.clientId, employee.id);
      toast.success('Înregistrarea fișei este ștearsă.');
      onClose();
    } catch (cause) {
      setError(
        commonFailure(cause) ??
          'Nu am putut șterge înregistrarea. Verifică conexiunea și încearcă din nou.'
      );
    }
  }

  return (
    <ConfirmDialog
      open={record !== null}
      testId="duties-acknowledgement-remove"
      title="Ștergi înregistrarea fișei?"
      confirmLabel="Șterge înregistrarea"
      pendingLabel="Se șterge…"
      error={error}
      onConfirm={remove}
      onClose={onClose}
    >
      Pentru o fișă înregistrată din greșeală. Fișa semnată pe{' '}
      {shown ? formatRoDate(shown.signedOn) : ''} nu mai apare ca semnată; scanul ei rămâne în
      Documente, la lucrător.
    </ConfirmDialog>
  );
}
