import { formatEmployeeName, signatureErrorReasons } from '@ssm-usor/contracts';
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
import { FileDown, LoaderCircle, PenLine } from 'lucide-react';
import { useState } from 'react';

import {
  getListClientFilesQueryKey,
  getSigningAgreement,
  putSigningAgreementState,
  type SigningAgreementResponseAgreement,
  useListClientFiles,
} from '@/api/generated/api';
import { Field } from '@/components/form-field';
import { Notice } from '@/components/notice';
import { SectionCard } from '@/components/section-card';
import { formatDay } from '@/features/participants/participant-format';
import { saveFile } from '@/lib/save-file';

import { agreementStateLabels, hasSigningReason, signingFailure } from './signature-format';
import { invalidateSigningAgreement, useSigningAgreement } from './use-signing-agreement';

export interface AgreementEmployee {
  id: string;
  clientId: string;
  lastName: string;
  firstName: string;
}

const stateClasses = {
  none: 'border-dashed border-border text-muted-foreground',
  generated: 'border-warning-border bg-warning text-warning-foreground',
  signed_electronically: 'border-success-border bg-success text-success-foreground',
  signed_on_paper: 'border-success-border bg-success text-success-foreground',
  withdrawn: 'border-border bg-secondary text-secondary-foreground',
  in_contract: 'border-success-border bg-success text-success-foreground',
} as const;

function stateDetail(agreement: NonNullable<SigningAgreementResponseAgreement>) {
  if (agreement.state === 'generated') {
    return `Descărcat pe ${formatDay(agreement.generatedAt)}; se semnează de mână sau din portal.`;
  }
  return agreement.signedAt ? `Semnat pe ${formatDay(agreement.signedAt)}.` : null;
}

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
  const [downloading, setDownloading] = useState(false);
  const [noAddress, setNoAddress] = useState(false);
  const [marking, setMarking] = useState(false);
  const agreement = query.data?.agreement ?? null;
  const state = agreement?.state ?? 'none';

  async function download() {
    setDownloading(true);
    setNoAddress(false);
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
      title="Act adițional de semnare electronică"
      description="Acordul angajatului de a semna electronic fișele de instruire, la contractul individual de muncă. Fără el, angajatul poate semna în continuare; lipsa lui apare ca avertisment."
      action={
        query.isSuccess && (
          <>
            {state === 'generated' && !readOnly && (
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
            {state !== 'signed_electronically' && (
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
          </>
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
              : 'Descarcă-l ca să-l dai angajatului spre semnare.'}
          </span>
        </p>
      )}
      <PaperAgreementDialog
        employee={employee}
        userId={userId}
        open={marking}
        onClose={() => setMarking(false)}
      />
    </SectionCard>
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
