import {
  type BuiltInDocumentTypeKey,
  type DocumentAnnex,
  type DocumentSet,
  documentSetTypeKeys,
  unfilledMark,
} from '@ssm-usor/contracts';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@ssm-usor/ui/components/accordion';
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
import { Link, useNavigate, useRouteContext } from '@tanstack/react-router';
import { FileText, MoreHorizontal, Sparkles } from 'lucide-react';
import { Fragment, useRef, useState } from 'react';

import {
  type ApiErrorResponse,
  getDocumentDownload,
  getInstructionModuleFileLink,
  getListClientDocumentsQueryKey,
  getListDocumentsBehindQueryKey,
  useDeleteDocumentDraft,
  useIssueDocument,
  useListClientDocuments,
  useListDocumentsBehind,
  useRegenerateDocument,
  useStartDocumentDraft,
  useUploadClientDocument,
} from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import { rowClickProps } from '@/components/data-table/row-click';
import { Notice } from '@/components/notice';
import { useFocusRequest } from '@/features/missing-data/focus';
import { endWayBack } from '@/features/missing-data/way-back';
import { formatRoDate } from '@/lib/dates';
import { openDownload } from '@/lib/save-file';

import { AnnexRow } from './annex-row';
import {
  type ClientDocument,
  notApplicableTitles,
  notGeneratedTitles,
  workersRepresentativesRule,
} from './document-labels';
import {
  type SectionIdOf,
  type SectionRow,
  sectionSummary,
  setSections,
} from './document-sections';
import { documentLink, documentSetCopy, setParams } from './document-sets';
import { GenerateDocumentsDialog } from './generate-documents-dialog';
import { pdfOfRevision, usePrint } from './print';

type Revision = NonNullable<ClientDocument['draft']>;
type Confirming = {
  // `issueUnfilled` is the second question of issuing: the file still has text to fill in.
  action: 'regenerate' | 'issue' | 'issueUnfilled' | 'upload' | 'delete';
  document: ClientDocument;
} | null;

const archivedHint = 'Clientul este arhivat, așa că nu i se mai generează documente.';

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
    return `În fișier scrie încă „${unfilledMark}”, acolo unde aplicația nu a avut ce completa. Deschide documentul: butonul „locuri de completat” din bara editorului te duce la fiecare. Dacă îl emiți așa, nu mai poate fi modificat decât printr-o ciornă nouă.`;
  }
  if (action === 'upload') {
    return 'Fișierul Word pe care îl alegi ia locul ciornei. Ce conține ciorna acum se pierde; dacă vrei să o păstrezi, descarc-o înainte.';
  }
  if (action === 'issue') {
    return document.issued
      ? `Ciorna devine revizia ${document.draft?.revision} și o înlocuiește pe cea emisă acum, care rămâne descărcabilă. Un document emis nu se mai modifică; o corectură este o ciornă nouă. La emitere se face și PDF-ul, ceea ce poate dura câteva secunde.`
      : 'Un document emis nu se mai modifică; o corectură este o ciornă nouă, care îl înlocuiește la emitere. La emitere se face și PDF-ul, ceea ce poate dura câteva secunde.';
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
    : 'Se creează o ciornă nouă din șablon, completată cu datele de acum ale clientului, fără modificările făcute de mână în documentul emis. Ca să le păstrezi, alege „Modifică documentul emis”. Revizia emisă rămâne în vigoare până când emiți ciorna.';
}

function newerTemplateHint({ version, note }: { version: number; note: string | null }) {
  const change = note ? `: ${note.replace(/[.!]?$/, '.')}` : '.';
  return `Versiunea ${version} a șablonului${change} Generează documentul din nou ca să o preia.`;
}

