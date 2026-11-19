import {
  type BuiltInDocumentTypeKey,
  type DocumentSet,
  documentSetTypeKeys,
  isDatedDocumentType,
} from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@ssm-usor/ui/components/dropdown-menu';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import { TableCell, TableRow } from '@ssm-usor/ui/components/table';
import { cn } from '@ssm-usor/ui/lib/utils';
import { useRouteContext } from '@tanstack/react-router';
import { ChevronDown, ChevronRight, Download, Sparkles } from 'lucide-react';
import { Fragment, useRef, useState } from 'react';

import {
  getListClientDocumentsQueryKey,
  getListDocumentsBehindQueryKey,
  useListClientDocuments,
  useListDocumentsBehind,
} from '@/api/generated/api';
import { LoadFailed } from '@/components/load-failed';
import { Notice } from '@/components/notice';
import { useFocusRequest } from '@/features/missing-data/focus';
import { endWayBack } from '@/features/missing-data/way-back';

import { behindInstructions } from './behind-labels';
import { DocumentConfirmDialog } from './document-confirm-dialog';
import { appliesAt, type ClientDocument, datedTitle } from './document-labels';
import { DocumentMissingRows } from './document-missing-rows';
import { type BehindRow, DocumentRow } from './document-row';
import type { SectionIdOf } from './document-sections';
import { documentRowId, setParams } from './document-sets';
import { GenerateDocumentsDialog } from './generate-documents-dialog';
import { isEmptyPack } from './pack-labels';
import { PackHeader, PackLayout } from './pack-layout';
import { MissingDocumentRow, PackTable } from './pack-rows';
import { buildPack, type PackSection } from './pack-status';
import { useDocumentActions } from './use-document-actions';

