import {
  documentTypeKeys,
  isUploadedDocumentType,
  type PackDocumentTypeKey,
  packDocumentTypeKeys,
  unfilledMark,
  uploadedDocumentTypes,
} from '@ssm-usor/contracts';
import { Badge } from '@ssm-usor/ui/components/badge';
import { Button } from '@ssm-usor/ui/components/button';
import { Card, CardContent, CardHeader } from '@ssm-usor/ui/components/card';
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
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ssm-usor/ui/components/table';
import { toast } from '@ssm-usor/ui/lib/toast';
import { Link, useRouteContext } from '@tanstack/react-router';
import { FileText, MoreHorizontal, Sparkles, Upload } from 'lucide-react';
import { useRef, useState } from 'react';

import {
  type ApiErrorResponse,
  getDocumentDownload,
  getListClientDocumentsQueryKey,
  useDeleteDocumentDraft,
  useIssueDocument,
  useListClientDocuments,
  useRegenerateDocument,
  useUploadClientDocument,
} from '../api/generated/api';
import { ApiHttpError } from '../api/http';
import { formatRoDate } from '../lib/dates';
import type { ClientDocument } from './document-labels';
import { GenerateDocumentsDialog } from './generate-documents-dialog';

type Revision = NonNullable<ClientDocument['draft']>;
// A document, or the place of one that waits for a file.
type Row = { typeKey: string; title: string; document: ClientDocument | null };
type Confirming = {
  // `issueUnfilled` is the second question of issuing: the file still has text to fill in.
  action: 'regenerate' | 'issue' | 'issueUnfilled' | 'upload' | 'delete';
  document: ClientDocument;
} | null;

// What each confirmation says and does. Regenerating and deleting lose work; issuing locks it.
const confirmations = {
  regenerate: {
    title: 'Generezi documentul din nou?',
    confirm: 'Generează din nou',
    pending: 'Se generează…',
    destructive: false,
  },
  issue: {
    title: 'Emiți documentul?',
    confirm: 'Emite',
    pending: 'Se emite…',
    destructive: false,
  },
  issueUnfilled: {
    title: 'Documentul mai are text de completat',
    confirm: 'Emite oricum',
    pending: 'Se emite…',
    destructive: false,
  },
  upload: {
    title: 'Înlocuiești ciorna cu un fișier?',
    confirm: 'Alege fișierul',
    pending: 'Se încarcă…',
    destructive: false,
  },
  delete: {
    title: 'Ștergi ciorna?',
    confirm: 'Șterge ciorna',
    pending: 'Se șterge…',
    destructive: true,
  },
} as const;

function confirmationText({ action, document }: NonNullable<Confirming>) {
  if (action === 'issueUnfilled') {
    return `În fișier scrie încă „${unfilledMark}”, acolo unde aplicația nu a avut ce completa. Deschide documentul și înlocuiește textul, apoi emite-l. Dacă îl emiți așa, nu mai poate fi modificat decât printr-o ciornă nouă.`;
  }
  if (action === 'upload') {
    return 'Fișierul Word pe care îl alegi ia locul ciornei. Ce conține ciorna acum se pierde; dacă vrei să o păstrezi, descarc-o înainte.';
  }
  if (action === 'issue') {
    return document.issued
      ? `Ciorna devine revizia ${document.draft?.revision} și o înlocuiește pe cea emisă acum, care rămâne descărcabilă. Un document emis nu se mai modifică; o corectură este o ciornă nouă.`
      : 'Un document emis nu se mai modifică; o corectură este o ciornă nouă, care îl înlocuiește la emitere.';
  }
  if (action === 'delete') {
    return document.issued
      ? 'Ciorna și fișierul ei se șterg definitiv. Revizia emisă rămâne neschimbată.'
      : 'Ciorna și fișierul ei se șterg definitiv. Documentul poate fi generat din nou oricând.';
  }
  if (document.draft?.editedAt) {
    return 'Ciorna a fost modificată de mână. Dacă o generezi din nou, este completată cu datele de acum ale clientului, iar modificările tale se pierd.';
  }
  return document.draft
    ? 'Ciorna este completată din nou cu datele de acum ale clientului. Modificările făcute de mână în fișier se pierd.'
    : 'Se creează o ciornă nouă, completată cu datele de acum ale clientului. Revizia emisă rămâne în vigoare până când emiți ciorna.';
}

