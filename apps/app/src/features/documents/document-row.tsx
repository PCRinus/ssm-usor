import type { DocumentSet } from '@ssm-usor/contracts';
import { Badge } from '@ssm-usor/ui/components/badge';
import { Button } from '@ssm-usor/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@ssm-usor/ui/components/dropdown-menu';
import { TableCell, TableRow } from '@ssm-usor/ui/components/table';
import { Link, useNavigate } from '@tanstack/react-router';
import {
  Download,
  Eye,
  FileDown,
  FilePenLine,
  MoreHorizontal,
  Printer,
  RefreshCw,
  SquarePen,
  Stamp,
  Trash2,
  Upload,
} from 'lucide-react';

import {
  type DocumentsBehindResponseItemsItem,
  type DocumentsBehindResponseItemsItemClientsItem,
  getDocumentDownload,
} from '@/api/generated/api';
import { useApi } from '@/api/use-api';
import { openedHere } from '@/app/opener';
import { rowClickProps } from '@/components/data-table/row-click';
import { FileMenuItem } from '@/components/file-menu-item';
import { formatRoDate } from '@/lib/dates';

import { AnnexRow } from './annex-row';
import { behindInstructions, instructionChangesHint, templateReason } from './behind-labels';
import type { ClientDocument } from './document-labels';
import { builtFromDataNote, documentLink, documentSetCopy } from './document-sets';
import { NumberedTitle } from './pack-rows';
import { packCells, warningBadge } from './pack-styles';
import type { DocumentActions, Revision } from './use-document-actions';

export type BehindRow = {
  type: DocumentsBehindResponseItemsItem;
  client: DocumentsBehindResponseItemsItemClientsItem;
};

const menuLabel = 'text-xs text-muted-foreground';

function newerTemplateHint({ version, note }: { version: number; note: string | null }) {
  const change = note ? `: ${note.replace(/[.!]?$/, '.')}` : '.';
  return `Versiunea ${version} a șablonului${change} Generează documentul din nou ca să o preia.`;
}

