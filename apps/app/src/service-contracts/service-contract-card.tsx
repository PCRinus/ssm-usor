import { zodResolver } from '@hookform/resolvers/zod';
import { unfilledMark } from '@ssm-usor/contracts';
import { Badge } from '@ssm-usor/ui/components/badge';
import { Button } from '@ssm-usor/ui/components/button';
import { Card, CardContent, CardHeader } from '@ssm-usor/ui/components/card';
import { Checkbox } from '@ssm-usor/ui/components/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ssm-usor/ui/components/dialog';
import { Input } from '@ssm-usor/ui/components/input';
import { Label } from '@ssm-usor/ui/components/label';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import { toast } from '@ssm-usor/ui/lib/toast';
import { Link, useRouteContext } from '@tanstack/react-router';
import { Download, FileText, Send, Sparkles } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';

import {
  type ApiErrorResponse,
  getDocumentDownload,
  getGetServiceContractQueryKey,
  getListClientsQueryKey,
  type ServiceContractResponse,
  useDeleteDocumentDraft,
  useGenerateServiceContract,
  useGetServiceContract,
  useIssueDocument,
  useSaveServiceContract,
} from '../api/generated/api';
import { ApiHttpError } from '../api/http';
import type { Client } from '../clients/client-form-schema';
import { DatePicker } from '../components/date-picker';
import { Field } from '../components/form-field';
import { Notice } from '../components/notice';
import { todayIso } from '../employees/employee-format';
import { formatRoDate } from '../lib/dates';
import { SendContractDialog } from './send-contract-dialog';
import {
  groupMissing,
  missingLabels,
  serviceContractFormSchema,
  type ServiceContractFormValues,
  toServiceContractForm,
  toServiceContractRequest,
} from './service-contract-schema';

type Confirming = 'regenerate' | 'issue' | 'issueUnfilled' | 'delete' | null;

const confirmations = {
  regenerate: {
    title: 'Generezi contractul din nou?',
    text: 'Ciorna este completată din nou din șablon, cu datele de acum. Prețurile și celelalte modificări făcute de mână în ea se pierd.',
    confirm: 'Generează din nou',
    destructive: false,
  },
  issue: {
    title: 'Emiți contractul?',
    text: 'Un contract emis nu se mai modifică; o corectură este o ciornă nouă, care îl înlocuiește la emitere. La emitere se face și PDF-ul, ceea ce poate dura câteva secunde.',
    confirm: 'Emite',
    destructive: false,
  },
  issueUnfilled: {
    title: 'Contractul mai are text de completat',
    text: `În fișier scrie încă „${unfilledMark}”, de obicei acolo unde vin prețurile. Deschide contractul și înlocuiește textul, apoi emite-l. Dacă îl emiți așa, nu mai poate fi modificat decât printr-o ciornă nouă.`,
    confirm: 'Emite oricum',
    destructive: false,
  },
  delete: {
    title: 'Ștergi ciorna?',
    text: 'Ciorna și fișierul ei se șterg definitiv. Un contract emis rămâne neschimbat.',
    confirm: 'Șterge ciorna',
    destructive: true,
  },
} as const;

// Rendered for owners only, as the API answers only them. `editor` is where the contract
// opens: under the lead or under the client. `readOnly` is an archived company.
export function ServiceContractCard({
  client,
  userId,
  readOnly,
  editor,
}: {
  client: Client;
  userId: string;
  readOnly: boolean;
  editor: (children: ReactNode, testId: string) => ReactNode;
}) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const queryKey = [...getGetServiceContractQueryKey(client.id), userId];
  const contract = useGetServiceContract(client.id, { request: apiRequest, query: { queryKey } });

  return (
    <Card data-testid="service-contract-card">
      <CardHeader>
        <h2 className="text-lg font-semibold">Contract de prestări servicii</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Generat dintr-un model pe care îl poți adapta în editor. Aplicația reține numărul, datele
          și serviciile; prețurile le scrii în contract, acolo unde contează. Îl văd doar
          administratorii organizației.
        </p>
      </CardHeader>
      <CardContent>
        {contract.isPending ? (
          <Skeleton className="h-64 w-full" />
        ) : contract.isError ? (
          <Notice
            variant="destructive"
            action={
              <Button
                variant="outline"
                disabled={contract.isFetching}
                onClick={() => void contract.refetch()}
              >
                Încearcă din nou
              </Button>
            }
          >
            Nu am putut încărca contractul.
          </Notice>
        ) : (
          // Keyed by what is saved, so the form starts again from what the server holds.
          <ServiceContractBody
            key={JSON.stringify([contract.data.contract, contract.data.clientRepresentative])}
            client={client}
            saved={contract.data}
            queryKey={queryKey}
            readOnly={readOnly}
            editor={editor}
          />
        )}
      </CardContent>
    </Card>
  );
}

