import { useFileLink } from '@ssm-usor/api-http/file-link';
import { unfilledMark } from '@ssm-usor/contracts';
import { Badge } from '@ssm-usor/ui/components/badge';
import { Button } from '@ssm-usor/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@ssm-usor/ui/components/dropdown-menu';
import { useRouteContext } from '@tanstack/react-router';
import {
  Download,
  FilePen,
  FileSignature,
  FileText,
  MoreHorizontal,
  Printer,
  Send,
  Sparkles,
} from 'lucide-react';
import { type ReactNode, useRef, useState } from 'react';

import { getDocumentDownload, type ServiceContractResponse } from '@/api/generated/api';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { FileLinkButton } from '@/components/file-link-button';
import { FileMenuItem } from '@/components/file-menu-item';
import { Notice } from '@/components/notice';
import { SectionCard } from '@/components/section-card';
import type { Client } from '@/features/clients/client-form-schema';
import { formatRoDate } from '@/lib/dates';

import { ContractTrail, FileTile } from './contract-file-parts';
import { SendContractDialog } from './send-contract-dialog';
import type { ContractFileActions } from './use-contract-file-actions';

type ContractDocument = NonNullable<ServiceContractResponse['document']>;

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

// `busy` also counts a save of the details, which the generated file prints.
export function ContractFileSection({
  client,
  saved,
  document,
  title,
  readOnly,
  busy,
  unsaved,
  checking,
  error,
  missing,
  editor,
  actions,
  refresh,
}: {
  client: Client;
  saved: ServiceContractResponse;
  document: ContractDocument | null;
  title: string;
  readOnly: boolean;
  busy: boolean;
  unsaved: boolean;
  checking: boolean;
  error: string | null;
  missing: ReactNode;
  editor: (children: ReactNode, testId: string) => ReactNode;
  actions: ContractFileActions;
  refresh: () => Promise<void>;
}) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const {
    generating,
    attaching,
    confirmingSigned,
    printing,
    confirming,
    setConfirming,
    run,
    attachSignedCopy,
    confirmSignedCopy,
    printRevision,
  } = actions;
  const signedInput = useRef<HTMLInputElement>(null);
  const [sending, setSending] = useState(false);
  const fileOf = (revisionId: string, format: 'docx' | 'pdf' | 'signed') => ({
    queryKey: ['document-file', document?.id, revisionId, format],
    load: (signal: AbortSignal) =>
      getDocumentDownload(document!.id, revisionId, { format }, { ...apiRequest, signal }),
  });
  const signedCopy = useFileLink({
    ...fileOf(document?.issued?.id ?? '', 'signed'),
    enabled: Boolean(document?.issued?.hasSignedCopy || document?.issued?.receivedCopy),
    apiRequest,
    disposition: 'inline',
  });
  const generateBlocked = unsaved
    ? 'Salvează mai întâi detaliile contractului.'
    : checking
      ? 'Verificăm dacă datele sunt complete…'
      : saved.readiness.ready
        ? undefined
        : 'Mai lipsesc date pe care contractul le tipărește.';

  return (
    <>
      <SectionCard
        data-testid="contract-document-card"
        title="Contractul"
        description={
          <span data-testid={document ? 'contract-state' : 'contract-none'}>
            {!document
              ? readOnly
                ? 'Contractul nu a fost generat.'
                : 'Contractul nu a fost generat încă. Salvează detaliile, apoi generează-l: îl primești ca ciornă, pe care o adaptezi în editor.'
              : document.draft
                ? document.issued
                  ? `Revizia ${document.issued.revision} este în vigoare. Ciorna o înlocuiește abia când o emiți.`
                  : 'Ciorna este a ta: deschide-o, scrie prețurile și adapteaz-o, apoi emite contractul.'
                : `Revizia ${document.issued!.revision} este emisă și nu se mai modifică; o corectură este o ciornă nouă.`}
          </span>
        }
      >
        {!readOnly && (!document || document.draft) && (
          <Notice
            variant="info"
            data-testid="contract-prices-notice"
            title="Prețurile le scrii tu, în contract"
          >
            Prețurile se completează direct în ciornă. Folosește „Locuri de completat” în editor ca
            să găsești fiecare marcaj „{unfilledMark}”. Te avertizăm înainte de emitere dacă au
            rămas marcaje.
          </Notice>
        )}

        {missing}
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
            received={document.issued.receivedCopy?.uploadedAt ?? null}
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
                  <FileMenuItem
                    testId="contract-open-pdf"
                    apiRequest={apiRequest}
                    disposition="inline"
                    {...fileOf(document.issued.id, 'pdf')}
                  >
                    <FileText aria-hidden="true" />
                    Deschide PDF
                  </FileMenuItem>
                )}
                <FileMenuItem
                  testId="contract-download-issued"
                  apiRequest={apiRequest}
                  disposition="attachment"
                  {...fileOf(document.issued.id, 'docx')}
                >
                  <Download aria-hidden="true" />
                  Descarcă Word
                </FileMenuItem>
                <DropdownMenuItem
                  data-testid="contract-print-issued"
                  disabled={printing}
                  onSelect={() => void printRevision(document.issued!)}
                >
                  <Printer aria-hidden="true" />
                  Tipărește
                </DropdownMenuItem>
                {!readOnly && !document.draft && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      data-testid="contract-generate"
                      disabled={busy || unsaved || checking || !saved.readiness.ready}
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
                <FileMenuItem
                  testId="contract-download"
                  apiRequest={apiRequest}
                  disposition="attachment"
                  {...fileOf(document.draft.id, 'docx')}
                >
                  <Download aria-hidden="true" />
                  Descarcă Word
                </FileMenuItem>
                <DropdownMenuItem
                  data-testid="contract-print-draft"
                  disabled={printing}
                  onSelect={() => void printRevision(document.draft!)}
                >
                  <Printer aria-hidden="true" />
                  Tipărește
                </DropdownMenuItem>
                {!readOnly && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      data-testid="contract-generate"
                      disabled={busy || unsaved || checking || !saved.readiness.ready}
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
            placeholder={!document.issued.hasSignedCopy && !document.issued.receivedCopy}
            badge={
              document.issued.receivedCopy && (
                <Badge
                  variant="outline"
                  className="border-warning-border bg-warning text-warning-foreground"
                  data-testid="contract-received"
                >
                  De confirmat
                </Badge>
              )
            }
            meta={
              document.issued.hasSignedCopy
                ? `Exemplarul semnat este atașat reviziei ${document.issued.revision}.`
                : document.issued.receivedCopy
                  ? `Primit de la client prin linkul din email, pe ${formatRoDate(document.issued.receivedCopy.uploadedAt.slice(0, 10))}. Deschide-l și confirmă-l: până atunci contractul nu este socotit semnat.`
                  : 'Când contractul se întoarce semnat, atașează aici exemplarul, scanat sau semnat electronic.'
            }
          >
            {document.issued.hasSignedCopy || document.issued.receivedCopy ? (
              <>
                <FileLinkButton
                  variant="secondary"
                  size="sm"
                  data-testid="contract-signed-open"
                  link={signedCopy}
                >
                  <FileText aria-hidden="true" />
                  Deschide
                </FileLinkButton>
                {!readOnly && document.issued.receivedCopy && (
                  <Button
                    size="sm"
                    data-testid="contract-signed-confirm"
                    disabled={busy}
                    onClick={() => void confirmSignedCopy()}
                  >
                    {confirmingSigned ? 'Se confirmă…' : 'Confirmă exemplarul'}
                  </Button>
                )}
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
                  variant="secondary"
                  size="sm"
                  data-testid="contract-signed-attach"
                  disabled={busy}
                  onClick={() => signedInput.current?.click()}
                >
                  {attaching ? 'Se atașează…' : 'Atașează exemplarul semnat'}
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
              disabled={busy || unsaved || checking || !saved.readiness.ready}
              title={generateBlocked}
              onClick={() => void run('generate')}
            >
              <Sparkles aria-hidden="true" />
              {generating ? 'Se generează…' : 'Generează contractul'}
            </Button>
          </div>
        )}
      </SectionCard>

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

      {confirming && (
        <ConfirmDialog
          open
          busy={busy}
          testId="contract"
          title={confirmations[confirming].title}
          confirmLabel={confirmations[confirming].confirm}
          pendingLabel="Un moment…"
          destructive={confirmations[confirming].destructive}
          onConfirm={() => run(confirming)}
          onClose={() => setConfirming(null)}
        >
          {confirmations[confirming].text}
        </ConfirmDialog>
      )}
    </>
  );
}
