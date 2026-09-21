import { Badge } from '@ssm-usor/ui/components/badge';
import { Button } from '@ssm-usor/ui/components/button';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import { toast } from '@ssm-usor/ui/lib/toast';
import { Link, useBlocker, useRouteContext } from '@tanstack/react-router';
import { ArrowLeft, Download, LoaderCircle, Pencil, Save } from 'lucide-react';
import { lazy, type ReactNode, Suspense, useCallback, useEffect, useRef, useState } from 'react';

import {
  getDocumentDownload,
  getListClientDocumentsQueryKey,
  useListClientDocuments,
  useSaveDocumentDraftFile,
  useStartDocumentDraft,
} from '../api/generated/api';
import { ApiHttpError } from '../api/http';
import { Notice } from '../components/notice';
import type { DocumentEditorHandle } from './document-editor';
import type { ClientDocument } from './document-labels';

const DocumentEditor = lazy(() => import('./document-editor'));
const docxType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const editorFrameClassName =
  'relative min-h-0 flex-1 overflow-hidden rounded-lg border bg-background';

type Loaded = { revisionId: string; bytes: Uint8Array; fileName: string };

function saveAs(bytes: Uint8Array, fileName: string) {
  const objectUrl = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: docxType }));
  const anchor = window.document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(objectUrl);
}

function EditorPlaceholder({ back }: { back: ReactNode }) {
  return (
    <div
      data-testid="editor-loading"
      className="absolute inset-0 z-10 flex min-h-0 flex-col bg-background"
      aria-busy="true"
    >
      <div className="flex h-12 shrink-0 items-center border-b px-3">{back}</div>
      <div className="flex h-11 shrink-0 items-center gap-3 border-b px-4" aria-hidden="true">
        <Skeleton className="h-5 w-24 motion-reduce:animate-none" />
        <Skeleton className="h-5 w-16 motion-reduce:animate-none" />
        <Skeleton className="hidden h-5 w-32 motion-reduce:animate-none sm:block" />
      </div>
      <div className="relative min-h-0 flex-1 overflow-hidden bg-muted/30 px-4 py-5 sm:px-8">
        <div
          className="mx-auto aspect-[210/297] w-full max-w-[44rem] rounded-sm border bg-card p-7 shadow-sm sm:p-12"
          aria-hidden="true"
        >
          <Skeleton className="mb-10 h-5 w-2/3 motion-reduce:animate-none" />
          <div className="space-y-3">
            <Skeleton className="h-3 w-full motion-reduce:animate-none" />
            <Skeleton className="h-3 w-11/12 motion-reduce:animate-none" />
            <Skeleton className="h-3 w-4/5 motion-reduce:animate-none" />
            <Skeleton className="h-3 w-full motion-reduce:animate-none" />
            <Skeleton className="h-3 w-3/4 motion-reduce:animate-none" />
          </div>
        </div>
        <div className="absolute inset-0 flex items-center justify-center p-4">
          <div
            role="status"
            className="flex items-center gap-3 rounded-lg border bg-background/95 px-5 py-3 text-sm shadow-sm"
          >
            <LoaderCircle
              data-testid="editor-loading-spinner"
              className="size-5 shrink-0 animate-spin text-primary motion-reduce:animate-none"
              aria-hidden="true"
            />
            <span>Se deschide documentul…</span>
          </div>
        </div>
      </div>
    </div>
  );
}

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
}

// `readOnly` is an archived client.
export function DocumentEditorPage({
  clientId,
  documentId,
  userId,
  readOnly,
}: {
  clientId: string;
  documentId: string;
  userId: string;
  readOnly: boolean;
}) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const documents = useListClientDocuments(clientId, {
    request: apiRequest,
    query: { queryKey: [...getListClientDocumentsQueryKey(clientId), userId] },
  });
  return (
    <DocumentEditorView
      readOnly={readOnly}
      source={{
        document: documents.data?.items.find((item) => item.id === documentId),
        isPending: documents.isPending,
        isError: documents.isError,
        isSuccess: documents.isSuccess,
        refetch: () => void documents.refetch(),
        invalidate: () =>
          queryClient.invalidateQueries({ queryKey: getListClientDocumentsQueryKey(clientId) }),
        back: (
          <Button asChild variant="ghost" size="sm">
            <Link
              to="/clients/$clientId/documents"
              params={{ clientId }}
              data-testid="editor-back"
              aria-label="Înapoi la documente"
            >
              <ArrowLeft aria-hidden="true" />
              <span className="hidden sm:inline">Documente</span>
            </Link>
          </Button>
        ),
      }}
    />
  );
}

