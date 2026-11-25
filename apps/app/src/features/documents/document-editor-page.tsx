import { type DocumentSet, numberedTitle } from '@ssm-usor/contracts';
import { Badge } from '@ssm-usor/ui/components/badge';
import { Button } from '@ssm-usor/ui/components/button';
import { Notice } from '@ssm-usor/ui/components/notice';
import { toast } from '@ssm-usor/ui/lib/toast';
import { useBlocker } from '@tanstack/react-router';
import { Download, Pencil, Printer, Save } from 'lucide-react';
import { lazy, type ReactNode, Suspense, useCallback, useEffect, useRef, useState } from 'react';

import {
  getDocumentDownload,
  getListClientDocumentsQueryKey,
  useListClientDocuments,
  useSaveDocumentDraftFile,
  useStartDocumentDraft,
} from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import { useApi } from '@/api/use-api';
import { replayMask } from '@/app/observability/replay-masking';
import { BackLink, TitleWithBack } from '@/components/back-link';
import { commonFailure } from '@/lib/api-errors';

import type { DocumentEditorHandle } from './document-editor';
import type { ClientDocument } from './document-labels';
import { sectionOf } from './document-sections';
import { builtFromDataNote, documentSetCopy, documentsLink, setParams } from './document-sets';
import type { PhoneBar } from './editor-bar';
import { editorFrameClassName, saveAs } from './editor-frame';
import { EditorPlaceholder } from './editor-placeholder';
import { pdfOf, pdfOfRevision, usePrint } from './print';

const DocumentEditor = lazy(() => import('./document-editor'));
const issuedNote =
  'Un document emis nu se mai schimbă. „Modifică” pornește din el o ciornă nouă, iar el rămâne în vigoare până o emiți.';
const docxType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

type Loaded = { revisionId: string; bytes: Uint8Array; fileName: string };

// Where the page gets its document from, and goes back to. A document of the documentation
// set is found in the client's list; the service contract comes with its own details.
export interface DocumentSource {
  document: ClientDocument | undefined;
  isPending: boolean;
  isError: boolean;
  isSuccess: boolean;
  refetch: () => void;
  // After a save or a new draft, so that whatever listed the document shows it as it is.
  invalidate: () => Promise<void>;
  back: ReactNode;
  // The arrow alone, beside a heading, when `back` carries more than the arrow.
  arrow?: ReactNode;
  // Every contract has the same title, so a phone's bar names the company instead.
  company?: string;
}

// `readOnly` is an archived client.
export function DocumentEditorPage({
  set,
  clientId,
  documentId,
  readOnly,
}: {
  set: DocumentSet;
  clientId: string;
  documentId: string;
  readOnly: boolean;
}) {
  const { request, queryClient, key } = useApi();
  const documents = useListClientDocuments(clientId, setParams(set), {
    request,
    query: { queryKey: key(getListClientDocumentsQueryKey(clientId, setParams(set))) },
  });
  const document = documents.data?.items.find((item) => item.id === documentId);
  const copy = documentSetCopy[set];
  return (
    <DocumentEditorView
      readOnly={readOnly}
      source={{
        document,
        isPending: documents.isPending,
        isError: documents.isError,
        isSuccess: documents.isSuccess,
        refetch: () => void documents.refetch(),
        invalidate: () =>
          queryClient.invalidateQueries({ queryKey: getListClientDocumentsQueryKey(clientId) }),
        back: (
          <BackLink
            {...documentsLink(set, clientId, document && sectionOf(document.typeKey, set))}
            data-testid="editor-back"
            label={copy.backLabel}
          />
        ),
      }}
    />
  );
}

const archivedClient = {
  label: 'Client arhivat',
  title: 'Clientul este arhivat: documentul poate fi doar citit.',
};