// A client's generated documentation (ADR 005). `readOnly` is an archived client: what exists
// can still be downloaded.
export function DocumentsCard({
  clientId,
  userId,
  readOnly,
}: {
  clientId: string;
  userId: string;
  readOnly: boolean;
}) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const documents = useListClientDocuments(clientId, {
    request: apiRequest,
    query: { queryKey: [...getListClientDocumentsQueryKey(clientId), userId] },
  });
  const regenerate = useRegenerateDocument({ request: apiRequest });
  const issue = useIssueDocument({ request: apiRequest });
  const remove = useDeleteDocumentDraft({ request: apiRequest });
  const upload = useUploadClientDocument({ request: apiRequest });
  // One file input for the whole card; what it was opened for waits here until a file is chosen.
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadTarget = useRef<{ typeKey: PackDocumentTypeKey; title: string } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [confirming, setConfirming] = useState<Confirming>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = regenerate.isPending || issue.isPending || remove.isPending || upload.isPending;

  const items = documents.data?.items ?? [];
  const existing = new Set(items.map((item) => item.typeKey));
  const lacking = documentTypeKeys.filter((key) => !existing.has(key)).length;
  // The documents the app cannot write yet wait for a file, in their place in the pack.
  const packRows = packDocumentTypeKeys.flatMap((typeKey): Row[] => {
    const document = items.find((item) => item.typeKey === typeKey);
    if (document) return [{ typeKey, title: document.title, document }];
    return isUploadedDocumentType(typeKey)
      ? [{ typeKey, title: uploadedDocumentTypes[typeKey], document: null }]
      : [];
  });
  // Anything outside the pack keeps the place the API gave it, after the pack.
  const known = new Set<string>(packDocumentTypeKeys);
  const rows = [
    ...packRows,
    ...items
      .filter((item) => !known.has(item.typeKey))
      .map((document): Row => ({ typeKey: document.typeKey, title: document.title, document })),
  ];

  function chooseFile(typeKey: string, title: string) {
    uploadTarget.current = { typeKey: typeKey as PackDocumentTypeKey, title };
    fileInput.current?.click();
  }

  async function uploadFile(file: File | undefined) {
    const target = uploadTarget.current;
    if (!file || !target) return;
    setError(null);
    try {
      await upload.mutateAsync({ clientId, typeKey: target.typeKey, data: file });
      toast.success(`„${target.title}” a fost încărcat ca ciornă.`);
    } catch (cause) {
      setError(
        cause instanceof ApiHttpError && cause.status === 400
          ? 'Fișierul nu este un document Word (.docx) sau are peste 15 MB. Dacă este un .doc mai vechi, salvează-l din Word ca .docx.'
          : cause instanceof ApiHttpError && cause.status === 409
            ? 'Documentul s-a schimbat între timp. Lista a fost reîncărcată.'
            : `Nu am putut încărca fișierul pentru „${target.title}”. Verifică conexiunea și încearcă din nou.`
      );
    }
    await queryClient.invalidateQueries({ queryKey: getListClientDocumentsQueryKey(clientId) });
  }

  async function download(document: ClientDocument, revision: Revision) {
    setError(null);
    try {
      const link = await getDocumentDownload(document.id, revision.id, apiRequest);
      // Saved from a blob, so the file gets the document's name with its diacritics: a
      // browser ignores `download` on a link to another origin, and Storage's own header
      // percent-encodes the name.
      const response = await fetch(link.url);
      if (!response.ok) throw new Error(`Download failed (${response.status}).`);
      const objectUrl = URL.createObjectURL(await response.blob());
      const anchor = window.document.createElement('a');
      anchor.href = objectUrl;
      anchor.download = link.fileName;
      anchor.click();
      URL.revokeObjectURL(objectUrl);
    } catch {
      setError(
        `Nu am putut descărca „${document.title}”. Verifică conexiunea și încearcă din nou.`
      );
    }
  }

  async function run({ action, document }: NonNullable<Confirming>) {
    setError(null);
    if (action === 'upload') {
      // Still inside the click, which is what lets a page open the file picker.
      chooseFile(document.typeKey, document.title);
      setConfirming(null);
      return;
    }
    try {
      if (action === 'regenerate') {
        await regenerate.mutateAsync({ documentId: document.id, data: {} });
        toast.success(`„${document.title}” a fost generat din nou.`);
      } else if (action === 'issue' || action === 'issueUnfilled') {
        await issue.mutateAsync({
          documentId: document.id,
          data: { acceptUnfilled: action === 'issueUnfilled' },
        });
        toast.success(`„${document.title}” a fost emis.`);
      } else {
        await remove.mutateAsync({ documentId: document.id });
        toast.success(`Ciorna pentru „${document.title}” a fost ștearsă.`);
      }
    } catch (cause) {
      const body = cause instanceof ApiHttpError ? (cause.body as Partial<ApiErrorResponse>) : null;
      if (body?.reason === 'unfilled_text') {
        // Not a failure: the same dialog asks its second question.
        setConfirming({ action: 'issueUnfilled', document });
        return;
      }
      setError(
        body?.reason === 'missing_document_data'
          ? 'Lipsesc date pe care documentul le tipărește. Deschide „Generează documentația” ca să vezi care.'
          : cause instanceof ApiHttpError && (cause.status === 404 || cause.status === 409)
            ? 'Documentul s-a schimbat între timp. Lista a fost reîncărcată.'
            : 'Operațiunea nu a reușit. Verifică conexiunea și încearcă din nou.'
      );
    }
    setConfirming(null);
    // Also after a failure: a 404 or a 409 means the list on screen is out of date.
    await queryClient.invalidateQueries({ queryKey: getListClientDocumentsQueryKey(clientId) });
  }

  return (
    <Card data-testid="documents-card">
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Documentația SSM</h2>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Documentele sunt completate cu datele clientului și salvate ca fișiere Word. O ciornă
            poate fi generată din nou sau ștearsă; un document emis nu se mai schimbă.
          </p>
        </div>
        {!readOnly && documents.isSuccess && lacking > 0 && (
          <Button data-testid="documents-generate" onClick={() => setGenerating(true)}>
            <Sparkles aria-hidden="true" />
            {items.length === 0 ? 'Generează documentația' : 'Generează documentele lipsă'}
          </Button>
        )}
      </CardHeader>
      <CardContent className="grid gap-4">
        {error && (
          <p
            data-testid="documents-error"
            role="alert"
            className="rounded-md border border-destructive/30 p-3 text-sm text-destructive"
          >
            {error}
          </p>
        )}
        {documents.isPending ? (
          <Skeleton className="h-40 w-full" />
        ) : documents.isError ? (
          <div role="alert" className="flex flex-wrap items-center gap-3 text-sm text-destructive">
            <p>Nu am putut încărca documentele.</p>
            <Button
              variant="outline"
              disabled={documents.isFetching}
              onClick={() => void documents.refetch()}
            >
              Încearcă din nou
            </Button>
          </div>
        ) : items.length === 0 ? (
          <div data-testid="documents-empty" className="grid justify-items-center gap-2 py-10">
            <FileText className="size-8 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm font-medium">Niciun document încă</p>
            <p className="max-w-md text-center text-sm text-muted-foreground">
              {readOnly
                ? 'Clientul este arhivat, așa că nu i se mai generează documente.'
                : 'Generează documentația ca să obții deciziile, materialele de instruire, testele, registrele și celelalte documente, completate cu datele clientului.'}
            </p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Document</TableHead>
                <TableHead>Stare</TableHead>
                <TableHead>Data documentului</TableHead>
                <TableHead className="w-12">
                  <span className="sr-only">Acțiuni</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ typeKey, title, document }) => {
                if (!document) {
                  return (
                    <TableRow key={typeKey} data-testid="document-slot">
                      <TableCell className="font-medium text-muted-foreground">{title}</TableCell>
                      <TableCell>
                        <Badge
                          variant="outline"
                          title="Aplicația nu scrie încă acest document. Încarcă fișierul Word scris în altă parte, ca documentația să fie completă."
                        >
                          Neîncărcat
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">—</TableCell>
                      <TableCell>
                        {!readOnly && (
                          <Button
                            variant="ghost"
                            size="icon"
                            data-testid="document-slot-upload"
                            aria-label={`Încarcă ${title}`}
                            disabled={busy}
                            onClick={() => chooseFile(typeKey, title)}
                          >
                            <Upload aria-hidden="true" />
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                }
                const current = document.draft ?? document.issued;
                const uploaded = isUploadedDocumentType(document.typeKey);
                return (
                  <TableRow key={document.id} data-testid="document-row">
                    <TableCell>
                      <Link
                        to="/clients/$clientId/documents/$documentId"
                        params={{ clientId, documentId: document.id }}
                        data-testid="document-title"
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {document.title}
                      </Link>
                      {document.decisionNumber !== null && (
                        <span className="block text-xs text-muted-foreground">
                          Decizia nr. {document.decisionNumber} SSM
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <span className="flex flex-wrap gap-1.5">
                        {document.issued && (
                          <Badge data-testid="document-issued">
                            Emis · rev. {document.issued.revision}
                          </Badge>
                        )}
                        {document.draft && (
                          <Badge variant="secondary" data-testid="document-draft">
                            Ciornă · rev. {document.draft.revision}
                          </Badge>
                        )}
                        {document.draft?.editedAt && uploaded && (
                          <Badge variant="outline" data-testid="document-uploaded">
                            Încărcat
                          </Badge>
                        )}
                        {document.draft?.editedAt && !uploaded && (
                          <Badge
                            variant="outline"
                            data-testid="document-edited"
                            title="Ciorna a fost modificată de mână. Dacă o generezi din nou, modificările se pierd."
                          >
                            Modificat
                          </Badge>
                        )}
                        {document.draft?.dataChanged && (
                          <Badge
                            variant="outline"
                            data-testid="document-data-changed"
                            title="Datele clientului s-au schimbat de când a fost generată ciorna. Generează documentul din nou ca să le preia."
                          >
                            Date modificate
                          </Badge>
                        )}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {current?.issueDate ? formatRoDate(current.issueDate) : '—'}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            data-testid="document-actions"
                            aria-label={`Acțiuni pentru ${document.title}`}
                          >
                            <MoreHorizontal aria-hidden="true" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem asChild data-testid="document-open">
                            <Link
                              to="/clients/$clientId/documents/$documentId"
                              params={{ clientId, documentId: document.id }}
                            >
                              {document.draft && !readOnly ? 'Deschide și modifică' : 'Deschide'}
                            </Link>
                          </DropdownMenuItem>
                          {document.draft && (
                            <DropdownMenuItem
                              data-testid="document-download-draft"
                              onSelect={() => void download(document, document.draft!)}
                            >
                              Descarcă ciorna
                            </DropdownMenuItem>
                          )}
                          {document.issued && (
                            <DropdownMenuItem
                              data-testid="document-download-issued"
                              onSelect={() => void download(document, document.issued!)}
                            >
                              Descarcă documentul emis
                            </DropdownMenuItem>
                          )}
                          {!readOnly && (
                            <>
                              <DropdownMenuSeparator />
                              {!uploaded && (
                                <DropdownMenuItem
                                  data-testid="document-regenerate"
                                  onSelect={() => setConfirming({ action: 'regenerate', document })}
                                >
                                  Generează din nou
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuItem
                                data-testid="document-upload"
                                onSelect={() =>
                                  document.draft
                                    ? setConfirming({ action: 'upload', document })
                                    : chooseFile(document.typeKey, document.title)
                                }
                              >
                                Încarcă un fișier
                              </DropdownMenuItem>
                              {document.draft && (
                                <>
                                  <DropdownMenuItem
                                    data-testid="document-issue"
                                    onSelect={() => setConfirming({ action: 'issue', document })}
                                  >
                                    Emite
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    data-testid="document-delete-draft"
                                    variant="destructive"
                                    onSelect={() => setConfirming({ action: 'delete', document })}
                                  >
                                    Șterge ciorna
                                  </DropdownMenuItem>
                                </>
                              )}
                            </>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
      <input
        ref={fileInput}
        type="file"
        data-testid="document-file-input"
        className="hidden"
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Emptied, so that choosing the same file again is still a change.
          event.target.value = '';
          void uploadFile(file);
        }}
      />
      <GenerateDocumentsDialog
        clientId={clientId}
        userId={userId}
        open={generating}
        lastGeneration={documents.data?.lastGeneration ?? null}
        onClose={() => setGenerating(false)}
      />
      <Dialog
        open={confirming !== null}
        onOpenChange={(open) => !open && !busy && setConfirming(null)}
      >
        {confirming && (
          <DialogContent data-testid="document-confirm-dialog" className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{confirmations[confirming.action].title}</DialogTitle>
              <DialogDescription>
                <span className="font-medium text-foreground">{confirming.document.title}</span>
                {'. '}
                {confirmationText(confirming)}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="mt-2">
              <Button variant="ghost" disabled={busy} onClick={() => setConfirming(null)}>
                Renunță
              </Button>
              <Button
                variant={confirmations[confirming.action].destructive ? 'destructive' : 'default'}
                data-testid="document-confirm"
                disabled={busy}
                onClick={() => void run(confirming)}
              >
                {busy
                  ? confirmations[confirming.action].pending
                  : confirmations[confirming.action].confirm}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </Card>
  );
}
