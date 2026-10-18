import { formatEmployeeName, signatureErrorReasons } from '@ssm-usor/contracts';
import { signingContractClauseText } from '@ssm-usor/document-engine/signing';
import { Badge } from '@ssm-usor/ui/components/badge';
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
import { NativeSelect, NativeSelectOption } from '@ssm-usor/ui/components/native-select';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import { toast } from '@ssm-usor/ui/lib/toast';
import { Link, useRouteContext } from '@tanstack/react-router';
import { Copy, FileDown, FileSignature, LoaderCircle, PenLine, Undo2 } from 'lucide-react';
import { useState } from 'react';

import {
  getGetOrganizationCompanyDetailsQueryKey,
  getListClientDocumentsQueryKey,
  getListClientFilesQueryKey,
  getSigningAgreement,
  putSigningAgreementState,
  type SigningAgreementResponseAgreement,
  useGetOrganizationCompanyDetails,
  useListClientDocuments,
  useListClientFiles,
} from '@/api/generated/api';
import { Field } from '@/components/form-field';
import { Notice } from '@/components/notice';
import { SectionCard } from '@/components/section-card';
import { useMe } from '@/features/account/use-me';
import { formatDay } from '@/features/participants/participant-format';
import { saveFile } from '@/lib/save-file';

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

const stateClasses = {
  none: 'border-dashed border-border text-muted-foreground',
  generated: 'border-warning-border bg-warning text-warning-foreground',
  signed_electronically: 'border-success-border bg-success text-success-foreground',
  signed_on_paper: 'border-success-border bg-success text-success-foreground',
  withdrawn: 'border-border bg-secondary text-secondary-foreground',
  in_contract: 'border-success-border bg-success text-success-foreground',
} as const;

function stateDetail(agreement: Agreement) {
  switch (agreement.state) {
    case 'generated':
      return agreementAwaitsEmployer(agreement)
        ? `Semnat de angajat pe ${formatDay(agreement.employeeSignedAt)}, așteaptă semnătura administratorului în portal.`
        : `Descărcat pe ${formatDay(agreement.generatedAt)}; se semnează de mână sau din portal.`;
    case 'signed_electronically':
      return agreement.signedAt ? `Semnat electronic pe ${formatDay(agreement.signedAt)}.` : null;
    case 'signed_on_paper':
      return agreement.signedAt ? `Semnat pe hârtie pe ${formatDay(agreement.signedAt)}.` : null;
    case 'withdrawn':
      return agreement.signedAt
        ? `Salariatul a revenit la semnarea olografă. Actul adițional, semnat pe ${formatDay(agreement.signedAt)}, rămâne la dosar.`
        : 'Salariatul a revenit la semnarea olografă.';
    case 'in_contract':
      return 'Clauza este în contractul de muncă.';
  }
}

type Change = 'withdrawn' | 'in_contract';

