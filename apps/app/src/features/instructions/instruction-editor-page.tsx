import { Badge } from '@ssm-usor/ui/components/badge';
import { Button } from '@ssm-usor/ui/components/button';
import { Link, useRouteContext } from '@tanstack/react-router';
import { ArrowLeft, Download } from 'lucide-react';
import { lazy, Suspense, useEffect, useState } from 'react';

import {
  downloadInstructionModule,
  getGetInstructionModuleQueryKey,
  getInstructionModuleVersion,
  useGetInstructionModule,
} from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import { useBackToList } from '@/app/use-back-to-list';
import { editorFrameClassName, saveAs } from '@/features/documents/editor-frame';
import { EditorPlaceholder } from '@/features/documents/editor-placeholder';
import { formatRoDate } from '@/lib/dates';

import { articleCountLabel, domainLabels, groupLabels } from './instruction-schema';

const DocumentEditor = lazy(() => import('@/features/documents/document-editor'));

type Loaded = { versionId: string; number: number; bytes: Uint8Array; fileName: string };

// Only to read: the version a document annexed (`pinnedVersionId`), or an archived module as its
// annex prints.
export function InstructionEditorPage({
  moduleId,
  userId,
  pinnedVersionId,
}: {
  moduleId: string;
  userId: string;
  pinnedVersionId?: string;
}) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const backToList = useBackToList();
  const query = useGetInstructionModule(moduleId, {
    request: apiRequest,
    query: { queryKey: [...getGetInstructionModuleQueryKey(moduleId), userId] },
  });
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [failedVersionId, setFailedVersionId] = useState<string | null>(null);
  const [readyVersionId, setReadyVersionId] = useState<string | null>(null);
  const [failedEditorVersionId, setFailedEditorVersionId] = useState<string | null>(null);

  const module = query.data?.module;
  const versionId = pinnedVersionId ?? module?.version.id;
  const currentNumber = module?.version.number;
  const pinned = pinnedVersionId !== undefined;
  const ready = versionId !== undefined && readyVersionId === versionId;
  const failed = versionId !== undefined && failedEditorVersionId === versionId;
  const loadError = versionId !== undefined && failedVersionId === versionId;

  useEffect(() => {
    if (!versionId || loaded?.versionId === versionId || failedVersionId === versionId) return;
    let cancelled = false;
    void (async () => {
      try {
        const [file, number] = await Promise.all([
          downloadInstructionModule(
            moduleId,
            pinnedVersionId ? { versionId: pinnedVersionId } : undefined,
            apiRequest
          ),
          pinnedVersionId
            ? getInstructionModuleVersion(moduleId, pinnedVersionId, apiRequest).then(
                (read) => read.version.number
              )
            : currentNumber!,
        ]);
        const bytes = new Uint8Array(await file.arrayBuffer());
        const fileName = file instanceof File ? file.name : 'Instrucțiune.docx';
        if (!cancelled) setLoaded({ versionId, number, bytes, fileName });
      } catch {
        if (!cancelled) setFailedVersionId(versionId);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    apiRequest,
    moduleId,
    pinnedVersionId,
    versionId,
    currentNumber,
    loaded?.versionId,
    failedVersionId,
  ]);

  function download() {
    if (loaded) saveAs(loaded.bytes, loaded.fileName);
  }

  const back = (
    <Button asChild variant="ghost" size="sm">
      <Link
        to={module?.domain === 'psi' ? '/instructions/psi' : '/instructions/ssm'}
        data-testid="editor-back"
        onClick={backToList}
        aria-label={pinned ? 'Înapoi' : 'Înapoi la instrucțiunile proprii'}
      >
        <ArrowLeft aria-hidden="true" />
        <span className="hidden sm:inline">{pinned ? 'Înapoi' : 'Instrucțiuni proprii'}</span>
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
            : 'Nu am putut încărca instrucțiunea. Verifică conexiunea și încearcă din nou.'}
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
    <div className="flex flex-wrap items-center gap-2 max-sm:flex-1">
      <Badge variant="default" data-testid="editor-state">
        {module.archivedAt && !pinned ? 'Arhivată' : `Versiunea ${loaded.number}`}
      </Badge>
      <span className="hidden text-xs text-muted-foreground md:inline">
        {domainLabels[module.domain]} · {groupLabels[module.group]} ·{' '}
        {articleCountLabel(module.version.articleCount).toLowerCase()}
      </span>
      <Button
        variant="outline"
        size="sm"
        data-testid="editor-download"
        className="max-sm:ml-auto"
        onClick={download}
      >
        <Download aria-hidden="true" />
        <span className="max-sm:sr-only">Descarcă</span>
      </Button>
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
            ? `Versiunea pe care o anexează documentul. Biblioteca are acum versiunea ${module.version.number}, din ${formatRoDate(module.version.createdAt.slice(0, 10))}. `
            : 'Versiunea pe care o anexează documentul. Este și versiunea curentă din bibliotecă. '}
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
        <p role="status" className="shrink-0 text-sm text-muted-foreground">
          Instrucțiunea e arhivată, așa că o poți doar citi, așa cum se tipărește. Reactiveaz-o din
          bibliotecă ca să o modifici.
        </p>
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
            Instrucțiunea nu a putut fi afișată. O poți descărca și citi în Word.
          </p>
          <Button className="w-fit" variant="outline" onClick={download}>
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
                editable={false}
                back={back}
                handle={null}
                actions={actions}
                onReady={() => setReadyVersionId(loaded.versionId)}
                onFailed={() => setFailedEditorVersionId(loaded.versionId)}
                onChange={() => {}}
                onSaveShortcut={() => {}}
              />
            </Suspense>
          </div>
        </div>
      )}
    </div>
  );
}