// `readOnly` is an archived client: what exists can still be downloaded.
export function DocumentsCard<Set extends DocumentSet>({
  set,
  clientId,
  userId,
  readOnly,
  openSection,
  onOpenSectionChange,
  focus,
}: {
  set: Set;
  clientId: string;
  userId: string;
  readOnly: boolean;
  openSection: SectionIdOf<Set> | undefined;
  onOpenSectionChange: (section: SectionIdOf<Set> | undefined) => void;
  focus?: 'generate';
}) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const navigate = useNavigate();
  const copy = documentSetCopy[set];
  const documents = useListClientDocuments(clientId, setParams(set), {
    request: apiRequest,
    query: { queryKey: [...getListClientDocumentsQueryKey(clientId, setParams(set)), userId] },
  });
  const behind = useListDocumentsBehind({
    request: apiRequest,
    query: { queryKey: [...getListDocumentsBehindQueryKey(), userId], enabled: !readOnly },
  });
  const regenerate = useRegenerateDocument({ request: apiRequest });
  const issue = useIssueDocument({ request: apiRequest });
  const remove = useDeleteDocumentDraft({ request: apiRequest });
  const upload = useUploadClientDocument({ request: apiRequest });
  const startDraft = useStartDocumentDraft({ request: apiRequest });
  const { printing, print } = usePrint();
  // One file input for the whole card; what it was opened for waits here until a file is chosen.
  const fileInput = useRef<HTMLInputElement>(null);
  const uploadTarget = useRef<{ typeKey: BuiltInDocumentTypeKey; title: string } | null>(null);
  const [generating, setGenerating] = useState(false);
  const [confirming, setConfirming] = useState<Confirming>(null);
  const [error, setError] = useState<string | null>(null);
  const busy =
    regenerate.isPending ||
    issue.isPending ||
    remove.isPending ||
    upload.isPending ||
    startDraft.isPending;

  const items = documents.data?.items ?? [];
  const newerTemplate = new Map(
    (behind.data?.items ?? []).flatMap((type) =>
      type.clients
        .filter((client) => client.clientId === clientId)
        .map((client) => [client.documentId, type.newestVersion] as const)
    )
  );
  const existing = new Set(items.map((item) => item.typeKey));
  const notApplicable = new Set<string>(documents.data?.notApplicable);
  const typeKeys: readonly BuiltInDocumentTypeKey[] = documentSetTypeKeys[set];
  const lacking = typeKeys.filter((key) => !existing.has(key) && !notApplicable.has(key)).length;
  const canGenerate = !readOnly && documents.isSuccess && lacking > 0;

  function openGenerate() {
    endWayBack();
    setGenerating(true);
  }

  const generateRef = useRef<HTMLButtonElement>(null);
  useFocusRequest(focus === 'generate', {
    ready: !documents.isPending,
    anchor: () => generateRef.current,
    open: canGenerate ? openGenerate : undefined,
  });
  const { sections: setSectionList, other, listsWholePack } = setSections[set];
  const packRows = typeKeys.flatMap((typeKey): SectionRow[] => {
    const document = items.find((item) => item.typeKey === typeKey);
    if (document) return [{ kind: 'document', key: typeKey, title: document.title, document }];
    const notApplicableTitle = notApplicableTitles[typeKey];
    if (notApplicable.has(typeKey) && notApplicableTitle) {
      return [{ kind: 'notApplicable', key: typeKey, title: notApplicableTitle, document: null }];
    }
    const notGeneratedTitle = listsWholePack ? notGeneratedTitles[typeKey] : undefined;
    return notGeneratedTitle
      ? [{ kind: 'notGenerated', key: typeKey, title: notGeneratedTitle, document: null }]
      : [];
  });
  const known = new Set<string>(typeKeys);
  const otherRows = items
    .filter((item) => !known.has(item.typeKey))
    .map((document): SectionRow => ({
      kind: 'document',
      key: document.typeKey,
      title: document.title,
      document,
    }));
  const sections = [
    ...setSectionList.map((section) => ({
      id: section.id,
      title: `${section.number}. ${section.title}`,
      rows: [
        ...packRows.filter((row) => section.typeKeys.includes(row.key)),
        ...(section.planned ?? []).map((planned): SectionRow => ({
          kind: 'planned',
          key: planned.id,
          title: planned.title,
          document: null,
        })),
      ],
    })),
    ...(otherRows.length > 0 ? [{ ...other, rows: otherRows }] : []),
  ];

  function chooseFile(typeKey: string, title: string) {
    uploadTarget.current = { typeKey: typeKey as BuiltInDocumentTypeKey, title };
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
    void queryClient.invalidateQueries({ queryKey: getListDocumentsBehindQueryKey() });
    await queryClient.invalidateQueries({ queryKey: getListClientDocumentsQueryKey(clientId) });
  }

  async function download(
    document: ClientDocument,
    revision: Revision,
    format: 'docx' | 'pdf' = 'docx'
  ) {
    setError(null);
    try {
      const link = await getDocumentDownload(document.id, revision.id, { format }, apiRequest);
      openDownload(apiRequest.baseUrl, link);
    } catch {
      setError(
        `Nu am putut descărca „${document.title}”. Verifică conexiunea și încearcă din nou.`
      );
    }
  }

  async function downloadAnnex(annex: DocumentAnnex) {
    setError(null);
    try {
      const link = await getInstructionModuleFileLink(
        annex.moduleId,
        { versionId: annex.version.id },
        apiRequest
      );
      openDownload(apiRequest.baseUrl, link);
    } catch {
      setError(
        `Nu am putut descărca anexa „${annex.title}”. Verifică conexiunea și încearcă din nou.`
      );
    }
  }

  async function printRevision(document: ClientDocument, revision: Revision) {
    setError(null);
    setError(await print(document.title, () => pdfOfRevision(apiRequest, document.id, revision)));
  }

  async function startDraftFromIssued(document: ClientDocument) {
    setError(null);
    try {
      await startDraft.mutateAsync({ documentId: document.id });
    } catch (cause) {
      // A 409 is a draft someone else has just started, and it opens all the same.
      if (!(cause instanceof ApiHttpError && cause.status === 409)) {
        setError(
          `Nu am putut porni o ciornă nouă pentru „${document.title}”. Verifică conexiunea și încearcă din nou.`
        );
        return;
      }
    }
    await queryClient.invalidateQueries({ queryKey: getListClientDocumentsQueryKey(clientId) });
    await navigate({
      ...documentLink(set, clientId, document.id),
      state: { openedFromList: true },
    });
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
        body?.reason === 'pdf_unavailable'
          ? `Nu am putut face PDF-ul pentru „${document.title}”, așa că documentul nu a fost emis. Încearcă din nou peste câteva momente.`
          : body?.reason === 'missing_document_data' &&
              document.typeKey === 'decision_workers_representative'
            ? // Under 10 employees the generation form does not ask for a representative.
              'Decizia are nevoie de cel puțin un reprezentant al lucrătorilor, ales dintre angajații actuali și altul decât reprezentantul legal. Verifică „Instruire și responsabili”.'
            : body?.reason === 'missing_document_data'
              ? 'Lipsesc date pe care documentul le tipărește. Deschide „Generează documentația” ca să vezi care.'
              : cause instanceof ApiHttpError && (cause.status === 404 || cause.status === 409)
                ? 'Documentul s-a schimbat între timp. Lista a fost reîncărcată.'
                : 'Operațiunea nu a reușit. Verifică conexiunea și încearcă din nou.'
      );
    }
    setConfirming(null);
    // Also after a failure: a 404 or a 409 means the list on screen is out of date.
    void queryClient.invalidateQueries({ queryKey: getListDocumentsBehindQueryKey() });
    await queryClient.invalidateQueries({ queryKey: getListClientDocumentsQueryKey(clientId) });
  }

  return (
    <Card data-testid="documents-card">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-4">
        <div className="grid gap-1">
          <h2 className="text-lg font-semibold">{copy.heading}</h2>
          {listsWholePack && documents.isSuccess && items.length === 0 && (
            <p data-testid="documents-hint" className="max-w-prose text-sm text-muted-foreground">
              {readOnly ? archivedHint : copy.emptyHint}
            </p>
          )}
        </div>
        {canGenerate && (
          <Button ref={generateRef} data-testid="documents-generate" onClick={openGenerate}>
            <Sparkles aria-hidden="true" />
            {items.length === 0 ? 'Generează documentația' : 'Generează documentele lipsă'}
          </Button>
        )}
      </CardHeader>
      <CardContent className="grid gap-4">
        {error && (
          <Notice variant="destructive" data-testid="documents-error">
            {error}
          </Notice>
        )}
        {documents.isPending ? (
          <Skeleton className="h-40 w-full" />
        ) : documents.isError ? (
          <Notice
            variant="destructive"
            action={
              <Button
                variant="outline"
                disabled={documents.isFetching}
                onClick={() => void documents.refetch()}
              >
                Încearcă din nou
              </Button>
            }
          >
            Nu am putut încărca documentele.
          </Notice>
        ) : items.length === 0 && !listsWholePack ? (
          <div data-testid="documents-empty" className="grid justify-items-center gap-2 py-10">
            <FileText className="size-8 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm font-medium">Niciun document încă</p>
            <p className="max-w-md text-center text-sm text-muted-foreground">
              {readOnly ? archivedHint : copy.emptyHint}
            </p>
          </div>
        ) : (
          <Accordion
            className="min-w-0"
            type="single"
            collapsible
            value={openSection ?? ''}
            onValueChange={(value) =>
              onOpenSectionChange((value || undefined) as SectionIdOf<Set> | undefined)
            }
          >
            {sections.map((section) => (
              <AccordionItem key={section.id} value={section.id} data-testid="document-section">
                <AccordionTrigger data-testid="document-section-trigger">
                  <span className="flex flex-1 flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <span>{section.title}</span>
                    <span
                      data-testid="document-section-summary"
                      className="font-normal text-muted-foreground"
                    >
                      {sectionSummary(section.rows)}
                    </span>
                  </span>
                </AccordionTrigger>
                <AccordionContent>
                  {section.rows.length === 0 ? (
                    <p className="text-muted-foreground">
                      Documentele acestei secțiuni nu sunt generate încă.
                    </p>
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
                        {section.rows.map(({ kind, key, title, document }) => {
                          if (kind === 'notGenerated') {
                            return (
                              <TableRow key={key} data-testid="document-not-generated">
                                <TableCell className="font-medium text-muted-foreground">
                                  {title}
                                </TableCell>
                                <TableCell className="text-muted-foreground">Negenerat</TableCell>
                                <TableCell />
                                <TableCell />
                              </TableRow>
                            );
                          }
                          if (kind === 'planned') {
                            return (
                              <TableRow key={key} data-testid="document-planned">
                                <TableCell className="font-medium text-muted-foreground">
                                  {title}
                                </TableCell>
                                <TableCell>
                                  <Badge
                                    variant="outline"
                                    title="Aplicația nu poate genera încă acest document."
                                  >
                                    În pregătire
                                  </Badge>
                                </TableCell>
                                <TableCell />
                                <TableCell />
                              </TableRow>
                            );
                          }
                          if (!document) {
                            return (
                              <TableRow key={key} data-testid="document-not-applicable">
                                <TableCell className="font-medium text-muted-foreground">
                                  {title}
                                </TableCell>
                                <TableCell>
                                  <Badge
                                    variant="outline"
                                    title={workersRepresentativesRule(
                                      documents.data?.currentEmployeeCount ?? 0,
                                      false
                                    )}
                                  >
                                    Nu se aplică
                                  </Badge>
                                </TableCell>
                                <TableCell className="text-muted-foreground">
                                  Sub 10 angajați
                                </TableCell>
                                <TableCell />
                              </TableRow>
                            );
                          }
                          const current = document.draft ?? document.issued;
                          return (
                            <Fragment key={document.id}>
                              <TableRow
                                data-testid="document-row"
                                {...rowClickProps(
                                  () =>
                                    void navigate({
                                      ...documentLink(set, clientId, document.id),
                                      state: { openedFromList: true },
                                    })
                                )}
                              >
                                <TableCell>
                                  <Link
                                    {...documentLink(set, clientId, document.id)}
                                    state={{ openedFromList: true }}
                                    data-testid="document-title"
                                    className="font-medium underline-offset-4 hover:underline"
                                  >
                                    {document.title}
                                  </Link>
                                  {document.decisionNumber !== null && (
                                    <span className="block text-xs text-muted-foreground">
                                      Decizia nr. {document.decisionNumber} {copy.decisionSuffix}
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
                                    {document.draft?.editedAt && (
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
                                    {newerTemplate.has(document.id) && (
                                      <Badge
                                        variant="outline"
                                        data-testid="document-behind"
                                        title={newerTemplateHint(newerTemplate.get(document.id)!)}
                                      >
                                        Șablon actualizat
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
                                        <Link {...documentLink(set, clientId, document.id)}>
                                          {document.draft && !readOnly
                                            ? 'Deschide și modifică'
                                            : 'Deschide'}
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
                                      {document.issued?.hasPdf && (
                                        <DropdownMenuItem
                                          data-testid="document-download-pdf"
                                          onSelect={() =>
                                            void download(document, document.issued!, 'pdf')
                                          }
                                        >
                                          Descarcă PDF-ul documentului emis
                                        </DropdownMenuItem>
                                      )}
                                      {document.draft && (
                                        <DropdownMenuItem
                                          data-testid="document-print-draft"
                                          disabled={printing}
                                          onSelect={() =>
                                            void printRevision(document, document.draft!)
                                          }
                                        >
                                          Tipărește ciorna
                                        </DropdownMenuItem>
                                      )}
                                      {document.issued && (
                                        <DropdownMenuItem
                                          data-testid="document-print-issued"
                                          disabled={printing}
                                          onSelect={() =>
                                            void printRevision(document, document.issued!)
                                          }
                                        >
                                          Tipărește documentul emis
                                        </DropdownMenuItem>
                                      )}
                                      {!readOnly && (
                                        <>
                                          <DropdownMenuSeparator />
                                          {document.issued && !document.draft && (
                                            <DropdownMenuItem
                                              data-testid="document-start-draft"
                                              disabled={busy}
                                              onSelect={() => void startDraftFromIssued(document)}
                                            >
                                              Modifică documentul emis
                                            </DropdownMenuItem>
                                          )}
                                          <DropdownMenuItem
                                            data-testid="document-regenerate"
                                            onSelect={() =>
                                              setConfirming({ action: 'regenerate', document })
                                            }
                                          >
                                            Generează din nou
                                          </DropdownMenuItem>
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
                                                onSelect={() =>
                                                  setConfirming({ action: 'issue', document })
                                                }
                                              >
                                                Emite
                                              </DropdownMenuItem>
                                              <DropdownMenuSeparator />
                                              <DropdownMenuItem
                                                data-testid="document-delete-draft"
                                                variant="destructive"
                                                onSelect={() =>
                                                  setConfirming({ action: 'delete', document })
                                                }
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
                              {current?.annexes.map((annex) => (
                                <AnnexRow
                                  key={annex.version.id}
                                  annex={annex}
                                  onDownload={() => void downloadAnnex(annex)}
                                />
                              ))}
                            </Fragment>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
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
        set={set}
        clientId={clientId}
        userId={userId}
        open={generating}
        lastGeneration={documents.data?.lastGeneration ?? null}
        workersRepresentativeDecisionGenerated={items.some(
          (item) =>
            item.typeKey === 'decision_workers_representative' && (item.draft || item.issued)
        )}
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
