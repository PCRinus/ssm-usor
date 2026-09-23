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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@ssm-usor/ui/components/dropdown-menu';
import { Input } from '@ssm-usor/ui/components/input';
import { Label } from '@ssm-usor/ui/components/label';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import { toast } from '@ssm-usor/ui/lib/toast';
import { Link, useRouteContext } from '@tanstack/react-router';
import {
  Download,
  FilePen,
  FileSignature,
  FileText,
  MoreHorizontal,
  Pencil,
  Send,
  Sparkles,
} from 'lucide-react';
import { type ReactNode, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';

import {
  type ApiErrorResponse,
  getDocumentDownload,
  getGetServiceContractQueryKey,
  getListClientsQueryKey,
  type ServiceContractResponse,
  useAttachDocumentSignedCopy,
  useDeleteDocumentDraft,
  useGenerateServiceContract,
  useGetServiceContract,
  useIssueDocument,
  useRemoveDocumentSignedCopy,
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

type Confirming = 'regenerate' | 'issue' | 'issueUnfilled' | 'delete' | 'removeSigned' | null;

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
    text: `În fișier scrie încă „${unfilledMark}”, de obicei acolo unde vin prețurile. Deschide contractul: butonul „locuri de completat” din bara editorului te duce la fiecare. Dacă îl emiți așa, nu mai poate fi modificat decât printr-o ciornă nouă.`,
    confirm: 'Emite oricum',
    destructive: false,
  },
  removeSigned: {
    title: 'Elimini exemplarul semnat?',
    text: 'Fișierul atașat se șterge definitiv. Contractul emis rămâne neschimbat și poți atașa alt exemplar oricând.',
    confirm: 'Elimină exemplarul',
    destructive: true,
  },
  delete: {
    title: 'Ștergi ciorna?',
    text: 'Ciorna și fișierul ei se șterg definitiv. Un contract emis rămâne neschimbat.',
    confirm: 'Șterge ciorna',
    destructive: true,
  },
} as const;

