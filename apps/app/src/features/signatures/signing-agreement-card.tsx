import { useFileLink } from '@ssm-usor/api-http/file-link';
import { formatEmployeeName, signatureErrorReasons } from '@ssm-usor/contracts';
import { signingContractClauseText } from '@ssm-usor/document-engine/signing';
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
import {
  Check,
  Copy,
  FileDown,
  FileSignature,
  LoaderCircle,
  Pencil,
  PenLine,
  Undo2,
} from 'lucide-react';
import { type FormEvent, type ReactNode, useState } from 'react';

import {
  getGetOrganizationCompanyDetailsQueryKey,
  getListClientDocumentsQueryKey,
  getSigningAgreement,
  getSigningAgreementLink,
  putSigningAgreementState,
  type SigningAgreementResponseAgreement,
  type SigningAgreementStateRequest,
  useGetOrganizationCompanyDetails,
  useListClientDocuments,
} from '@/api/generated/api';
import { apiErrorBody } from '@/api/http';
import { useApi } from '@/api/use-api';
import { openedFromRecord, openedHere } from '@/app/opener';
import { useHoldOpen } from '@/components/close-guard';
import { DatePicker } from '@/components/date-picker';
import { FileLinkButton } from '@/components/file-link-button';
import { FormDialog } from '@/components/form-dialog';
import { Field } from '@/components/form-field';
import { LoadFailed } from '@/components/load-failed';
import { Masked } from '@/components/replay';
import { SectionCard } from '@/components/section-card';
import { TodoLine } from '@/components/todo-line';
import { useMe } from '@/features/account/use-me';
import { uploadFailureMessage } from '@/features/client-files/client-file-format';
import {
  SummaryList,
  SummaryNote,
  summaryQuiet,
  SummaryRow,
} from '@/features/clients/details/summary-list';
import { dateToIso, formatDate, formatDay, todayIso } from '@/lib/dates';

import { noScan, type ScanChoice, useScanUpload } from './agreement-scan';
import { AgreementScanField } from './agreement-scan-field';
import { ScanLink } from './scan-link';
import {
  agreementAwaitsEmployer,
  agreementStateLabels,
  hasSigningReason,
  signingFailure,
} from './signature-format';
import { invalidateSigningAgreement, useSigningAgreement } from './use-signing-agreement';

export interface AgreementEmployee {
  id: string;
  clientId: string;
  lastName: string;
  firstName: string;
}

type Agreement = NonNullable<SigningAgreementResponseAgreement>;
type State = Agreement['state'] | 'none';

const warning = 'border-warning-border bg-warning text-warning-foreground';
const success = 'border-success-border bg-success text-success-foreground';

const stateClasses: Record<State, string> = {
  none: warning,
  generated: warning,
  signed_electronically: success,
  signed_on_paper: success,
  in_contract: success,
  withdrawn: 'border-border bg-secondary text-secondary-foreground',
};

const values = '[&_dd>div:first-child]:font-medium';