// `readOnly` is an archived client: what exists can still be downloaded.
export function DocumentsCard<Set extends DocumentSet>({
  set,
  clientId,
  userId,
  readOnly,
  section,
  focus,
}: {
  set: Set;
  clientId: string;
  userId: string;
  readOnly: boolean;
  section: SectionIdOf<Set> | undefined;
  focus?: 'generate' | BuiltInDocumentTypeKey;
}) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const documents = useListClientDocuments(clientId, setParams(set), {
    request: apiRequest,
    query: { queryKey: [...getListClientDocumentsQueryKey(clientId, setParams(set)), userId] },
  });
  const behind = useListDocumentsBehind({
    request: apiRequest,
    query: { queryKey: [...getListDocumentsBehindQueryKey(), userId], enabled: !readOnly },
  });
  const actions = useDocumentActions({ set, clientId });
  const { busy, archiving, confirming, setConfirming, error, fileInput, run } = actions;
  const [generating, setGenerating] = useState(false);
  const [unfoldedTypes, setUnfoldedTypes] = useState<ReadonlySet<string>>(new Set());

  const items = documents.data?.items ?? [];
  const behindTypes = behind.data?.items ?? [];
  const behindRows = new Map<string, BehindRow>(
    behindTypes.flatMap((type) =>
      type.clients
        .filter((client) => client.clientId === clientId)
        .map((client) => [client.documentId, { type, client }] as const)
    )
  );
  const existing = new Set(items.map((item) => item.typeKey));
  const notApplicable = new Set<string>(documents.data?.notApplicable);
  const typeKeys: readonly BuiltInDocumentTypeKey[] = documentSetTypeKeys[set];
  const lacking = typeKeys.filter((key) => !existing.has(key) && !notApplicable.has(key)).length;
  // A dated type can always be generated for another year while the client needs it.
  const dated = typeKeys.some(
    (key) => isDatedDocumentType(key) && appliesAt(key, documents.data?.currentEmployeeCount ?? 0)
  );
  const canGenerate = !readOnly && documents.isSuccess && (lacking > 0 || dated);
  const issuedPdfs = items.filter((item) => item.issued?.hasPdf).length;

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
  const focusedType = focus === 'generate' ? undefined : focus;
  useFocusRequest(focusedType !== undefined, {
    ready: !documents.isPending,
    field: focusedType && existing.has(focusedType) ? documentRowId(focusedType) : undefined,
  });
  const pack = documents.isSuccess
    ? buildPack({
        set,
        items,
        notApplicable: documents.data.notApplicable,
        isBehind: (document) => {
          const behindRow = behindRows.get(document.id);
          return (
            behindRow !== undefined &&
            (behindRow.client.behindTemplate || behindInstructions(behindRow.client))
          );
        },
      })
    : undefined;
  const empty = pack !== undefined && isEmptyPack(pack);

  function toggleEarlier(typeKey: string) {
    setUnfoldedTypes((current) => {
      const next = new Set(current);
      if (!next.delete(typeKey)) next.add(typeKey);
      return next;
    });
  }

  function documentRow(document: ClientDocument, title: string, rowId?: string) {
    return (
      <DocumentRow
        key={document.id}
        set={set}
        clientId={clientId}
        document={document}
        title={title}
        rowId={rowId}
        readOnly={readOnly}
        behindRow={behindRows.get(document.id)}
        behindTypes={behindTypes}
        actions={actions}
      />
    );
  }

  function sectionRows(shown: PackSection) {
    return (
      <PackTable>
        {shown.rows.map((row) => {
          if (row.kind === 'missing') return <MissingDocumentRow key={row.key} row={row} />;
          const { key, title, document, earlier } = row;
          const unfolded = earlier !== undefined && unfoldedTypes.has(key);
          return (
            <Fragment key={document.id}>
              {documentRow(document, title, documentRowId(document.typeKey))}
              {earlier !== undefined && earlier.length > 0 && (
                <TableRow data-testid="document-earlier">
                  <TableCell colSpan={4} className="py-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      data-testid="document-earlier-toggle"
                      aria-expanded={unfolded}
                      onClick={() => toggleEarlier(key)}
                    >
                      <ChevronRight
                        aria-hidden="true"
                        className={unfolded ? 'rotate-90' : undefined}
                      />
                      Anii anteriori ({earlier.length})
                    </Button>
                  </TableCell>
                </TableRow>
              )}
              {unfolded && earlier.map((each) => documentRow(each, datedTitle(each)))}
            </Fragment>
          );
        })}
      </PackTable>
    );
  }

  const generateLabel =
    items.length === 0
      ? 'Generează documentația'
      : lacking > 0
        ? 'Generează documentele lipsă'
        : 'Generează pentru alt an';
  const generateButton = canGenerate && (
    <Button
      ref={generateRef}
      data-testid="documents-generate"
      size={empty ? 'lg' : 'default'}
      className={cn(empty && 'max-sm:h-12')}
      onClick={openGenerate}
    >
      <Sparkles aria-hidden="true" />
      {generateLabel}
    </Button>
  );
  const packActions = (items.length > 0 || (canGenerate && !empty)) && (
    <>
      {items.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="secondary" data-testid="documents-archive" disabled={archiving}>
              <Download aria-hidden="true" />
              {archiving ? 'Se pregătește arhiva…' : 'Descarcă documentația'}
              <ChevronDown aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="max-w-80">
            <DropdownMenuItem
              data-testid="documents-archive-docx"
              className="grid gap-0.5"
              onSelect={() => void actions.downloadArchive('docx')}
            >
              <span>Arhivă cu fișierele Word</span>
              <span className="text-xs text-muted-foreground">
                Documentele emise și ciornele celor neemise încă
              </span>
            </DropdownMenuItem>
            <DropdownMenuItem
              data-testid="documents-archive-pdf"
              className="grid gap-0.5"
              disabled={issuedPdfs === 0}
              onSelect={() => void actions.downloadArchive('pdf')}
            >
              <span>Arhivă cu PDF-urile</span>
              <span className="text-xs text-muted-foreground">
                {issuedPdfs === 0
                  ? 'Niciun document emis încă'
                  : `Doar documentele emise: ${issuedPdfs} din ${items.length}`}
              </span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {!empty && generateButton}
    </>
  );
  const notices =
    typeof error === 'string' ? (
      <Notice variant="destructive" data-testid="documents-error">
        {error}
      </Notice>
    ) : (
      error && (
        <div data-testid="documents-refused" className="grid gap-4">
          <Notice variant="destructive" data-testid="documents-error">
            Nu am putut genera din nou „{error.document.title}”. Completează mai întâi:
          </Notice>
          <DocumentMissingRows
            clientId={clientId}
            userId={userId}
            typeKey={error.document.typeKey as BuiltInDocumentTypeKey}
            missing={error.missing}
            testId="documents-missing"
          />
        </div>
      )
    );

  return (
    <div data-testid="documents-card" className="flex flex-col">
      {pack ? (
        <PackLayout
          set={set}
          clientId={clientId}
          pack={pack}
          sectionId={section}
          readOnly={readOnly}
          actions={packActions || undefined}
          generate={empty ? generateButton : undefined}
          notices={notices || undefined}
        >
          {sectionRows}
        </PackLayout>
      ) : (
        <>
          <PackHeader set={set} />
          <div className="px-4 pb-6 sm:px-6">
            {documents.isError ? (
              <LoadFailed
                error={documents.error}
                busy={documents.isFetching}
                onRetry={() => void documents.refetch()}
              >
                Nu am putut încărca documentele.
              </LoadFailed>
            ) : (
              <Skeleton className="h-40 w-full" />
            )}
          </div>
        </>
      )}
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
          void actions.uploadFile(file);
        }}
      />
      <GenerateDocumentsDialog
        set={set}
        clientId={clientId}
        userId={userId}
        open={generating}
        lastGeneration={documents.data?.lastGeneration ?? null}
        generatedTypeKeys={items
          .filter((item) => item.draft || item.issued)
          .map((item) => item.typeKey)}
        onClose={() => setGenerating(false)}
      />
      {confirming && (
        <DocumentConfirmDialog
          confirming={confirming}
          busy={busy}
          onConfirm={() => run(confirming)}
          onClose={() => setConfirming(null)}
        />
      )}
    </div>
  );
}