export function DocumentEditorView({
  source,
  readOnly,
}: {
  source: DocumentSource;
  readOnly: boolean;
}) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const documents = source;
  const { document, back } = source;
  const documentId = document?.id ?? '';
  const saveDraft = useSaveDocumentDraftFile({ request: apiRequest });
  const startDraft = useStartDocumentDraft({ request: apiRequest });
  const editor = useRef<DocumentEditorHandle>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  // The revision whose file could not be fetched, so that another revision starts clean.
  const [failedRevisionId, setFailedRevisionId] = useState<string | null>(null);
  const [readyRevisionId, setReadyRevisionId] = useState<string | null>(null);
  const [failedEditorRevisionId, setFailedEditorRevisionId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [startError, setStartError] = useState(false);

  const revision = document?.draft ?? document?.issued ?? null;
  const editable = !readOnly && document?.draft != null;
  const canStartDraft = !readOnly && document != null && !document.draft && document.issued != null;
  const revisionId = revision?.id;
  const ready = revisionId !== undefined && readyRevisionId === revisionId;
  const failed = revisionId !== undefined && failedEditorRevisionId === revisionId;
  const loadError = revisionId !== undefined && failedRevisionId === revisionId;

  // The file of the revision, once per revision: saving does not fetch it again.
  useEffect(() => {
    if (!revisionId || loaded?.revisionId === revisionId || failedRevisionId === revisionId) return;
    let cancelled = false;
    void (async () => {
      try {
        const link = await getDocumentDownload(documentId, revisionId, undefined, apiRequest);
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
  }, [apiRequest, documentId, revisionId, loaded?.revisionId, failedRevisionId]);

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
            : 'Nu am putut salva documentul. Verifică conexiunea și încearcă din nou.'
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
        <h1 className="text-2xl font-semibold">Documentul nu a putut fi deschis</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {documents.isSuccess && (!document || !revision)
            ? 'Documentul nu există sau nu mai are nicio revizie.'
            : 'Nu am putut încărca fișierul. Verifică conexiunea și încearcă din nou.'}
        </p>
        <div className="flex gap-2">
          {back}
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
    <div className="flex items-center gap-2">
      <Badge variant={editable ? 'secondary' : 'default'} data-testid="editor-state">
        {document.draft
          ? `Ciornă · rev. ${document.draft.revision}`
          : `Emis · rev. ${revision.revision}`}
      </Badge>
      {editable && (
        <span data-testid="editor-saved-state" className="text-xs text-muted-foreground">
          {dirty ? 'Modificări nesalvate' : 'Salvat'}
        </span>
      )}
      <Button
        variant="outline"
        size="sm"
        data-testid="editor-download"
        onClick={() => void download()}
      >
        <Download aria-hidden="true" />
        Descarcă
      </Button>
      {canStartDraft && (
        <Button
          size="sm"
          data-testid="editor-start-draft"
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

  return (
    <div data-testid="document-editor-page" className="flex min-h-0 flex-1 flex-col gap-3">
      {!editable && (
        <p role="status" className="shrink-0 text-sm text-muted-foreground">
          {readOnly
            ? 'Clientul este arhivat: documentul poate fi doar citit.'
            : 'Un document emis nu se mai schimbă. „Modifică” pornește din el o ciornă nouă, iar el rămâne în vigoare până o emiți.'}
        </p>
      )}
      {startError && (
        <Notice variant="destructive" data-testid="editor-start-draft-error">
          Nu am putut porni o ciornă nouă. Verifică conexiunea și încearcă din nou.
        </Notice>
      )}
      {saveError && (
        <Notice variant="destructive" data-testid="editor-save-error">
          {saveError}
        </Notice>
      )}
      {failed ? (
        <div
          data-testid="editor-failed"
          role="alert"
          className="grid max-w-xl gap-4 rounded-lg border p-6"
        >
          <div className="flex justify-start">{back}</div>
          <h1 className="text-lg font-semibold">{document.title}</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Acest document are o așezare în pagină pe care editorul din aplicație nu o poate afișa.
            Descarcă-l, modifică-l în Word și păstrează-l; conținutul lui nu este afectat.
          </p>
          <Button className="w-fit" variant="outline" onClick={() => void download()}>
            <Download aria-hidden="true" />
            Descarcă documentul
          </Button>
        </div>
      ) : (
        <div data-testid="editor-frame" data-ready={ready} className={editorFrameClassName}>
          {!ready && <EditorPlaceholder back={back} />}
          <div className="h-full" aria-hidden={!ready} inert={!ready}>
            <Suspense fallback={null}>
              <DocumentEditor
                key={loaded.revisionId}
                bytes={loaded.bytes}
                title={document.title}
                editable={editable}
                back={back}
                handle={editor}
                actions={actions}
                onReady={() => setReadyRevisionId(loaded.revisionId)}
                onFailed={() => setFailedEditorRevisionId(loaded.revisionId)}
                onChange={() => setDirty(true)}
                onSaveShortcut={() => void save()}
              />
            </Suspense>
          </div>
        </div>
      )}
    </div>
  );
}