function StateBadge({ state, label }: { state: State; label: string }) {
  return (
    <Badge
      variant="outline"
      data-testid="signing-agreement-state"
      data-state={state}
      className={stateClasses[state]}
    >
      {stateClasses[state] === success && <Check aria-hidden="true" />}
      {label}
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

function stateNote(
  agreement: Agreement | null,
  { readOnly, former, unsigned }: { readOnly: boolean; former: boolean; unsigned: boolean }
) {
  if (readOnly && unsigned) return 'Clientul e arhivat: actul nu se mai semnează.';
  if (former && unsigned) return 'Fost lucrător: actul nu se mai semnează.';
  switch (agreement?.state) {
    case 'signed_on_paper':
      return agreement.signedAt ? `pe ${formatDay(agreement.signedAt)}` : null;
    case 'in_contract':
      return 'Clauza e în contractul de muncă, deci actul adițional nu mai e necesar.';
    case 'withdrawn': {
      const recordedAt = agreement.withdrawal?.recordedAt;
      return recordedAt
        ? `Din ${formatDay(recordedAt)} semnează fișele de mână. Actul și semnăturile de până atunci rămân la dosar.`
        : 'Semnează fișele de mână; actul și semnăturile dinaintea revenirii rămân la dosar.';
    }
    default:
      return null;
  }
}

function nextStep(agreement: Agreement | null, invited: boolean) {
  if (!agreement) {
    return invited
      ? 'Îl găsește în portal la prima autentificare, înaintea fișelor.'
      : 'Lucrătorul îl semnează în portal după ce îl inviți. Dacă preferă hârtia, descarcă-l și dă-l la semnat.';
  }
  if (agreementAwaitsEmployer(agreement)) {
    return 'Urmează administratorul clientului, tot în portal.';
  }
  if (agreement.state === 'generated') {
    return `Pe ${formatDay(agreement.generatedAt)}. După ce îl semnează lucrătorul și angajatorul, înregistrează-l.`;
  }
  return null;
}

const actionsClass = 'flex flex-wrap gap-2 max-sm:grid max-sm:[&>*]:w-full';

// `readOnly` is an archived client and `former` a worker who left: neither agreement changes any
// more. `leads` says the access panel holds no forward step, so recording a downloaded agreement
// takes the tab's dark button; `contactAsked` says the access panel already asks for the missing
// email or phone.
export function SigningAgreementCard({
  employee,
  readOnly,
  former,
  invited,
  leads,
  contactAsked,
}: {
  employee: AgreementEmployee;
  readOnly: boolean;
  former: boolean;
  invited: boolean;
  leads: boolean;
  contactAsked: boolean;
}) {
  const { request, queryClient, ready, key } = useApi();
  const phone = useIsPhone();
  const query = useSigningAgreement(employee.clientId, employee.id);
  const documents = useListClientDocuments(employee.clientId, undefined, {
    request,
    query: {
      queryKey: key(getListClientDocumentsQueryKey(employee.clientId)),
      enabled: ready,
    },
  });
  const [downloading, setDownloading] = useState(false);
  const [noAddress, setNoAddress] = useState(false);
  const [noRepresentative, setNoRepresentative] = useState(false);
  const [marking, setMarking] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [clause, setClause] = useState<ClauseMode | null>(null);
  const agreement = query.data?.agreement ?? null;
  const unavailable = query.data?.unavailable ?? null;
  const state: State = agreement?.state ?? 'none';
  const awaitsEmployer = agreementAwaitsEmployer(agreement);
  const unsigned = state === 'none' || (state === 'generated' && !awaitsEmployer);
  const agreed =
    state === 'signed_electronically' ||
    state === 'signed_on_paper' ||
    state === 'in_contract' ||
    awaitsEmployer;
  // Signed electronically by either party, the agreement is a stored file with a link of its
  // own; before that it is drawn up when asked for, and comes through the page.
  const stored = Boolean(agreement?.employeeSignedAt || agreement?.employerSignedAt);
  const storedLink = useFileLink({
    queryKey: [
      'signing-agreement-link',
      employee.clientId,
      employee.id,
      agreement?.employeeSignedAt,
      agreement?.employerSignedAt,
    ],
    load: (signal) =>
      getSigningAgreementLink(employee.clientId, employee.id, { ...request, signal }),
    enabled: stored,
    apiRequest: request,
    disposition: 'attachment',
  });
  const annexIssued = documents.data
    ? documents.data.notApplicable.includes('signing_regulation_annex') ||
      documents.data.items.some(
        (document) => document.typeKey === 'signing_regulation_annex' && document.issued !== null
      )
    : true;
  const locked = readOnly || former;
  const paperLeads = leads && !locked && state === 'generated' && !awaitsEmployer;
  const scanId =
    state === 'signed_on_paper' || state === 'withdrawn' ? (agreement?.clientFileId ?? null) : null;
  const requestScanId = agreement?.withdrawal?.fileId ?? null;

  async function download() {
    setDownloading(true);
    setNoAddress(false);
    setNoRepresentative(false);
    try {
      const file = await getSigningAgreement(employee.clientId, employee.id, request);
      saveFile(
        file,
        file instanceof File
          ? file.name
          : `Act-aditional-${formatEmployeeName(employee).replace(/\s+/g, '-')}.pdf`
      );
      if (!agreement) {
        await putSigningAgreementState(
          employee.clientId,
          employee.id,
          { state: 'generated' },
          request
        );
        await invalidateSigningAgreement(queryClient, employee.clientId, employee.id);
      }
    } catch (cause) {
      if (hasSigningReason(cause, signatureErrorReasons.employeeHasNoAddress)) {
        setNoAddress(true);
      } else if (hasSigningReason(cause, 'missing_document_data')) {
        setNoRepresentative(true);
      } else {
        toast.error(
          signingFailure(
            cause,
            'Nu am putut descărca actul adițional. Verifică conexiunea și încearcă din nou.'
          )
        );
      }
    } finally {
      setDownloading(false);
    }
  }

  const paperButton = (
    <Button
      key="paper"
      variant={paperLeads ? 'default' : 'secondary'}
      size="sm"
      data-testid="signing-agreement-paper"
      onClick={() => setMarking(true)}
    >
      <PenLine aria-hidden="true" />
      Înregistrează actul semnat pe hârtie…
    </Button>
  );
  const downloadButton = (
    <Button
      key="download"
      variant="secondary"
      size="sm"
      data-testid="signing-agreement-download"
      disabled={downloading}
      onClick={() => void download()}
    >
      {downloading ? (
        <LoaderCircle aria-hidden="true" className="animate-spin" />
      ) : (
        <FileDown aria-hidden="true" />
      )}
      Descarcă actul pentru semnare pe hârtie
    </Button>
  );
  const buttons: ReactNode[] = [];
  if (unsigned && !locked) {
    buttons.push(...(paperLeads ? [paperButton, downloadButton] : [downloadButton, paperButton]));
    buttons.push(
      <Button
        key="clause"
        variant="secondary"
        size="sm"
        data-testid="signing-agreement-in-contract"
        onClick={() => setClause('record')}
      >
        <FileSignature aria-hidden="true" />
        Folosește clauza în contractul de muncă…
      </Button>
    );
  }
  if (stored && state !== 'in_contract') {
    buttons.push(
      <FileLinkButton
        key="signed"
        variant="secondary"
        size="sm"
        data-testid="signing-agreement-download"
        link={storedLink}
      >
        <FileDown aria-hidden="true" />
        Descarcă actul semnat
      </FileLinkButton>
    );
  }
  if (state === 'in_contract') {
    buttons.push(
      <Button
        key="view-clause"
        variant="secondary"
        size="sm"
        data-testid="signing-agreement-clause"
        onClick={() => setClause('view')}
      >
        <Copy aria-hidden="true" />
        Vezi clauza…
      </Button>
    );
  }
  if (agreed && !locked) {
    buttons.push(
      <Button
        key="withdraw"
        variant="secondary"
        size="sm"
        data-testid="signing-agreement-withdraw"
        onClick={() => setWithdrawing(true)}
      >
        <Undo2 aria-hidden="true" />
        Înregistrează revenirea la semnarea de mână…
      </Button>
    );
  }

  const todos: ReactNode[] = [];
  if (
    !locked &&
    (noAddress || (!contactAsked && unavailable?.reason === 'employee_has_no_address'))
  ) {
    todos.push(
      <TodoLine
        key="address"
        data-testid="signing-agreement-no-address"
        action={
          <TodoAction phone={phone}>
            <Link
              to="/clienti/$clientId/angajati/$employeeId/editare"
              params={{ clientId: employee.clientId, employeeId: employee.id }}
              search={{ focus: 'contact' }}
              state={openedFromRecord(`/clienti/${employee.clientId}/angajati/${employee.id}`)}
            >
              <Pencil aria-hidden="true" />
              Adaugă emailul sau telefonul
            </Link>
          </TodoAction>
        }
      >
        Lucrătorul nu are email sau telefon, iar actul adițional spune unde primește codurile de
        semnare.
      </TodoLine>
    );
  }
  if (!locked && (noRepresentative || unavailable?.reason === 'missing_document_data')) {
    todos.push(
      <TodoLine
        key="representative"
        data-testid="signing-agreement-no-representative"
        action={
          <TodoAction phone={phone}>
            <Link
              to="/clienti/$clientId/detalii"
              params={{ clientId: employee.clientId }}
              state={openedHere}
            >
              <Pencil aria-hidden="true" />
              Completează la client
            </Link>
          </TodoAction>
        }
      >
        Clientul nu are reprezentant legal completat, iar actul adițional îl numește.
      </TodoLine>
    );
  }
  if (!locked && !annexIssued) {
    todos.push(
      <TodoLine
        key="annex"
        data-testid="signing-agreement-annex"
        action={
          <TodoAction phone={phone}>
            <Link
              to="/clienti/$clientId/documente-ssm"
              params={{ clientId: employee.clientId }}
              state={openedHere}
            >
              Deschide Documentație SSM
            </Link>
          </TodoAction>
        }
      >
        Anexa 14 la regulamentul intern nu este emisă. Emite-o odată cu actele adiționale.
      </TodoLine>
    );
  }

  const note = query.isSuccess ? stateNote(agreement, { readOnly, former, unsigned }) : null;
  const next = !locked && query.isSuccess ? nextStep(agreement, invited) : null;

  return (
    <SectionCard
      data-testid="signing-agreement-card"
      className="gap-4"
      title="Actul adițional privind semnarea electronică"
      help="angajati.act-aditional"
      longTitle
    >
      {todos.length > 0 && <div className="grid gap-3 border-b border-border/70 pb-4">{todos}</div>}
      {query.isPending ? (
        <Skeleton className="h-16 w-full" />
      ) : query.isError ? (
        <LoadFailed
          error={query.error}
          busy={query.isFetching}
          onRetry={() => void query.refetch()}
        >
          Nu am putut încărca starea actului adițional.
        </LoadFailed>
      ) : (
        <>
          <SummaryList className={values}>
            <SummaryRow label="Stare">
              <StateBadge
                state={state}
                label={awaitsEmployer ? 'Semnat de lucrător' : agreementStateLabels[state]}
              />
              {note && <Note testId="signing-agreement-detail">{note}</Note>}
            </SummaryRow>
            {stored && agreement && (
              <SummaryRow label="Semnături" testId="signing-agreement-signatures">
                {agreement.employeeSignedAt && (
                  <span className="block tabular-nums">
                    Lucrătorul · {formatDay(agreement.employeeSignedAt)}
                  </span>
                )}
                {agreement.employerSignedAt ? (
                  <span className="block tabular-nums">
                    Administratorul clientului · {formatDay(agreement.employerSignedAt)}
                  </span>
                ) : (
                  awaitsEmployer && (
                    <span className="block">
                      Administratorul clientului ·{' '}
                      <span className="text-warning-foreground">în așteptare</span>
                    </span>
                  )
                )}
              </SummaryRow>
            )}
            {agreement?.withdrawal?.requestedOn && (
              <SummaryRow label="Cererea lucrătorului" testId="signing-agreement-request">
                <span className="tabular-nums">{formatDate(agreement.withdrawal.requestedOn)}</span>
                {requestScanId && (
                  <span className="block">
                    <ScanLink
                      clientId={employee.clientId}
                      employeeId={employee.id}
                      fileId={requestScanId}
                      testId="signing-agreement-request-scan"
                    />
                  </span>
                )}
              </SummaryRow>
            )}
            {(state === 'signed_on_paper' || (state === 'withdrawn' && scanId)) && (
              <SummaryRow label="Scan" testId="signing-agreement-scan">
                {scanId ? (
                  <ScanLink
                    clientId={employee.clientId}
                    employeeId={employee.id}
                    fileId={scanId}
                    testId="signing-agreement-scan-link"
                  />
                ) : (
                  <span className={cn('font-normal', summaryQuiet)}>Fără scan atașat</span>
                )}
              </SummaryRow>
            )}
            {next && (
              <SummaryRow label="Ce urmează">
                <span data-testid="signing-agreement-next">{next}</span>
              </SummaryRow>
            )}
          </SummaryList>
          {buttons.length > 0 && (
            <div data-testid="signing-agreement-actions" className={actionsClass}>
              {buttons}
            </div>
          )}
        </>
      )}
      <PaperAgreementDialog employee={employee} open={marking} onClose={() => setMarking(false)} />
      <WithdrawalDialog
        employee={employee}
        signedSince={agreement && signedSinceOf(agreement)}
        open={withdrawing}
        onClose={() => setWithdrawing(false)}
      />
      <ContractClauseDialog employee={employee} mode={clause} onClose={() => setClause(null)} />
    </SectionCard>
  );
}

function TodoAction({ phone, children }: { phone: boolean; children: ReactNode }) {
  return (
    <Button asChild variant="secondary" size="sm" className={cn(phone && 'w-full')}>
      {children}
    </Button>
  );
}

const saveFailed =
  'Nu am putut salva starea actului adițional. Verifică conexiunea și încearcă din nou.';

function useAgreementChange(employee: AgreementEmployee, done: string, onClose: () => void) {
  const { request, queryClient } = useApi();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useHoldOpen(busy);

  async function save(change: () => Promise<SigningAgreementStateRequest>) {
    setBusy(true);
    setError(null);
    let body: SigningAgreementStateRequest;
    try {
      body = await change();
    } catch (cause) {
      setError(uploadFailureMessage(cause));
      setBusy(false);
      return 'failed' as const;
    }
    try {
      await putSigningAgreementState(employee.clientId, employee.id, body, request);
      await invalidateSigningAgreement(queryClient, employee.clientId, employee.id);
      toast.success(done);
      onClose();
      return 'saved' as const;
    } catch (cause) {
      const issues = apiErrorBody(cause)?.issues ?? [];
      if (issues.some((issue) => issue.path === 'signedOn' || issue.path === 'requestedOn')) {
        setBusy(false);
        return 'date' as const;
      }
      setError(signingFailure(cause, saveFailed));
      setBusy(false);
      return 'failed' as const;
    }
  }

  return { busy, error, save };
}

function dateProblem(value: string, empty: string, future: string) {
  if (!value) return empty;
  if (value > todayIso()) return future;
  return null;
}

// The API refuses a request dated before the day the agreement was signed, or else handed out.
const signedSinceOf = (agreement: Agreement) =>
  dateToIso(new Date(agreement.signedAt ?? agreement.employeeSignedAt ?? agreement.generatedAt));

function PaperAgreementDialog({
  employee,
  open,
  onClose,
}: {
  employee: AgreementEmployee;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <FormDialog open={open} onClose={onClose}>
      {open && <PaperAgreementForm employee={employee} onClose={onClose} />}
    </FormDialog>
  );
}

function PaperAgreementForm({
  employee,
  onClose,
}: {
  employee: AgreementEmployee;
  onClose: () => void;
}) {
  const [signedOn, setSignedOn] = useState(todayIso);
  const [scan, setScan] = useState<ScanChoice>(noScan);
  const [dateError, setDateError] = useState<string | null>(null);
  const upload = useScanUpload(employee, setScan);
  const { busy, error, save } = useAgreementChange(
    employee,
    'Actul adițional semnat pe hârtie este înregistrat.',
    onClose
  );
  const future = 'Data semnării nu poate fi în viitor.';

  async function submit(event: FormEvent) {
    event.preventDefault();
    const problem = dateProblem(signedOn, 'Alege data semnării.', future);
    setDateError(problem);
    if (problem) return;
    const result = await save(async () => ({
      state: 'signed_on_paper',
      signedOn,
      clientFileId: await upload(scan),
    }));
    if (result === 'date') setDateError(future);
  }

  return (
    <DialogContent
      data-testid="signing-agreement-paper-dialog"
      className="sm:max-w-md"
      showCloseButton={!busy}
    >
      <form onSubmit={(event) => void submit(event)} aria-busy={busy} noValidate>
        <DialogHeader>
          <DialogTitle>Actul semnat pe hârtie</DialogTitle>
          <DialogDescription>
            Actul adițional semnat de mână de{' '}
            <Masked className="font-medium text-foreground">{formatEmployeeName(employee)}</Masked>{' '}
            și de angajator.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="mt-5 grid gap-5">
          <Field
            id="signing-agreement-signed-on"
            label="Data semnării"
            error={dateError ? { type: 'manual', message: dateError } : undefined}
          >
            <DatePicker
              id="signing-agreement-signed-on"
              testId="signing-agreement-signed-on"
              value={signedOn}
              max={todayIso()}
              disabled={busy}
              invalid={Boolean(dateError)}
              describedBy={dateError ? 'signing-agreement-signed-on-error' : undefined}
              onChange={setSignedOn}
              required
            />
          </Field>
          <AgreementScanField
            id="signing-agreement-file"
            label="Scanul actului"
            clientId={employee.clientId}
            employeeId={employee.id}
            value={scan}
            onChange={setScan}
            disabled={busy}
          />
        </DialogBody>
        {error && (
          <Notice variant="destructive" data-testid="signing-agreement-error" className="mt-4">
            {error}
          </Notice>
        )}
        <DialogFooter className="mt-6">
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
            Renunță
          </Button>
          <Button type="submit" data-testid="signing-agreement-paper-submit" disabled={busy}>
            {busy ? 'Se salvează…' : 'Înregistrează'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function WithdrawalDialog({
  employee,
  signedSince,
  open,
  onClose,
}: {
  employee: AgreementEmployee;
  signedSince: string | null;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <FormDialog open={open} onClose={onClose}>
      {open && <WithdrawalForm employee={employee} signedSince={signedSince} onClose={onClose} />}
    </FormDialog>
  );
}

function WithdrawalForm({
  employee,
  signedSince,
  onClose,
}: {
  employee: AgreementEmployee;
  signedSince: string | null;
  onClose: () => void;
}) {
  const [requestedOn, setRequestedOn] = useState(todayIso);
  const [scan, setScan] = useState<ScanChoice>(noScan);
  const [dateError, setDateError] = useState<string | null>(null);
  const upload = useScanUpload(employee, setScan);
  const { busy, error, save } = useAgreementChange(
    employee,
    'Revenirea la semnarea de mână este înregistrată.',
    onClose
  );
  const future = 'Data cererii nu poate fi în viitor.';
  const early = 'Data cererii nu poate fi înaintea semnării actului.';

  async function submit(event: FormEvent) {
    event.preventDefault();
    const problem =
      dateProblem(requestedOn, 'Alege data cererii.', future) ??
      (signedSince && requestedOn < signedSince ? early : null);
    setDateError(problem);
    if (problem) return;
    const result = await save(async () => ({
      state: 'withdrawn',
      requestedOn,
      requestFileId: await upload(scan),
    }));
    if (result === 'date') setDateError(requestedOn > todayIso() ? future : early);
  }

  return (
    <DialogContent
      data-testid="signing-agreement-withdraw-dialog"
      className="sm:max-w-md"
      showCloseButton={!busy}
    >
      <form onSubmit={(event) => void submit(event)} aria-busy={busy} noValidate>
        <DialogHeader>
          <DialogTitle>Revenirea la semnarea de mână</DialogTitle>
          <DialogDescription>
            De acum, fișele lui se semnează de mână. Cererile de semnare electronică în așteptare se
            anulează; actul și semnăturile de până atunci rămân la dosar.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="mt-5 grid gap-5">
          <Field
            id="signing-agreement-requested-on"
            label="Data cererii"
            error={dateError ? { type: 'manual', message: dateError } : undefined}
          >
            <DatePicker
              id="signing-agreement-requested-on"
              testId="signing-agreement-requested-on"
              value={requestedOn}
              min={signedSince ?? undefined}
              max={todayIso()}
              disabled={busy}
              invalid={Boolean(dateError)}
              describedBy={dateError ? 'signing-agreement-requested-on-error' : undefined}
              onChange={setRequestedOn}
              required
            />
          </Field>
          <AgreementScanField
            id="signing-agreement-request-file"
            label="Cererea scrisă"
            clientId={employee.clientId}
            employeeId={employee.id}
            value={scan}
            onChange={setScan}
            disabled={busy}
          />
        </DialogBody>
        {error && (
          <Notice variant="destructive" data-testid="signing-agreement-error" className="mt-4">
            {error}
          </Notice>
        )}
        <DialogFooter className="mt-6">
          <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
            Renunță
          </Button>
          <Button type="submit" data-testid="signing-agreement-withdraw-submit" disabled={busy}>
            {busy ? 'Se salvează…' : 'Înregistrează revenirea'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

type ClauseMode = 'record' | 'view';

function ContractClauseDialog({
  employee,
  mode,
  onClose,
}: {
  employee: AgreementEmployee;
  mode: ClauseMode | null;
  onClose: () => void;
}) {
  return (
    <FormDialog open={mode !== null} onClose={onClose}>
      {mode && <ContractClause employee={employee} mode={mode} onClose={onClose} />}
    </FormDialog>
  );
}

function ContractClause({
  employee,
  mode,
  onClose,
}: {
  employee: AgreementEmployee;
  mode: ClauseMode;
  onClose: () => void;
}) {
  const { request: apiRequest, ready, key: userKey } = useApi();
  const me = useMe();
  const details = useGetOrganizationCompanyDetails({
    request: apiRequest,
    query: {
      queryKey: userKey(getGetOrganizationCompanyDetailsQueryKey()),
      enabled: ready,
    },
  });
  const [copied, setCopied] = useState(false);
  const { busy, error, save } = useAgreementChange(
    employee,
    'Actul adițional este înlocuit de clauza din contractul de muncă.',
    onClose
  );
  // The agreement names the provider as the API draws it up: the legal name, else the app's name.
  const providerName =
    details.data?.companyDetails.legalName || me.data?.membership?.organization.name || '';
  const paragraphs = signingContractClauseText(providerName);

  async function copy() {
    try {
      await navigator.clipboard.writeText(paragraphs.join('\n\n'));
      setCopied(true);
    } catch {
      toast.error('Nu am putut copia clauza. Selectează textul și copiază-l de mână.');
    }
  }

  return (
    <DialogContent
      data-testid="signing-agreement-clause-dialog"
      className="sm:max-w-2xl"
      showCloseButton={!busy}
    >
      <DialogHeader>
        <DialogTitle>Clauza în contractul de muncă</DialogTitle>
        <DialogDescription>
          Pentru un lucrător nou: clauza intră în contractul individual de muncă în locul actului
          adițional.
        </DialogDescription>
      </DialogHeader>
      <DialogBody>
        {details.isPending && !me.data ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <div
            data-testid="signing-agreement-clause-text"
            className="grid max-h-80 gap-3 overflow-y-auto rounded-md border bg-muted/40 p-4 text-sm leading-relaxed"
          >
            {paragraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>
        )}
      </DialogBody>
      {error && (
        <Notice variant="destructive" data-testid="signing-agreement-error">
          {error}
        </Notice>
      )}
      <DialogFooter>
        <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
          {mode === 'record' ? 'Renunță' : 'Închide'}
        </Button>
        <Button
          type="button"
          variant="secondary"
          data-testid="signing-agreement-clause-copy"
          disabled={!providerName}
          onClick={() => void copy()}
        >
          {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
          {copied ? 'Copiată' : 'Copiază clauza'}
        </Button>
        {mode === 'record' && (
          <Button
            type="button"
            data-testid="signing-agreement-in-contract-confirm"
            disabled={busy}
            onClick={() => void save(async () => ({ state: 'in_contract' }))}
          >
            {busy ? 'Se salvează…' : 'Clauza e în contract'}
          </Button>
        )}
      </DialogFooter>
    </DialogContent>
  );
}