function FileTile({
  testId,
  icon,
  title,
  badge,
  meta,
  placeholder = false,
  children,
}: {
  testId: string;
  icon: ReactNode;
  title: string;
  badge?: ReactNode;
  meta: string;
  /** The place where a file is expected, before there is one. */
  placeholder?: boolean;
  children: ReactNode;
}) {
  return (
    <div
      data-testid={testId}
      className={`flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border p-3 pl-4 ${
        placeholder ? 'border-dashed' : 'bg-background'
      }`}
    >
      <div
        className={`flex size-10 shrink-0 items-center justify-center rounded-md [&_svg]:size-5 ${
          placeholder ? 'text-muted-foreground' : 'bg-muted text-foreground'
        }`}
      >
        {icon}
      </div>
      <div className="min-w-0 flex-1 basis-56">
        <div className="flex flex-wrap items-center gap-2">
          <span className={placeholder ? 'text-muted-foreground' : 'font-medium'}>{title}</span>
          {badge}
        </div>
        <p className="text-sm text-muted-foreground">{meta}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

// Where the issued revision stands, in the order things happen to it.
function ContractTrail({
  issuedAt,
  lastSend,
  signed,
}: {
  issuedAt: string;
  lastSend: ServiceContractResponse['lastSend'];
  signed: boolean;
}) {
  const steps = [
    {
      label: 'Emis',
      done: true,
      detail: `pe ${formatRoDate(issuedAt.slice(0, 10))}`,
    },
    {
      label: 'Trimis',
      done: lastSend !== null,
      testId: 'contract-sent',
      detail: lastSend ? (
        <span data-testid="contract-last-send">
          Revizia {lastSend.revision} a fost trimisă la {lastSend.sentTo} pe{' '}
          {formatRoDate(lastSend.sentAt.slice(0, 10))}.
        </span>
      ) : (
        'prin email, cu PDF-ul atașat'
      ),
    },
    {
      label: 'Semnat',
      done: signed,
      testId: 'contract-signed',
      detail: signed ? 'exemplarul semnat este atașat' : 'când se întoarce exemplarul semnat',
    },
  ];
  const next = steps.findIndex((step) => !step.done);
  // Side by side, the dots sit at the start, the middle and the end of one track, and the
  // track is coloured as far as the last step reached. Stacked, each step draws the piece of
  // track down to the next one.
  const reached = ['sm:w-0', 'sm:w-1/2', 'sm:w-full'][steps.filter((step) => step.done).length - 1];
  const align = ['', 'sm:text-center', 'sm:text-right'];
  const place = ['', 'sm:mx-auto', 'sm:ml-auto'];

  return (
    <ol data-testid="contract-trail" className="relative grid gap-4 sm:grid-cols-3 sm:gap-0">
      <span
        aria-hidden="true"
        className="absolute top-[5px] right-1.5 left-1.5 hidden h-0.5 rounded-full bg-muted-foreground/35 sm:block"
      />
      <span
        aria-hidden="true"
        className={`absolute top-[5px] left-1.5 hidden h-0.5 rounded-full bg-primary sm:block ${reached}`}
      />
      {steps.map((step, index) => {
        const current = index === next;
        return (
          <li key={step.label} className={`relative flex gap-3 sm:block ${align[index]}`}>
            {index < steps.length - 1 && (
              <span
                aria-hidden="true"
                className={`absolute top-4 -bottom-5 left-[5px] w-0.5 rounded-full sm:hidden ${
                  steps[index + 1]!.done ? 'bg-primary' : 'bg-muted-foreground/35'
                }`}
              />
            )}
            <span className={`relative mt-1 flex size-3 shrink-0 sm:mt-0 ${place[index]}`}>
              {current && (
                <span
                  aria-hidden="true"
                  className="absolute -inset-1 animate-ping rounded-full bg-primary/30 [animation-duration:2.4s] motion-reduce:animate-none"
                />
              )}
              <span
                aria-hidden="true"
                className={`absolute inset-0 rounded-full ${
                  step.done
                    ? 'bg-primary'
                    : current
                      ? 'bg-background ring-2 ring-primary ring-inset'
                      : 'bg-background ring-2 ring-muted-foreground/40 ring-inset'
                }`}
              />
            </span>
            <div className="text-sm sm:mt-2">
              <p
                data-testid={step.done ? step.testId : undefined}
                className={step.done || current ? 'font-medium' : 'text-muted-foreground'}
              >
                {step.label}
              </p>
              <p className="text-muted-foreground">{step.detail}</p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

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
    <section data-testid="service-contract-card" className="grid gap-4">
      <h2 className="text-lg font-semibold">Contract de prestări servicii</h2>
      {contract.isPending ? (
        <Skeleton className="h-64 w-full rounded-xl" />
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
    </section>
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
  const attachSigned = useAttachDocumentSignedCopy({ request: apiRequest });
  const removeSigned = useRemoveDocumentSignedCopy({ request: apiRequest });
  const signedInput = useRef<HTMLInputElement>(null);
  const [confirming, setConfirming] = useState<Confirming>(null);
  const [sending, setSending] = useState(false);
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const form = useForm<ServiceContractFormValues>({
    resolver: zodResolver(serviceContractFormSchema),
    defaultValues: toServiceContractForm(saved, todayIso()),
  });
  const { errors, isDirty } = form.formState;
  const busy =
    save.isPending ||
    generate.isPending ||
    issue.isPending ||
    remove.isPending ||
    attachSigned.isPending ||
    removeSigned.isPending;
  const locked = busy || readOnly;
  const { readiness } = saved;
  // The types allow a contract with neither revision, and one took the whole page down.
  const document = saved.document?.draft || saved.document?.issued ? saved.document : null;
  const missing = groupMissing(readiness.missing);
  // The details count as saved only once they are: a suggested number is still a suggestion.
  const unsaved = isDirty || saved.contract === null;
  const summarized = saved.contract !== null && !editing;
  const title = saved.contract
    ? `Contract nr. ${saved.contract.contractNumber} din ${formatRoDate(saved.contract.contractDate)}`
    : (document?.title ?? 'Contractul');
  const generateBlocked = unsaved
    ? 'Salvează mai întâi detaliile contractului.'
    : readiness.ready
      ? undefined
      : 'Mai lipsesc date pe care contractul le tipărește.';

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
      } else if (action === 'removeSigned') {
        await removeSigned.mutateAsync({ documentId: document!.id });
        await refresh();
        toast.success('Exemplarul semnat a fost eliminat.');
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

  async function attachSignedCopy(file: File | undefined) {
    if (!file) return;
    setError(null);
    try {
      await attachSigned.mutateAsync({ documentId: document!.id, data: file });
      await refresh();
      toast.success('Exemplarul semnat a fost atașat.');
    } catch (cause) {
      setError(
        cause instanceof ApiHttpError && cause.status === 400
          ? 'Exemplarul semnat trebuie să fie un PDF de cel mult 15 MB. Dacă ai o fotografie a contractului, salveaz-o ca PDF.'
          : 'Nu am putut atașa exemplarul semnat. Verifică conexiunea și încearcă din nou.'
      );
      await refresh();
    }
  }

  async function download(revisionId: string, format: 'docx' | 'pdf' | 'signed') {
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
      <Card data-testid="contract-details-card" className="gap-3">
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
          <h3 className="font-semibold">Detaliile contractului</h3>
          {summarized && !readOnly && (
            <Button
              variant="outline"
              size="sm"
              data-testid="contract-details-edit"
              disabled={busy}
              onClick={() => setEditing(true)}
            >
              <Pencil aria-hidden="true" />
              Modifică
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {summarized && saved.contract ? (
            <dl
              data-testid="contract-details-summary"
              className="grid gap-x-10 gap-y-4 text-sm sm:grid-cols-2"
            >
              <div>
                <dt className="text-muted-foreground">Număr și dată</dt>
                <dd className="mt-0.5 font-medium">
                  Nr. {saved.contract.contractNumber} din{' '}
                  {formatRoDate(saved.contract.contractDate)}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Servicii</dt>
                <dd className="mt-0.5 font-medium">
                  {[
                    saved.contract.coversOccupationalSafety && 'SSM',
                    saved.contract.coversFireSafety && 'PSI',
                  ]
                    .filter(Boolean)
                    .join(' și ')}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Perioada</dt>
                <dd className="mt-0.5 font-medium" data-testid="contract-end">
                  {formatRoDate(saved.contract.startDate)} – {formatRoDate(saved.contract.endDate)}
                  <span className="font-normal text-muted-foreground">
                    {' '}
                    · {saved.contract.durationMonths}{' '}
                    {saved.contract.durationMonths === 1 ? 'lună' : 'luni'},{' '}
                    {saved.contract.renewsAutomatically
                      ? 'se prelungește automat'
                      : 'fără prelungire automată'}
                  </span>
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Semnează pentru client</dt>
                <dd className="mt-0.5 font-medium">
                  {saved.clientRepresentative.name ?? '—'}
                  {saved.clientRepresentative.role && (
                    <span className="font-normal text-muted-foreground">
                      , {saved.clientRepresentative.role}
                    </span>
                  )}
                </dd>
              </div>
            </dl>
          ) : (
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
              {text('durationMonths', 'Durata, în luni', {
                mark: 'required',
                inputMode: 'numeric',
              })}
              <div className="grid gap-3 sm:col-span-2">
                {checkbox('renewsAutomatically', 'Se prelungește automat, pe aceeași durată')}
                {checkbox(
                  'coversOccupationalSafety',
                  'Cuprinde securitatea și sănătatea în muncă (SSM)'
                )}
                {checkbox('coversFireSafety', 'Cuprinde apărarea împotriva incendiilor (PSI)')}
                {errors.coversOccupationalSafety && (
                  <p role="alert" className="text-sm text-destructive">
                    {errors.coversOccupationalSafety.message}
                  </p>
                )}
              </div>
              <h3 className="mt-2 text-sm font-semibold sm:col-span-2">
                Cine semnează pentru client
              </h3>
              {text('clientRepresentativeName', 'Reprezentant legal', {
                hint: 'Numele și prenumele, așa cum apar în contract.',
              })}
              {text('clientRepresentativeRole', 'Funcția', { hint: 'De exemplu „Administrator”.' })}
              {saved.contract && (
                <p
                  data-testid="contract-end"
                  className="text-sm text-muted-foreground sm:col-span-2"
                >
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
                  {saved.contract && (
                    <Button
                      type="button"
                      variant="ghost"
                      className="ml-2"
                      data-testid="contract-details-cancel"
                      disabled={busy}
                      onClick={() => {
                        form.reset();
                        setEditing(false);
                      }}
                    >
                      Renunță
                    </Button>
                  )}
                </div>
              )}
            </form>
          )}
        </CardContent>
      </Card>

      <Card data-testid="contract-document-card">
        <CardHeader>
          <h3 className="flex items-center gap-2 font-semibold">
            <FileText className="size-4 text-muted-foreground" aria-hidden="true" />
            Contractul
          </h3>
          <p
            data-testid={document ? 'contract-state' : 'contract-none'}
            className="max-w-2xl text-sm text-muted-foreground"
          >
            {!document
              ? 'Contractul nu a fost generat încă. Salvează detaliile, apoi generează-l: îl primești ca ciornă, pe care o adaptezi în editor.'
              : document.draft
                ? document.issued
                  ? `Revizia ${document.issued.revision} este în vigoare. Ciorna o înlocuiește abia când o emiți.`
                  : 'Ciorna este a ta: deschide-o, scrie prețurile și adapteaz-o, apoi emite contractul.'
                : `Revizia ${document.issued!.revision} este emisă și nu se mai modifică; o corectură este o ciornă nouă.`}
          </p>
        </CardHeader>
        <CardContent className="grid gap-5">
          {!readOnly && (!document || document.draft) && (
            <Notice
              variant="info"
              data-testid="contract-prices-notice"
              title="Prețurile le scrii tu, în contract"
            >
              Prețurile se completează direct în ciornă. Folosește „Locuri de completat” în editor
              ca să găsești fiecare marcaj „{unfilledMark}”. Te avertizăm înainte de emitere dacă au
              rămas marcaje.
            </Notice>
          )}

          {!readOnly && readiness.missing.length > 0 && saved.contract !== null && (
            <Notice
              variant="warning"
              data-testid="contract-missing"
              title="Contractul nu poate fi generat încă"
            >
              <ul className="mt-1 grid gap-1">
                {missing.providerCompany.length > 0 && (
                  <li data-testid="contract-missing-company">
                    Despre organizația ta:{' '}
                    {missing.providerCompany.map((name) => missingLabels[name]).join(', ')}. Le
                    completezi în{' '}
                    <Link
                      to="/organization/company"
                      className="font-medium underline underline-offset-4"
                    >
                      Organizație, Date firmă
                    </Link>
                    .
                  </li>
                )}
                {missing.providerAuthorizations.length > 0 && (
                  <li data-testid="contract-missing-authorizations">
                    Despre abilitările organizației:{' '}
                    {missing.providerAuthorizations.map((name) => missingLabels[name]).join(', ')}.
                    Le completezi în{' '}
                    <Link
                      to="/organization/authorizations"
                      className="font-medium underline underline-offset-4"
                    >
                      Organizație, Abilitări
                    </Link>
                    .
                  </li>
                )}
                {missing.company.length > 0 && (
                  <li>
                    Despre {client.legalName}:{' '}
                    {missing.company.map((name) => missingLabels[name]).join(', ')}. Le completezi
                    cu{' '}
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
          {document?.issued && (
            <ContractTrail
              issuedAt={document.issued.issuedAt!}
              lastSend={saved.lastSend}
              signed={document.issued.hasSignedCopy}
            />
          )}
          {document?.issued && (
            <FileTile
              testId="contract-issued-tile"
              icon={<FileText aria-hidden="true" />}
              title={title}
              badge={
                <Badge data-testid="contract-issued">Emis · rev. {document.issued.revision}</Badge>
              }
              meta={`Revizia ${document.issued.revision}, emisă pe ${formatRoDate(document.issued.issuedAt!.slice(0, 10))}${document.draft ? '. O ciornă nouă o înlocuiește la emitere.' : '.'}`}
            >
              {!document.draft && editor('Deschide', 'contract-open')}
              {!readOnly && (
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
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    data-testid="contract-issued-actions"
                    aria-label="Alte acțiuni pentru contractul emis"
                  >
                    <MoreHorizontal aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {document.issued.hasPdf && (
                    <DropdownMenuItem
                      data-testid="contract-download-pdf"
                      onSelect={() => void download(document.issued!.id, 'pdf')}
                    >
                      <Download aria-hidden="true" />
                      Descarcă PDF
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    data-testid="contract-download-issued"
                    onSelect={() => void download(document.issued!.id, 'docx')}
                  >
                    <Download aria-hidden="true" />
                    Descarcă Word
                  </DropdownMenuItem>
                  {!readOnly && !document.draft && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        data-testid="contract-generate"
                        disabled={busy || unsaved || !readiness.ready}
                        title={generateBlocked}
                        onSelect={() => void run('generate')}
                      >
                        <Sparkles aria-hidden="true" />
                        Generează din nou
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </FileTile>
          )}
          {document?.draft && (
            <FileTile
              testId="contract-draft-tile"
              icon={<FilePen aria-hidden="true" />}
              title={title}
              badge={
                <>
                  <Badge variant="secondary" data-testid="contract-draft">
                    Ciornă · rev. {document.draft.revision}
                  </Badge>
                  {document.draft.editedAt && (
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
                </>
              }
              meta={
                document.draft.editedAt
                  ? `Ciornă modificată în editor pe ${formatRoDate(document.draft.editedAt.slice(0, 10))}.`
                  : `Ciornă generată din șablon pe ${formatRoDate(document.draft.createdAt.slice(0, 10))}.`
              }
            >
              {editor(readOnly ? 'Deschide' : 'Deschide și modifică', 'contract-open')}
              {!readOnly && (
                <Button
                  size="sm"
                  data-testid="contract-issue"
                  disabled={busy}
                  onClick={() => setConfirming('issue')}
                >
                  Emite
                </Button>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    data-testid="contract-draft-actions"
                    aria-label="Alte acțiuni pentru ciornă"
                  >
                    <MoreHorizontal aria-hidden="true" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem
                    data-testid="contract-download"
                    onSelect={() => void download(document.draft!.id, 'docx')}
                  >
                    <Download aria-hidden="true" />
                    Descarcă Word
                  </DropdownMenuItem>
                  {!readOnly && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        data-testid="contract-generate"
                        disabled={busy || unsaved || !readiness.ready}
                        title={generateBlocked}
                        onSelect={() => setConfirming('regenerate')}
                      >
                        <Sparkles aria-hidden="true" />
                        Generează din nou
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        variant="destructive"
                        data-testid="contract-delete-draft"
                        disabled={busy}
                        onSelect={() => setConfirming('delete')}
                      >
                        Șterge ciorna
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </FileTile>
          )}
          {document?.issued && (
            <FileTile
              testId="contract-signed-copy"
              icon={<FileSignature aria-hidden="true" />}
              title="Exemplarul semnat"
              placeholder={!document.issued.hasSignedCopy}
              meta={
                document.issued.hasSignedCopy
                  ? `Exemplarul semnat este atașat reviziei ${document.issued.revision}.`
                  : 'Când contractul se întoarce semnat, atașează aici exemplarul, scanat sau semnat electronic.'
              }
            >
              {document.issued.hasSignedCopy ? (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    data-testid="contract-signed-download"
                    onClick={() => void download(document.issued!.id, 'signed')}
                  >
                    <Download aria-hidden="true" />
                    Descarcă
                  </Button>
                  {!readOnly && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          data-testid="contract-signed-actions"
                          aria-label="Alte acțiuni pentru exemplarul semnat"
                        >
                          <MoreHorizontal aria-hidden="true" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          data-testid="contract-signed-replace"
                          disabled={busy}
                          onSelect={() => signedInput.current?.click()}
                        >
                          Înlocuiește
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          variant="destructive"
                          data-testid="contract-signed-remove"
                          disabled={busy}
                          onSelect={() => setConfirming('removeSigned')}
                        >
                          Elimină
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </>
              ) : (
                !readOnly && (
                  <Button
                    variant="outline"
                    size="sm"
                    data-testid="contract-signed-attach"
                    disabled={busy}
                    onClick={() => signedInput.current?.click()}
                  >
                    {attachSigned.isPending ? 'Se atașează…' : 'Atașează exemplarul semnat'}
                  </Button>
                )
              )}
              <input
                ref={signedInput}
                type="file"
                data-testid="contract-signed-input"
                className="hidden"
                accept=".pdf,application/pdf"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  // Emptied, so that choosing the same file again is still a change.
                  event.target.value = '';
                  void attachSignedCopy(file);
                }}
              />
            </FileTile>
          )}
          {!document && !readOnly && (
            <div className="flex justify-end">
              <Button
                data-testid="contract-generate"
                disabled={busy || unsaved || !readiness.ready}
                title={generateBlocked}
                onClick={() => void run('generate')}
              >
                <Sparkles aria-hidden="true" />
                {generate.isPending ? 'Se generează…' : 'Generează contractul'}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

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