// `readOnly` is an archived client, whose agreements no longer change.
export function SigningAgreementCard({
  employee,
  userId,
  readOnly,
}: {
  employee: AgreementEmployee;
  userId: string;
  readOnly: boolean;
}) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const query = useSigningAgreement(employee.clientId, employee.id, userId);
  const documents = useListClientDocuments(employee.clientId, undefined, {
    request: apiRequest,
    query: {
      queryKey: [...getListClientDocumentsQueryKey(employee.clientId), userId],
      enabled: Boolean(userId && apiRequest.baseUrl),
    },
  });
  const [downloading, setDownloading] = useState(false);
  const [noAddress, setNoAddress] = useState(false);
  const [noRepresentative, setNoRepresentative] = useState(false);
  const [marking, setMarking] = useState(false);
  const [confirming, setConfirming] = useState<Change | null>(null);
  const [showingClause, setShowingClause] = useState(false);
  const agreement = query.data?.agreement ?? null;
  const state = agreement?.state ?? 'none';
  const awaitsEmployer = agreementAwaitsEmployer(agreement);
  const unsigned = state === 'none' || (state === 'generated' && !awaitsEmployer);
  const agreed =
    state === 'signed_electronically' ||
    state === 'signed_on_paper' ||
    state === 'in_contract' ||
    awaitsEmployer;
  const annexIssued = documents.data
    ? documents.data.notApplicable.includes('signing_regulation_annex') ||
      documents.data.items.some(
        (document) => document.typeKey === 'signing_regulation_annex' && document.issued !== null
      )
    : true;

  async function download() {
    setDownloading(true);
    setNoAddress(false);
    setNoRepresentative(false);
    try {
      const file = await getSigningAgreement(employee.clientId, employee.id, apiRequest);
      saveFile(
        file,
        file instanceof File
          ? file.name
          : `Act-aditional-${formatEmployeeName(employee).replace(/\s+/g, '-')}.pdf`
      );
      if (!agreement && !readOnly) {
        await putSigningAgreementState(
          employee.clientId,
          employee.id,
          { state: 'generated' },
          apiRequest
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

  return (
    <SectionCard
      data-testid="signing-agreement-card"
      title="Actul adițional privind semnarea electronică"
      description="Acordul angajatului de a semna electronic fișele de instruire, la contractul individual de muncă. Fără el, angajatul poate semna în continuare; lipsa lui apare ca avertisment."
      action={
        query.isSuccess && (
          <div className="flex flex-wrap justify-end gap-2">
            {unsigned && !readOnly && (
              <Button
                variant="tonal"
                size="sm"
                data-testid="signing-agreement-paper"
                onClick={() => setMarking(true)}
              >
                <PenLine aria-hidden="true" />
                Marchează semnat pe hârtie
              </Button>
            )}
            {state !== 'in_contract' && (
              <Button
                variant="outline"
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
                Descarcă
              </Button>
            )}
          </div>
        )
      }
    >
      {noAddress && (
        <Notice
          variant="info"
          data-testid="signing-agreement-no-address"
          action={
            <Button asChild variant="outline" size="sm">
              <Link
                to="/clients/$clientId/employees/$employeeId/edit"
                params={{ clientId: employee.clientId, employeeId: employee.id }}
              >
                Modifică datele
              </Link>
            </Button>
          }
        >
          Actul adițional spune unde primește angajatul codurile de semnare. Adaugă-i un email sau
          un telefon, apoi descarcă-l.
        </Notice>
      )}
      {noRepresentative && (
        <Notice
          variant="info"
          data-testid="signing-agreement-no-representative"
          action={
            <Button asChild variant="outline" size="sm">
              <Link to="/clients/$clientId/details" params={{ clientId: employee.clientId }}>
                Datele clientului
              </Link>
            </Button>
          }
        >
          Actul adițional numește reprezentantul legal al clientului. Completează-i numele și
          funcția în datele clientului, apoi descarcă-l.
        </Notice>
      )}
      {!annexIssued && (
        <Notice
          variant="warning"
          data-testid="signing-agreement-annex"
          action={
            <Button asChild variant="outline" size="sm">
              <Link to="/clients/$clientId/documents" params={{ clientId: employee.clientId }}>
                Documente SSM
              </Link>
            </Button>
          }
        >
          Anexa 13 la regulamentul intern nu este emisă. Ea stabilește, pentru angajator, cum se
          semnează electronic fișele; emite-o odată cu actele adiționale.
        </Notice>
      )}
      {query.isPending ? (
        <Skeleton className="h-8 w-full" />
      ) : query.isError ? (
        <Notice
          variant="destructive"
          action={
            <Button
              variant="outline"
              disabled={query.isFetching}
              onClick={() => void query.refetch()}
            >
              Încearcă din nou
            </Button>
          }
        >
          Nu am putut încărca starea actului adițional.
        </Notice>
      ) : (
        <div className="grid gap-3">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <Badge
              variant="outline"
              data-testid="signing-agreement-state"
              data-state={state}
              className={stateClasses[state]}
            >
              {agreementStateLabels[state]}
            </Badge>
            <span className="text-muted-foreground" data-testid="signing-agreement-detail">
              {agreement
                ? stateDetail(agreement)
                : 'Descarcă-l ca să-l dai angajatului spre semnare. Pentru un angajat nou, clauza poate intra direct în contractul de muncă.'}
            </span>
          </p>
          {!readOnly && (unsigned || agreed) && (
            <div className="flex flex-wrap gap-x-1 gap-y-1">
              {unsigned && (
                <Button
                  variant="ghost"
                  size="sm"
                  data-testid="signing-agreement-in-contract"
                  onClick={() => setConfirming('in_contract')}
                >
                  <FileSignature aria-hidden="true" />
                  Clauza e în contract
                </Button>
              )}
              {(unsigned || state === 'in_contract') && (
                <Button
                  variant="ghost"
                  size="sm"
                  data-testid="signing-agreement-clause"
                  onClick={() => setShowingClause(true)}
                >
                  <Copy aria-hidden="true" />
                  Copiază clauza pentru contract
                </Button>
              )}
              {agreed && (
                <Button
                  variant="ghost"
                  size="sm"
                  data-testid="signing-agreement-withdraw"
                  onClick={() => setConfirming('withdrawn')}
                >
                  <Undo2 aria-hidden="true" />
                  Marchează revenirea la semnarea olografă
                </Button>
              )}
            </div>
          )}
        </div>
      )}
      <PaperAgreementDialog
        employee={employee}
        userId={userId}
        open={marking}
        onClose={() => setMarking(false)}
      />
      <AgreementChangeDialog
        employee={employee}
        change={confirming}
        electronic={state === 'signed_electronically' || awaitsEmployer}
        onClose={() => setConfirming(null)}
      />
      <ContractClauseDialog
        userId={userId}
        open={showingClause}
        onClose={() => setShowingClause(false)}
      />
    </SectionCard>
  );
}

const changeCopy = {
  withdrawn: {
    title: 'Revenirea la semnarea olografă',
    confirm: 'Marchează revenirea',
    done: 'Revenirea la semnarea olografă este înregistrată.',
  },
  in_contract: {
    title: 'Clauza este în contractul de muncă',
    confirm: 'Marchează clauza în contract',
    done: 'Actul adițional este marcat ca clauză în contractul de muncă.',
  },
} as const;

function AgreementChangeDialog({
  employee,
  change,
  electronic,
  onClose,
}: {
  employee: AgreementEmployee;
  change: Change | null;
  electronic: boolean;
  onClose: () => void;
}) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const copy = change ? changeCopy[change] : null;

  async function save() {
    if (!change || !copy) return;
    setBusy(true);
    setError(null);
    try {
      await putSigningAgreementState(employee.clientId, employee.id, { state: change }, apiRequest);
      await invalidateSigningAgreement(queryClient, employee.clientId, employee.id);
      toast.success(copy.done);
      onClose();
    } catch (cause) {
      setError(
        signingFailure(
          cause,
          'Nu am putut salva starea actului adițional. Verifică conexiunea și încearcă din nou.'
        )
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={change !== null}
      onOpenChange={(next) => {
        if (!next && !busy) {
          setError(null);
          onClose();
        }
      }}
    >
      {copy && (
        <DialogContent data-testid="signing-agreement-change-dialog" className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{copy.title}</DialogTitle>
            <DialogDescription>
              {change === 'withdrawn'
                ? `${formatEmployeeName(employee)} a cerut în scris să semneze din nou de mână. De la înregistrare, fișele lui se semnează pe hârtie, iar cererile de semnare electronică în așteptare se anulează. ${electronic ? 'Actul adițional semnat electronic și semnăturile de până acum rămân la dosar.' : 'Fișele semnate până acum rămân valabile.'}`
                : `Contractul de muncă al lui ${formatEmployeeName(employee)} cuprinde clauza privind semnarea electronică, așa că nu mai este nevoie de un act adițional separat.`}
            </DialogDescription>
          </DialogHeader>
          {error && (
            <Notice variant="destructive" data-testid="signing-agreement-change-error">
              {error}
            </Notice>
          )}
          <DialogFooter>
            <Button type="button" variant="ghost" disabled={busy} onClick={onClose}>
              Renunță
            </Button>
            <Button
              type="button"
              data-testid="signing-agreement-change-confirm"
              disabled={busy}
              onClick={() => void save()}
            >
              {busy ? 'Se salvează…' : copy.confirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}

function ContractClauseDialog({
  userId,
  open,
  onClose,
}: {
  userId: string;
  open: boolean;
  onClose: () => void;
}) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const me = useMe();
  const details = useGetOrganizationCompanyDetails({
    request: apiRequest,
    query: {
      queryKey: [...getGetOrganizationCompanyDetailsQueryKey(), userId],
      enabled: open && Boolean(userId && apiRequest.baseUrl),
    },
  });
  // The agreement names the provider as the API draws it up: the legal name, else the app's name.
  const providerName =
    details.data?.companyDetails.legalName || me.data?.membership?.organization.name || '';
  const paragraphs = signingContractClauseText(providerName);

  async function copy() {
    try {
      await navigator.clipboard.writeText(paragraphs.join('\n\n'));
      toast.success('Clauza a fost copiată.');
    } catch {
      toast.error('Nu am putut copia clauza. Selectează textul și copiază-l de mână.');
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      {open && (
        <DialogContent data-testid="signing-agreement-clause-dialog" className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Clauza pentru contractul de muncă</DialogTitle>
            <DialogDescription>
              Pentru un angajat nou: clauza intră în contractul individual de muncă în locul actului
              adițional. După semnarea contractului, marchează „Clauza e în contract”.
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            {details.isPending && !me.data ? (
              <Skeleton className="h-40 w-full" />
            ) : (
              <div
                data-testid="signing-agreement-clause-text"
                className="grid gap-3 rounded-md border bg-muted/40 p-4 text-sm leading-relaxed"
              >
                {paragraphs.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>
              Închide
            </Button>
            <Button
              type="button"
              data-testid="signing-agreement-clause-copy"
              disabled={!providerName}
              onClick={() => void copy()}
            >
              <Copy aria-hidden="true" />
              Copiază clauza
            </Button>
          </DialogFooter>
        </DialogContent>
      )}
    </Dialog>
  );
}

function PaperAgreementDialog({
  employee,
  userId,
  open,
  onClose,
}: {
  employee: AgreementEmployee;
  userId: string;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      {open && <PaperAgreementForm employee={employee} userId={userId} onClose={onClose} />}
    </Dialog>
  );
}

function PaperAgreementForm({
  employee,
  userId,
  onClose,
}: {
  employee: AgreementEmployee;
  userId: string;
  onClose: () => void;
}) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const params = { employeeId: employee.id };
  const files = useListClientFiles(employee.clientId, params, {
    request: apiRequest,
    query: { queryKey: [...getListClientFilesQueryKey(employee.clientId, params), userId] },
  });
  const [clientFileId, setClientFileId] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await putSigningAgreementState(
        employee.clientId,
        employee.id,
        { state: 'signed_on_paper', clientFileId: clientFileId || null },
        apiRequest
      );
      await invalidateSigningAgreement(queryClient, employee.clientId, employee.id);
      toast.success('Actul adițional este marcat semnat pe hârtie.');
      onClose();
    } catch (cause) {
      setError(
        signingFailure(
          cause,
          'Nu am putut salva starea actului adițional. Verifică conexiunea și încearcă din nou.'
        )
      );
    } finally {
      setBusy(false);
    }
  }

  const items = files.data?.items ?? [];
  const noFiles = files.isSuccess && items.length === 0;
  return (
    <DialogContent data-testid="signing-agreement-paper-dialog" className="sm:max-w-md">
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
        aria-busy={busy}
        noValidate
      >
        <DialogHeader>
          <DialogTitle>Marchează semnat pe hârtie</DialogTitle>
          <DialogDescription>
            Pentru actul adițional semnat de mână de angajat și de angajator. Scanul îl poți atașa
            din fișierele angajatului.
          </DialogDescription>
        </DialogHeader>
        <DialogBody className="mt-5 grid gap-5">
          <Field
            id="signing-agreement-file"
            label="Scanul semnat"
            mark="optional"
            hint={
              noFiles
                ? 'Angajatul nu are fișiere. Încarcă scanul în „Fișiere”, pe pagina lui, ca să-l poți atașa.'
                : undefined
            }
          >
            <NativeSelect
              id="signing-agreement-file"
              data-testid="signing-agreement-file"
              value={clientFileId}
              disabled={busy || !files.isSuccess}
              aria-describedby={noFiles ? 'signing-agreement-file-hint' : undefined}
              onChange={(event) => setClientFileId(event.target.value)}
            >
              <NativeSelectOption value="">Fără fișier atașat</NativeSelectOption>
              {items.map((file) => (
                <NativeSelectOption key={file.id} value={file.id}>
                  {file.name}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </Field>
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
            {busy ? 'Se salvează…' : 'Marchează semnat'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