function ServiceContractBody({
  client,
  saved,
  queryKey,
  readOnly,
  editor,
}: {
  client: Client;
  saved: ServiceContractResponse;
  queryKey: readonly unknown[];
  readOnly: boolean;
  editor: (children: ReactNode, testId: string) => ReactNode;
}) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const save = useSaveServiceContract({ request: apiRequest });
  const generate = useGenerateServiceContract({ request: apiRequest });
  const issue = useIssueDocument({ request: apiRequest });
  const remove = useDeleteDocumentDraft({ request: apiRequest });
  const [confirming, setConfirming] = useState<Confirming>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<ServiceContractFormValues>({
    resolver: zodResolver(serviceContractFormSchema),
    defaultValues: toServiceContractForm(saved, todayIso()),
  });
  const { errors, isDirty } = form.formState;
  const busy = save.isPending || generate.isPending || issue.isPending || remove.isPending;
  const locked = busy || readOnly;
  const { document, readiness } = saved;
  const missing = groupMissing(readiness.missing);
  // The details count as saved only once they are: a suggested number is still a suggestion.
  const unsaved = isDirty || saved.contract === null;

  async function refresh(response?: ServiceContractResponse) {
    if (response) queryClient.setQueryData(queryKey, response);
    else await queryClient.invalidateQueries({ queryKey });
    // The list of leads says where each contract stands.
    await queryClient.invalidateQueries({ queryKey: getListClientsQueryKey() });
  }

  const onSubmit = form.handleSubmit(async (values) => {
    setError(null);
    try {
      await refresh(
        await save.mutateAsync({ clientId: client.id, data: toServiceContractRequest(values) })
      );
      toast.success('Detaliile contractului au fost salvate.');
    } catch (cause) {
      const body = cause instanceof ApiHttpError ? (cause.body as Partial<ApiErrorResponse>) : null;
      if (body?.reason === 'contract_number_taken') {
        form.setError('contractNumber', {
          message: 'Alt contract din același an are acest număr.',
        });
        return;
      }
      setError(
        body?.reason === 'client_archived'
          ? 'Firma este arhivată; contractul ei nu mai poate fi modificat.'
          : 'Nu am putut salva detaliile contractului. Verifică conexiunea și încearcă din nou.'
      );
    }
  });

  async function run(action: NonNullable<Confirming> | 'generate') {
    setError(null);
    try {
      if (action === 'generate' || action === 'regenerate') {
        await refresh(await generate.mutateAsync({ clientId: client.id }));
        toast.success(
          action === 'generate'
            ? 'Contractul a fost generat.'
            : 'Contractul a fost generat din nou.'
        );
      } else if (action === 'delete') {
        await remove.mutateAsync({ documentId: document!.id });
        await refresh();
        toast.success('Ciorna contractului a fost ștearsă.');
      } else {
        await issue.mutateAsync({
          documentId: document!.id,
          data: { acceptUnfilled: action === 'issueUnfilled' },
        });
        await refresh();
        toast.success('Contractul a fost emis.');
      }
    } catch (cause) {
      const body = cause instanceof ApiHttpError ? (cause.body as Partial<ApiErrorResponse>) : null;
      if (body?.reason === 'unfilled_text') {
        // Not a failure: the same dialog asks its second question.
        setConfirming('issueUnfilled');
        return;
      }
      setError(
        body?.reason === 'pdf_unavailable'
          ? 'Nu am putut face PDF-ul, așa că contractul nu a fost emis. Încearcă din nou peste câteva momente.'
          : body?.reason === 'missing_contract_data'
            ? 'Lipsesc date pe care contractul le tipărește. Lista de mai jos spune care.'
            : body?.reason === 'template_missing'
              ? 'Modelul de contract nu este încă instalat în acest mediu.'
              : 'Operațiunea nu a reușit. Verifică conexiunea și încearcă din nou.'
      );
      await refresh();
    }
    setConfirming(null);
  }

  async function download(revisionId: string, format: 'docx' | 'pdf') {
    setError(null);
    try {
      const link = await getDocumentDownload(document!.id, revisionId, { format }, apiRequest);
      // Saved from a blob, so the file keeps its name with diacritics: a browser ignores
      // `download` on a link to another origin.
      const response = await fetch(link.url);
      if (!response.ok) throw new Error(`Download failed (${response.status}).`);
      const objectUrl = URL.createObjectURL(await response.blob());
      const anchor = window.document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = link.fileName;
      anchor.click();
      URL.revokeObjectURL(objectUrl);
    } catch {
      setError('Nu am putut descărca fișierul. Verifică conexiunea și încearcă din nou.');
    }
  }

  const text = (
    name:
      'contractNumber' | 'durationMonths' | 'clientRepresentativeName' | 'clientRepresentativeRole',
    label: string,
    options: { hint?: string; inputMode?: 'numeric'; mark?: 'required' } = {}
  ) => {
    const id = `contract-${name}`;
    return (
      <Field id={id} label={label} mark={options.mark} hint={options.hint} error={errors[name]}>
        <Input
          id={id}
          data-testid={id}
          inputMode={options.inputMode}
          autoComplete="off"
          disabled={locked}
          aria-invalid={Boolean(errors[name])}
          aria-describedby={errors[name] ? `${id}-error` : options.hint ? `${id}-hint` : undefined}
          {...form.register(name)}
        />
      </Field>
    );
  };
  const date = (name: 'contractDate' | 'startDate', label: string) => (
    <Field id={`contract-${name}`} label={label} mark="required" error={errors[name]}>
      <Controller
        control={form.control}
        name={name}
        render={({ field }) => (
          <DatePicker
            id={`contract-${name}`}
            testId={`contract-${name}`}
            value={field.value}
            onChange={field.onChange}
            onBlur={field.onBlur}
            disabled={locked}
            invalid={Boolean(errors[name])}
            required
          />
        )}
      />
    </Field>
  );
  const checkbox = (
    name: 'renewsAutomatically' | 'coversOccupationalSafety' | 'coversFireSafety',
    label: string
  ) => (
    <div className="flex items-center gap-3">
      <Controller
        control={form.control}
        name={name}
        render={({ field }) => (
          <Checkbox
            id={`contract-${name}`}
            data-testid={`contract-${name}`}
            checked={field.value}
            disabled={locked}
            onCheckedChange={(checked) => field.onChange(checked === true)}
            onBlur={field.onBlur}
          />
        )}
      />
      <Label htmlFor={`contract-${name}`}>{label}</Label>
    </div>
  );

  return (
    <div className="grid gap-6">
      <form
        data-testid="service-contract-form"
        onSubmit={(event) => void onSubmit(event)}
        aria-busy={busy}
        noValidate
        className="grid gap-5 sm:grid-cols-2"
      >
        {text('contractNumber', 'Numărul contractului', {
          mark: 'required',
          inputMode: 'numeric',
          hint:
            saved.contract === null && saved.suggestedNumber !== null
              ? 'Propus după ultimul contract din acest an; îl poți schimba.'
              : 'Din registrul tău de contracte. Un număr se folosește o singură dată pe an.',
        })}
        {date('contractDate', 'Data contractului')}
        {date('startDate', 'Începe la')}
        {text('durationMonths', 'Durata, în luni', { mark: 'required', inputMode: 'numeric' })}
        <div className="grid gap-3 sm:col-span-2">
          {checkbox('renewsAutomatically', 'Se prelungește automat, pe aceeași durată')}
          {checkbox('coversOccupationalSafety', 'Cuprinde securitatea și sănătatea în muncă (SSM)')}
          {checkbox('coversFireSafety', 'Cuprinde apărarea împotriva incendiilor (PSI)')}
          {errors.coversOccupationalSafety && (
            <p role="alert" className="text-sm text-destructive">
              {errors.coversOccupationalSafety.message}
            </p>
          )}
        </div>
        <h3 className="mt-2 text-sm font-semibold sm:col-span-2">Cine semnează pentru client</h3>
        {text('clientRepresentativeName', 'Reprezentant legal', {
          hint: 'Numele și prenumele, așa cum apar în contract.',
        })}
        {text('clientRepresentativeRole', 'Funcția', { hint: 'De exemplu „Administrator”.' })}
        {saved.contract && (
          <p data-testid="contract-end" className="text-sm text-muted-foreground sm:col-span-2">
            Prima perioadă se încheie la {formatRoDate(saved.contract.endDate)}.
          </p>
        )}
        {!readOnly && (
          <div className="sm:col-span-2">
            <Button
              type="submit"
              variant={saved.contract ? 'outline' : 'default'}
              data-testid="contract-save"
              disabled={busy || (!isDirty && saved.contract !== null)}
            >
              {save.isPending ? 'Se salvează…' : 'Salvează detaliile'}
            </Button>
          </div>
        )}
      </form>

      {!readOnly && readiness.missing.length > 0 && saved.contract !== null && (
        <Notice
          variant="warning"
          data-testid="contract-missing"
          title="Contractul nu poate fi generat încă"
        >
          <ul className="mt-1 grid gap-1">
            {missing.organization.length > 0 && (
              <li>
                Despre organizația ta:{' '}
                {missing.organization.map((name) => missingLabels[name]).join(', ')}. Le completezi
                în{' '}
                <Link to="/organization" className="font-medium underline underline-offset-4">
                  Organizație
                </Link>
                .
              </li>
            )}
            {missing.company.length > 0 && (
              <li>
                Despre {client.legalName}:{' '}
                {missing.company.map((name) => missingLabels[name]).join(', ')}. Le completezi cu{' '}
                {client.stage === 'lead' ? (
                  <Link
                    to="/leads/$leadId/edit"
                    params={{ leadId: client.id }}
                    className="font-medium underline underline-offset-4"
                  >
                    Modifică
                  </Link>
                ) : (
                  <Link
                    to="/clients/$clientId/edit"
                    params={{ clientId: client.id }}
                    className="font-medium underline underline-offset-4"
                  >
                    Modifică
                  </Link>
                )}
                .
              </li>
            )}
            {missing.form.length > 0 && (
              <li>
                În formularul de mai sus:{' '}
                {missing.form.map((name) => missingLabels[name]).join(', ')}.
              </li>
            )}
          </ul>
        </Notice>
      )}

      {error && (
        <Notice variant="destructive" data-testid="contract-error">
          {error}
        </Notice>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t pt-5">
        <FileText className="size-5 text-muted-foreground" aria-hidden="true" />
        {document ? (
          <>
            <span className="flex flex-wrap gap-1.5">
              {document.issued && (
                <Badge data-testid="contract-issued">Emis · rev. {document.issued.revision}</Badge>
              )}
              {saved.lastSend && (
                <Badge variant="outline" data-testid="contract-sent">
                  Trimis
                </Badge>
              )}
              {document.draft && (
                <Badge variant="secondary" data-testid="contract-draft">
                  Ciornă · rev. {document.draft.revision}
                </Badge>
              )}
              {document.draft?.editedAt && (
                <Badge variant="outline" data-testid="contract-edited">
                  Modificat
                </Badge>
              )}
              {saved.draftOutdated && (
                <Badge
                  variant="outline"
                  data-testid="contract-outdated"
                  title="Detaliile sau datele s-au schimbat de când a fost generată ciorna. Generează contractul din nou ca să le preia, sau corectează-l în editor."
                >
                  Date modificate
                </Badge>
              )}
            </span>
            <span className="ml-auto flex flex-wrap gap-2">
              {editor(
                document.draft && !readOnly ? 'Deschide și modifică' : 'Deschide',
                'contract-open'
              )}
              {document.issued?.hasPdf && (
                <Button
                  variant="outline"
                  size="sm"
                  data-testid="contract-download-pdf"
                  onClick={() => void download(document.issued!.id, 'pdf')}
                >
                  <Download aria-hidden="true" />
                  PDF
                </Button>
              )}
              <Button
                variant="outline"
                size="sm"
                data-testid="contract-download"
                onClick={() => void download((document.draft ?? document.issued)!.id, 'docx')}
              >
                <Download aria-hidden="true" />
                Word
              </Button>
              {!readOnly && document.issued && (
                <Button
                  variant={document.draft ? 'outline' : 'default'}
                  size="sm"
                  data-testid="contract-send"
                  disabled={busy || !document.issued.hasPdf}
                  title={
                    document.issued.hasPdf
                      ? undefined
                      : 'Contractul emis nu are PDF. Descarcă-l și trimite-l din emailul tău.'
                  }
                  onClick={() => setSending(true)}
                >
                  <Send aria-hidden="true" />
                  {saved.lastSend ? 'Trimite din nou…' : 'Trimite prin email…'}
                </Button>
              )}
              {!readOnly && document.draft && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    data-testid="contract-delete-draft"
                    disabled={busy}
                    onClick={() => setConfirming('delete')}
                  >
                    Șterge ciorna
                  </Button>
                  <Button
                    size="sm"
                    data-testid="contract-issue"
                    disabled={busy}
                    onClick={() => setConfirming('issue')}
                  >
                    Emite
                  </Button>
                </>
              )}
            </span>
          </>
        ) : (
          <span data-testid="contract-none" className="text-sm text-muted-foreground">
            Contractul nu a fost generat încă.
          </span>
        )}
        {!readOnly && (
          <Button
            variant={document ? 'ghost' : 'default'}
            size="sm"
            className={document ? '' : 'ml-auto'}
            data-testid="contract-generate"
            disabled={busy || unsaved || !readiness.ready}
            title={
              unsaved
                ? 'Salvează mai întâi detaliile contractului.'
                : readiness.ready
                  ? undefined
                  : 'Mai lipsesc date pe care contractul le tipărește.'
            }
            onClick={() => (document?.draft ? setConfirming('regenerate') : void run('generate'))}
          >
            <Sparkles aria-hidden="true" />
            {generate.isPending
              ? 'Se generează…'
              : document
                ? 'Generează din nou'
                : 'Generează contractul'}
          </Button>
        )}
      </div>

      {saved.lastSend && (
        <p data-testid="contract-last-send" className="-mt-2 text-sm text-muted-foreground">
          Revizia {saved.lastSend.revision} a fost trimisă la {saved.lastSend.sentTo} pe{' '}
          {formatRoDate(saved.lastSend.sentAt.slice(0, 10))}.
        </p>
      )}
      {document?.issued && (
        <SendContractDialog
          clientId={client.id}
          clientName={client.legalName}
          contactEmail={client.contactEmail}
          revision={document.issued.revision}
          open={sending}
          onClose={() => setSending(false)}
          onSent={refresh}
        />
      )}

      <Dialog
        open={confirming !== null}
        onOpenChange={(open) => !open && !busy && setConfirming(null)}
      >
        {confirming && (
          <DialogContent data-testid="contract-confirm-dialog" className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{confirmations[confirming].title}</DialogTitle>
              <DialogDescription>{confirmations[confirming].text}</DialogDescription>
            </DialogHeader>
            <DialogFooter className="mt-2">
              <Button variant="ghost" disabled={busy} onClick={() => setConfirming(null)}>
                Renunță
              </Button>
              <Button
                variant={confirmations[confirming].destructive ? 'destructive' : 'default'}
                data-testid="contract-confirm"
                disabled={busy}
                onClick={() => void run(confirming)}
              >
                {busy ? 'Un moment…' : confirmations[confirming].confirm}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