export function DocumentRow({
  set,
  clientId,
  document,
  number,
  title,
  rowId,
  readOnly,
  behindRow,
  behindTypes,
  actions,
}: {
  set: DocumentSet;
  clientId: string;
  document: ClientDocument;
  number: string | null;
  title: string;
  rowId?: string;
  readOnly: boolean;
  behindRow: BehindRow | undefined;
  behindTypes: readonly DocumentsBehindResponseItemsItem[];
  actions: DocumentActions;
}) {
  const navigate = useNavigate();
  const { request: apiRequest } = useApi();
  const { busy, printing, setConfirming } = actions;
  const current = document.draft ?? document.issued;
  const editable = document.editable;
  const click = rowClickProps(
    () =>
      void navigate({
        ...documentLink(set, clientId, document.id),
        state: openedHere,
      })
  );
  const fileOf = (revision: Revision, format: 'docx' | 'pdf') => ({
    queryKey: ['document-file', document.id, revision.id, format],
    load: (signal: AbortSignal) =>
      getDocumentDownload(document.id, revision.id, { format }, { ...apiRequest, signal }),
  });
  return (
    <>
      <TableRow id={rowId} data-testid="document-row" {...click} className={click.className}>
        <TableCell className={packCells.title}>
          <NumberedTitle number={number}>
            <Link
              {...documentLink(set, clientId, document.id)}
              state={openedHere}
              data-testid="document-title"
              className="font-medium underline-offset-4 hover:underline"
            >
              {title}
            </Link>
            {document.decisionNumber !== null && (
              <span className="block text-xs text-muted-foreground">
                Decizia nr. {document.decisionNumber} {documentSetCopy[set].name}
              </span>
            )}
            {!editable && (
              <span
                data-testid="document-built-from-data"
                className="block text-xs text-muted-foreground"
              >
                {builtFromDataNote}
              </span>
            )}
          </NumberedTitle>
        </TableCell>
        <TableCell className={packCells.status}>
          <span className="flex flex-wrap gap-1.5">
            {document.issued && (
              <Badge data-testid="document-issued">Emis · rev. {document.issued.revision}</Badge>
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
                className={warningBadge}
                data-testid="document-data-changed"
                title="Datele clientului s-au schimbat de când a fost generată ciorna. Generează documentul din nou ca să le preia."
              >
                Date modificate
              </Badge>
            )}
            {behindRow?.client.behindTemplate && (
              <Badge
                variant="outline"
                className={warningBadge}
                data-testid="document-behind"
                title={newerTemplateHint(
                  templateReason(behindRow.type.pendingVersions, behindRow.client.version)
                    ?.reason ?? behindRow.type.newestVersion
                )}
              >
                Șablon actualizat
              </Badge>
            )}
            {behindRow && behindInstructions(behindRow.client) && (
              <>
                <Badge
                  variant="outline"
                  className={warningBadge}
                  data-testid="document-instructions-behind"
                >
                  Instrucțiuni actualizate
                </Badge>
                <span
                  data-testid="document-instructions-behind-reason"
                  className="min-w-64 max-w-md basis-full text-xs whitespace-normal text-muted-foreground"
                >
                  {instructionChangesHint(document.typeKey, behindRow.client, behindTypes)}
                </span>
              </>
            )}
          </span>
        </TableCell>
        <TableCell className={packCells.date}>
          {current?.issueDate ? formatRoDate(current.issueDate) : '—'}
        </TableCell>
        <TableCell className={packCells.actions}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                data-testid="document-actions"
                aria-label={`Acțiuni pentru ${title}`}
              >
                <MoreHorizontal aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem asChild data-testid="document-open">
                <Link {...documentLink(set, clientId, document.id)} state={openedHere}>
                  {document.draft && !readOnly && editable ? (
                    <>
                      <SquarePen aria-hidden="true" />
                      Deschide și modifică
                    </>
                  ) : (
                    <>
                      <Eye aria-hidden="true" />
                      Deschide
                    </>
                  )}
                </Link>
              </DropdownMenuItem>
              {document.draft && (
                <DropdownMenuGroup aria-labelledby={`${document.id}-draft-label`}>
                  <DropdownMenuLabel id={`${document.id}-draft-label`} className={menuLabel}>
                    Ciorna · rev. {document.draft.revision}
                  </DropdownMenuLabel>
                  {!readOnly && (
                    <DropdownMenuItem
                      data-testid="document-issue"
                      onSelect={() => setConfirming({ action: 'issue', document })}
                    >
                      <Stamp aria-hidden="true" />
                      Emite
                    </DropdownMenuItem>
                  )}
                  {document.draft.annexes.length > 0 ? (
                    <DropdownMenuItem
                      data-testid="document-download-draft"
                      onSelect={() => void actions.download(document, document.draft!)}
                    >
                      <Download aria-hidden="true" />
                      Descarcă Word
                    </DropdownMenuItem>
                  ) : (
                    <FileMenuItem
                      testId="document-download-draft"
                      apiRequest={apiRequest}
                      disposition="attachment"
                      {...fileOf(document.draft, 'docx')}
                    >
                      <Download aria-hidden="true" />
                      Descarcă Word
                    </FileMenuItem>
                  )}
                  <DropdownMenuItem
                    data-testid="document-print-draft"
                    disabled={printing}
                    onSelect={() => void actions.printRevision(document, document.draft!)}
                  >
                    <Printer aria-hidden="true" />
                    Tipărește
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              )}
              {document.issued && (
                <DropdownMenuGroup aria-labelledby={`${document.id}-issued-label`}>
                  <DropdownMenuLabel id={`${document.id}-issued-label`} className={menuLabel}>
                    Documentul emis · rev. {document.issued.revision}
                  </DropdownMenuLabel>
                  {document.issued.annexes.length > 0 ? (
                    <DropdownMenuItem
                      data-testid="document-download-issued"
                      onSelect={() => void actions.download(document, document.issued!)}
                    >
                      <Download aria-hidden="true" />
                      Descarcă Word
                    </DropdownMenuItem>
                  ) : (
                    <FileMenuItem
                      testId="document-download-issued"
                      apiRequest={apiRequest}
                      disposition="attachment"
                      {...fileOf(document.issued, 'docx')}
                    >
                      <Download aria-hidden="true" />
                      Descarcă Word
                    </FileMenuItem>
                  )}
                  {document.issued.hasPdf && (
                    <FileMenuItem
                      testId="document-open-pdf"
                      apiRequest={apiRequest}
                      disposition="inline"
                      {...fileOf(document.issued, 'pdf')}
                    >
                      <FileDown aria-hidden="true" />
                      Deschide PDF
                    </FileMenuItem>
                  )}
                  <DropdownMenuItem
                    data-testid="document-print-issued"
                    disabled={printing}
                    onSelect={() => void actions.printRevision(document, document.issued!)}
                  >
                    <Printer aria-hidden="true" />
                    Tipărește
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              )}
              {!readOnly && (
                <>
                  <DropdownMenuSeparator />
                  {editable && document.issued && !document.draft && (
                    <DropdownMenuItem
                      data-testid="document-start-draft"
                      disabled={busy}
                      onSelect={() => void actions.startDraftFromIssued(document)}
                    >
                      <FilePenLine aria-hidden="true" />
                      Modifică documentul emis
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem
                    data-testid="document-regenerate"
                    onSelect={() => setConfirming({ action: 'regenerate', document })}
                  >
                    <RefreshCw aria-hidden="true" />
                    Generează din nou
                  </DropdownMenuItem>
                  {editable && (
                    <DropdownMenuItem
                      data-testid="document-upload"
                      onSelect={() =>
                        document.draft
                          ? setConfirming({ action: 'upload', document })
                          : actions.chooseFile(document.typeKey, title, document.period)
                      }
                    >
                      <Upload aria-hidden="true" />
                      Încarcă un fișier Word
                    </DropdownMenuItem>
                  )}
                  {document.draft && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        data-testid="document-delete-draft"
                        variant="destructive"
                        onSelect={() => setConfirming({ action: 'delete', document })}
                      >
                        <Trash2 aria-hidden="true" />
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
          typeKey={document.typeKey}
          indent={number === null ? 'pl-5' : 'pl-17'}
          onDownload={() => void actions.downloadAnnex(document, current, annex)}
        />
      ))}
    </>
  );
}