export function DocumentEditorView({
  source,
  readOnly,
  readOnlyReason = archivedClient,
}: {
  source: DocumentSource;
  readOnly: boolean;
  readOnlyReason?: { label: string; title: string };
}) {
  const { request } = useApi();
  const documents = source;
  const { document, back } = source;
  const arrow = source.arrow ?? back;
  const documentId = document?.id ?? '';
  const saveDraft = useSaveDocumentDraftFile({ request });
  const startDraft = useStartDocumentDraft({ request });
  const editor = useRef<DocumentEditorHandle>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  // The revision whose file could not be fetched, so that another revision starts clean.
  const [failedRevisionId, setFailedRevisionId] = useState<string | null>(null);
  const [readyRevisionId, setReadyRevisionId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [startError, setStartError] = useState(false);
  const { printing, print } = usePrint();
  const [printError, setPrintError] = useState<string | null>(null);

  const revision = document?.draft ?? document?.issued ?? null;
  const title = document ? numberedTitle(document.typeKey, document.title) : '';
  const builtFromData = document !== undefined && !document.editable;
  const editable = !readOnly && !builtFromData && document?.draft != null;
  const canStartDraft =
    !readOnly && !builtFromData && document != null && !document.draft && document.issued != null;
  const revisionId = revision?.id;
  const ready = revisionId !== undefined && readyRevisionId === revisionId;
  const loadError = revisionId !== undefined && failedRevisionId === revisionId;

  // The file of the revision, once per revision: saving does not fetch it again.
  useEffect(() => {
    if (!revisionId || loaded?.revisionId === revisionId || failedRevisionId === revisionId) return;
    let cancelled = false;
    void (async () => {
      try {
        const link = await getDocumentDownload(documentId, revisionId, undefined, request);
        const response = await fetch(link.url);
        if (!response.ok) throw new Error(`Download failed (${response.status}).`);
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (!cancelled) setLoaded({ revisionId, bytes, fileName: link.fileName });
      } catch {
        if (!cancelled) setFailedRevisionId(revisionId);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [request, documentId, revisionId, loaded?.revisionId, failedRevisionId]);

  useBlocker({
    shouldBlockFn: () =>
      dirty && !window.confirm('Ai modificări nesalvate. Părăsești pagina fără să le salvezi?'),
    enableBeforeUnload: () => dirty,
  });

  const save = useCallback(async () => {
    if (!editable || !dirty || saveDraft.isPending) return;
    setSaveError(null);
    try {
      const bytes = await editor.current?.save();
      if (!bytes) throw new Error('The editor returned no document.');
      await saveDraft.mutateAsync({
        documentId,
        data: new Blob([new Uint8Array(bytes)], { type: docxType }),
      });
      setDirty(false);
      toast.success('Documentul a fost salvat.');
      await source.invalidate();
    } catch (cause) {
      setSaveError(
        cause instanceof ApiHttpError && cause.status === 409
          ? 'Ciorna nu mai există: a fost emisă sau ștearsă între timp. Descarcă fișierul ca să nu pierzi modificările.'
          : cause instanceof ApiHttpError && cause.status === 401
            ? 'Sesiunea nu mai este validă. Descarcă fișierul ca să nu pierzi modificările, apoi autentifică-te din nou.'
            : (commonFailure(cause) ??
              'Nu am putut salva documentul. Verifică conexiunea și încearcă din nou.')
      );
    }
  }, [dirty, documentId, editable, saveDraft, source]);

  async function startDraftFromIssued() {
    setStartError(false);
    try {
      await startDraft.mutateAsync({ documentId });
      toast.success('Ai o ciornă nouă, pornită din documentul emis.');
    } catch (cause) {
      // A 409 is a draft someone else has just started: the list brings it.
      if (!(cause instanceof ApiHttpError && cause.status === 409)) setStartError(true);
    }
    await source.invalidate();
  }

  // What is on screen, edits included, so that a failed save never costs the work.
  async function download() {
    if (!loaded) return;
    const current = ready ? await editor.current?.save() : null;
    saveAs(current ?? loaded.bytes, loaded.fileName);
  }

  async function printShown() {
    if (!loaded || !document || !revision) return;
    setPrintError(null);
    setPrintError(
      await print(title, async () => {
        if (!editable && revision.hasPdf) return pdfOfRevision(request, documentId, revision);
        const current = ready ? await editor.current?.copy() : null;
        return pdfOf(request, documentId, current ?? loaded.bytes);
      })
    );
  }

  if (documents.isPending || (revision && !loaded && !loadError)) {
    return (
      <div data-testid="editor-frame" className={editorFrameClassName}>
        <EditorPlaceholder back={back} />
      </div>
    );
  }
  if (documents.isError || loadError || !document || !revision || !loaded) {
    return (
      <div data-testid="editor-unavailable" role="alert" className="grid max-w-lg gap-4 py-10">
        <TitleWithBack back={arrow} line="text-2xl">
          <h1 className="text-2xl font-semibold">Documentul nu a putut fi deschis</h1>
        </TitleWithBack>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {documents.isSuccess && (!document || !revision)
            ? 'Documentul nu există sau nu mai are nicio revizie.'
            : 'Nu am putut încărca fișierul. Verifică conexiunea și încearcă din nou.'}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              setFailedRevisionId(null);
              documents.refetch();
            }}
          >
            Încearcă din nou
          </Button>
        </div>
      </div>
    );
  }

  const actions = (
    <div className="flex flex-wrap items-center gap-2 max-sm:flex-1">
      <Badge
        variant={editable ? 'secondary' : 'default'}
        data-testid="editor-state"
        title={canStartDraft ? issuedNote : undefined}
      >
        {document.draft
          ? `Ciornă · rev. ${document.draft.revision}`
          : `Emis · rev. ${revision.revision}`}
      </Badge>
      {readOnly && (
        <Badge variant="outline" data-testid="editor-read-only" title={readOnlyReason.title}>
          {readOnlyReason.label}
        </Badge>
      )}
      {builtFromData && (
        <span data-testid="editor-built-from-data" className="text-xs text-muted-foreground">
          {builtFromDataNote}
        </span>
      )}
      {editable && (
        <span
          data-testid="editor-saved-state"
          className="text-xs text-muted-foreground max-sm:sr-only"
        >
          {dirty ? 'Modificări nesalvate' : 'Salvat'}
        </span>
      )}
      <Button
        variant="secondary"
        size="sm"
        data-testid="editor-download"
        className="max-sm:ml-auto"
        onClick={() => void download()}
      >
        <Download aria-hidden="true" />
        <span className="max-sm:sr-only">Descarcă</span>
      </Button>
      <Button
        variant="secondary"
        size="sm"
        data-testid="editor-print"
        disabled={printing}
        onClick={() => void printShown()}
      >
        <Printer aria-hidden="true" />
        <span className="max-sm:sr-only">{printing ? 'Se pregătește…' : 'Tipărește'}</span>
      </Button>
      {canStartDraft && (
        <Button
          size="sm"
          data-testid="editor-start-draft"
          title={issuedNote}
          disabled={startDraft.isPending}
          onClick={() => void startDraftFromIssued()}
        >
          <Pencil aria-hidden="true" />
          {startDraft.isPending ? 'Se pregătește ciorna…' : 'Modifică'}
        </Button>
      )}
      {editable && (
        <Button
          size="sm"
          data-testid="editor-save"
          disabled={!dirty || saveDraft.isPending}
          onClick={() => void save()}
        >
          <Save aria-hidden="true" />
          {saveDraft.isPending ? 'Se salvează…' : 'Salvează'}
        </Button>
      )}
    </div>
  );

  const phoneBar: PhoneBar = {
    back: arrow,
    title: source.company ?? document.title,
    heading: document.title,
    subtitle: source.company,
    badges: [
      {
        label: document.draft
          ? `Ciornă · rev. ${document.draft.revision}`
          : `Emis · rev. ${revision.revision}`,
        variant: editable ? 'secondary' : 'default',
      },
      ...(readOnly ? [{ label: readOnlyReason.label, variant: 'outline' as const }] : []),
    ],
    status: editable
      ? dirty
        ? { text: 'Modificări nesalvate', tone: 'warning' }
        : { text: 'Salvat', tone: 'muted' }
      : undefined,
    note: canStartDraft
      ? issuedNote
      : readOnly
        ? readOnlyReason.title
        : builtFromData
          ? builtFromDataNote
          : undefined,
    busy: printing ? 'Se pregătește tipărirea' : undefined,
    main: canStartDraft
      ? {
          kind: 'button',
          label: 'Modifică',
          icon: Pencil,
          pending: startDraft.isPending,
          onClick: () => void startDraftFromIssued(),
          testId: 'editor-phone-start-draft',
        }
      : editable && dirty
        ? {
            kind: 'button',
            label: 'Salvează',
            icon: Save,
            pending: saveDraft.isPending,
            onClick: () => void save(),
            testId: 'editor-phone-save',
          }
        : editable
          ? { kind: 'saved' }
          : null,
    items: [
      { kind: 'navigation' },
      {
        kind: 'action',
        label: 'Descarcă documentul Word',
        icon: Download,
        onSelect: () => void download(),
        testId: 'editor-phone-download',
      },
      {
        kind: 'action',
        label: printing ? 'Se pregătește…' : 'Tipărește',
        icon: Printer,
        disabled: printing,
        onSelect: () => void printShown(),
        testId: 'editor-phone-print',
      },
    ],
  };

  return (
    <div data-testid="document-editor-page" className="flex min-h-0 flex-1 flex-col gap-3">
      {startError && (
        <Notice variant="destructive" data-testid="editor-start-draft-error">
          Nu am putut porni o ciornă nouă. Verifică conexiunea și încearcă din nou.
        </Notice>
      )}
      {printError && (
        <Notice variant="destructive" data-testid="editor-print-error">
          {printError}
        </Notice>
      )}
      {saveError && (
        <Notice variant="destructive" data-testid="editor-save-error">
          {saveError}
        </Notice>
      )}
      <div data-testid="editor-frame" data-ready={ready} className={editorFrameClassName}>
        {!ready && <EditorPlaceholder back={back} />}
        <div className="h-full" aria-hidden={!ready} inert={!ready} {...replayMask}>
          <Suspense fallback={null}>
            <DocumentEditor
              key={loaded.revisionId}
              bytes={loaded.bytes}
              title={title}
              editable={editable}
              back={back}
              handle={editor}
              actions={actions}
              phoneBar={phoneBar}
              download={{ label: 'Descarcă documentul', onClick: () => void download() }}
              onReady={() => setReadyRevisionId(loaded.revisionId)}
              onChange={() => setDirty(true)}
              onSaveShortcut={() => void save()}
            />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
