import { Badge } from '@ssm-usor/ui/components/badge';
import { Button } from '@ssm-usor/ui/components/button';
import { toast } from '@ssm-usor/ui/lib/toast';
import { Link, useBlocker, useRouteContext } from '@tanstack/react-router';
import { ArrowLeft, Download, Save } from 'lucide-react';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';

import {
  getGetInstructionModuleQueryKey,
  getInstructionModuleFileLink,
  useGetInstructionModule,
  useSaveInstructionModuleFile,
} from '../api/generated/api';
import { ApiHttpError } from '../api/http';
import { Notice } from '../components/notice';
import { useBackToList } from '../components/use-back-to-list';
import type { DocumentEditorHandle } from '../documents/document-editor';
import { editorFrameClassName, saveAs } from '../documents/editor-frame';
import { EditorPlaceholder } from '../documents/editor-placeholder';
import { formatRoDate } from '../lib/dates';
import { articleCountLabel, groupLabels, invalidateLibrary } from './instruction-schema';

const DocumentEditor = lazy(() => import('../documents/document-editor'));
const docxType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

type Loaded = { versionId: string; number: number; bytes: Uint8Array; fileName: string };

// One instruction module in the editor (ADR 012). Every save is the next version of the
// file; the versions documents annexed before stay as they were. `pinnedVersionId` is one of
// those, opened from a document: it is shown as the document annexed it, and only read.
export function InstructionEditorPage({
  moduleId,
  userId,
  pinnedVersionId,
}: {
  moduleId: string;
  userId: string;
  pinnedVersionId?: string;
}) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const backToList = useBackToList();
  const query = useGetInstructionModule(moduleId, {
    request: apiRequest,
    query: { queryKey: [...getGetInstructionModuleQueryKey(moduleId), userId] },
  });
  const saveFile = useSaveInstructionModuleFile({ request: apiRequest });
  const editor = useRef<DocumentEditorHandle>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failedVersionId, setFailedVersionId] = useState<string | null>(null);
  const [readyVersionId, setReadyVersionId] = useState<string | null>(null);
  const [failedEditorVersionId, setFailedEditorVersionId] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const module = query.data?.module;
  const versionId = pinnedVersionId ?? module?.version.id;
  const pinned = pinnedVersionId !== undefined;
  const editable = !pinned && module != null && module.archivedAt === null;
  const ready = versionId !== undefined && readyVersionId === versionId;
  const failed = versionId !== undefined && failedEditorVersionId === versionId;
  const loadError = versionId !== undefined && failedVersionId === versionId;

  // The file of the version, once per version: saving loads the next one.
  useEffect(() => {
    if (!versionId || loaded?.versionId === versionId || failedVersionId === versionId) return;
    let cancelled = false;
    void (async () => {
      try {
        const link = await getInstructionModuleFileLink(
          moduleId,
          pinnedVersionId ? { versionId: pinnedVersionId } : undefined,
          apiRequest
        );
        const response = await fetch(link.url);
        if (!response.ok) throw new Error(`Download failed (${response.status}).`);
        const bytes = new Uint8Array(await response.arrayBuffer());
        if (!cancelled) {
          setLoaded({ versionId, number: link.version.number, bytes, fileName: link.fileName });
        }
      } catch {
        if (!cancelled) setFailedVersionId(versionId);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [apiRequest, moduleId, pinnedVersionId, versionId, loaded?.versionId, failedVersionId]);

  useBlocker({
    shouldBlockFn: () =>
      dirty && !window.confirm('Ai modificări nesalvate. Părăsești pagina fără să le salvezi?'),
    enableBeforeUnload: () => dirty,
  });

  async function save() {
    if (!editable || !dirty || saveFile.isPending) return;
    setSaveError(null);
    try {
      const bytes = await editor.current?.save();
      if (!bytes) throw new Error('The editor returned no document.');
      const { module: saved } = await saveFile.mutateAsync({
        moduleId,
        data: new Blob([new Uint8Array(bytes)], { type: docxType }),
      });
      setDirty(false);
      // What the editor shows is the new version; nothing to fetch again.
      setLoaded({
        versionId: saved.version.id,
        number: saved.version.number,
        bytes,
        fileName: loaded?.fileName ?? '',
      });
      setReadyVersionId(saved.version.id);
      toast.success(`Instrucțiunea a fost salvată ca versiunea ${saved.version.number}.`);
      await invalidateLibrary(queryClient);
    } catch (cause) {
      setSaveError(
        cause instanceof ApiHttpError && cause.status === 409
          ? 'Instrucțiunea a fost arhivată între timp. Descarcă fișierul ca să nu pierzi modificările.'
          : cause instanceof ApiHttpError && cause.status === 401
            ? 'Sesiunea nu mai este validă. Descarcă fișierul ca să nu pierzi modificările, apoi autentifică-te din nou.'
            : 'Nu am putut salva instrucțiunea. Verifică conexiunea și încearcă din nou.'
      );
    }
  }

  async function download() {
    if (!loaded) return;
    const current = ready ? await editor.current?.save() : null;
    saveAs(current ?? loaded.bytes, loaded.fileName);
  }

  const back = (
    <Button asChild variant="ghost" size="sm">
      <Link
        to="/instructions"
        data-testid="editor-back"
        onClick={backToList}
        aria-label={pinned ? 'Înapoi' : 'Înapoi la bibliotecă'}
      >
        <ArrowLeft aria-hidden="true" />
        <span className="hidden sm:inline">{pinned ? 'Înapoi' : 'Instrucțiuni'}</span>
      </Link>
    </Button>
  );

  if (query.isPending || (module && !loaded && !loadError)) {
    return (
      <div data-testid="editor-frame" className={editorFrameClassName}>
        <EditorPlaceholder back={back} />
      </div>
    );
  }
  if (query.isError || loadError || !module || !loaded) {
    return (
      <div data-testid="editor-unavailable" role="alert" className="grid max-w-lg gap-4 py-10">
        <h1 className="text-2xl font-semibold">Instrucțiunea nu a putut fi deschisă</h1>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {query.isError && query.error instanceof ApiHttpError && query.error.status === 404
            ? 'Instrucțiunea nu există în bibliotecă.'
            : 'Nu am putut încărca fișierul. Verifică conexiunea și încearcă din nou.'}
        </p>
        <div className="flex gap-2">
          {back}
          <Button
            variant="outline"
            onClick={() => {
              setFailedVersionId(null);
              void query.refetch();
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
        {pinned
          ? `Versiunea ${loaded.number}`
          : module.archivedAt
            ? 'Arhivată'
            : `Versiunea ${module.version.number}`}
      </Badge>
      <span className="hidden text-xs text-muted-foreground md:inline">
        {groupLabels[module.group]} · {articleCountLabel(module.version.articleCount).toLowerCase()}
      </span>
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
          disabled={!dirty || saveFile.isPending}
          onClick={() => void save()}
        >
          <Save aria-hidden="true" />
          {saveFile.isPending ? 'Se salvează…' : 'Salvează'}
        </Button>
      )}
    </div>
  );

  return (
    <div data-testid="instruction-editor-page" className="flex min-h-0 flex-1 flex-col gap-3">
      {pinned ? (
        <p
          role="status"
          data-testid="editor-pinned-version"
          className="shrink-0 text-sm text-muted-foreground"
        >
          {module.version.number > loaded.number
            ? `Versiunea pe care o anexează documentul, care poate fi doar citită. Biblioteca are acum versiunea ${module.version.number}, din ${formatRoDate(module.version.createdAt.slice(0, 10))}. `
            : 'Versiunea pe care o anexează documentul, care poate fi doar citită. Este și versiunea curentă din bibliotecă. '}
          <Link
            to="/instructions/$moduleId"
            params={{ moduleId }}
            data-testid="editor-open-current"
            className="font-medium text-foreground underline underline-offset-4"
          >
            {module.version.number > loaded.number
              ? 'Deschide versiunea curentă'
              : 'Deschide în bibliotecă'}
          </Link>
        </p>
      ) : (
        !editable && (
          <p role="status" className="shrink-0 text-sm text-muted-foreground">
            O instrucțiune arhivată poate fi doar citită. Restaureaz-o din bibliotecă pentru a o
            modifica.
          </p>
        )
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
          <h1 className="text-lg font-semibold">{module.title}</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Acest fișier are o așezare în pagină pe care editorul din aplicație nu o poate afișa.
            Descarcă-l, modifică-l în Word și încarcă-l din nou; documentele îl anexează așa cum
            este.
          </p>
          <Button className="w-fit" variant="outline" onClick={() => void download()}>
            <Download aria-hidden="true" />
            Descarcă fișierul
          </Button>
        </div>
      ) : (
        <div data-testid="editor-frame" data-ready={ready} className={editorFrameClassName}>
          {!ready && <EditorPlaceholder back={back} />}
          <div className="h-full" aria-hidden={!ready} inert={!ready}>
            <Suspense fallback={null}>
              <DocumentEditor
                key={loaded.versionId}
                bytes={loaded.bytes}
                title={module.title}
                editable={editable}
                back={back}
                handle={editor}
                actions={actions}
                onReady={() => setReadyVersionId(loaded.versionId)}
                onFailed={() => setFailedEditorVersionId(loaded.versionId)}
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
