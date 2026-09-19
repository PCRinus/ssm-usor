import { Badge } from '@ssm-usor/ui/components/badge';
import { Button } from '@ssm-usor/ui/components/button';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import { toast } from '@ssm-usor/ui/lib/toast';
import { Link, useBlocker, useRouteContext } from '@tanstack/react-router';
import { ArrowLeft, Download, Save } from 'lucide-react';
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';

import {
  getDocumentDownload,
  getListClientDocumentsQueryKey,
  useListClientDocuments,
  useSaveDocumentDraftFile,
} from '../api/generated/api';
import { ApiHttpError } from '../api/http';
import type { DocumentEditorHandle } from './document-editor';

const DocumentEditor = lazy(() => import('./document-editor'));
const docxType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

type Loaded = { revisionId: string; bytes: Uint8Array; fileName: string };

function saveAs(bytes: Uint8Array, fileName: string) {
  const objectUrl = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: docxType }));
  const anchor = window.document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(objectUrl);
}

// One document in the in-app editor: the draft for editing, or the issued revision for
// reading when there is no draft. `readOnly` is an archived client.
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
  const saveDraft = useSaveDocumentDraftFile({ request: apiRequest });
  const editor = useRef<DocumentEditorHandle>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  // The revision whose file could not be fetched, so that another revision starts clean.
  const [failedRevisionId, setFailedRevisionId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const document = documents.data?.items.find((item) => item.id === documentId);
  const revision = document?.draft ?? document?.issued ?? null;
  const editable = !readOnly && document?.draft != null;
  const revisionId = revision?.id;
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

  // Leaving with unsaved changes asks first, inside the app and when closing the tab.
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
      await queryClient.invalidateQueries({ queryKey: getListClientDocumentsQueryKey(clientId) });
    } catch (cause) {
      setSaveError(
        cause instanceof ApiHttpError && cause.status === 409
          ? 'Ciorna nu mai există: a fost emisă sau ștearsă între timp. Descarcă fișierul ca să nu pierzi modificările.'
          : cause instanceof ApiHttpError && cause.status === 401
            ? 'Sesiunea nu mai este validă. Descarcă fișierul ca să nu pierzi modificările, apoi autentifică-te din nou.'
            : 'Nu am putut salva documentul. Verifică conexiunea și încearcă din nou.'
      );
    }
  }, [clientId, dirty, documentId, editable, queryClient, saveDraft]);

  // What is on screen, edits included, so that a failed save never costs the work.
  async function download() {
    if (!loaded) return;
    const current = ready ? await editor.current?.save() : null;
    saveAs(current ?? loaded.bytes, loaded.fileName);
  }

  const back = (
    <Button asChild variant="ghost" size="sm">
      <Link to="/clients/$clientId/documents" params={{ clientId }} data-testid="editor-back">
        <ArrowLeft aria-hidden="true" />
        Documente
      </Link>
    </Button>
  );

  if (documents.isPending || (revision && !loaded && !loadError)) {
    return (
      <div data-testid="editor-loading" className="grid gap-4" aria-busy="true">
        {back}
        <Skeleton className="h-[70vh] w-full" />
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
              void documents.refetch();
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
    <div data-testid="document-editor-page" className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {back}
        {!editable && (
          <p role="status" className="text-sm text-muted-foreground">
            {readOnly
              ? 'Clientul este arhivat: documentul poate fi doar citit.'
              : 'Un document emis nu se mai modifică. Pentru o corectură, generează-l din nou din listă.'}
          </p>
        )}
      </div>
      {saveError && (
        <p
          data-testid="editor-save-error"
          role="alert"
          className="rounded-md border border-destructive/30 p-3 text-sm text-destructive"
        >
          {saveError}
        </p>
      )}
      {failed ? (
        <div
          data-testid="editor-failed"
          role="alert"
          className="grid max-w-xl gap-4 rounded-lg border p-6"
        >
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
        // The editor fills its parent, which therefore needs a height of its own.
        <div
          data-testid="editor-frame"
          data-ready={ready}
          className="h-[calc(100vh-11rem)] min-h-[32rem] overflow-hidden rounded-lg border bg-background"
        >
          <Suspense fallback={<Skeleton className="h-full w-full" />}>
            <DocumentEditor
              key={loaded.revisionId}
              bytes={loaded.bytes}
              title={document.title}
              editable={editable}
              handle={editor}
              actions={actions}
              onReady={() => setReady(true)}
              onFailed={() => setFailed(true)}
              onChange={() => setDirty(true)}
              onSaveShortcut={() => void save()}
            />
          </Suspense>
        </div>
      )}
    </div>
  );
}
