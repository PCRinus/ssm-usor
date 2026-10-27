import { Badge } from '@ssm-usor/ui/components/badge';
import { Button } from '@ssm-usor/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@ssm-usor/ui/components/dropdown-menu';
import { TableCell, TableRow } from '@ssm-usor/ui/components/table';
import { Download, Lock, MoreHorizontal, Pencil, Trash2 } from 'lucide-react';

import { rowClickProps } from '@/components/data-table/row-click';

import { type ClientFile, fileKind, formatFileSize, formatUploadDate } from './client-file-format';

const unreadReason = (reason: string) =>
  reason.charAt(0).toLowerCase() + reason.slice(1).replace(/\.$/, '');

export function FileRow({
  file,
  changeable,
  showOwnersOnly,
  canSwitch,
  switching,
  onOpen,
  onDownload,
  onRename,
  onDelete,
  onOwnersOnly,
  depth = 0,
}: {
  file: ClientFile;
  depth?: number;
  changeable: boolean;
  showOwnersOnly: boolean;
  canSwitch: boolean;
  switching: boolean;
  onOpen: () => void;
  onDownload: () => void;
  onRename: () => void;
  onDelete: () => void;
  onOwnersOnly: (ownersOnly: boolean) => void;
}) {
  const kind = fileKind(file.mimeType);
  const Icon = kind.icon;
  const size = formatFileSize(file.sizeBytes);
  const date = formatUploadDate(file.createdAt);
  const uploader = file.uploadedBy ? (file.uploadedBy.fullName ?? 'Fără nume') : null;
  return (
    <TableRow
      data-testid="client-file-row"
      {...rowClickProps(onOpen)}
      className="cursor-pointer max-sm:grid max-sm:grid-cols-[minmax(0,1fr)_auto] max-sm:gap-x-2 max-sm:py-3"
    >
      <TableCell className="whitespace-normal max-sm:p-0">
        <div
          className="flex min-w-0 items-start gap-3"
          style={depth > 0 ? { paddingLeft: `${depth * 1.5}rem` } : undefined}
        >
          <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <div className="grid min-w-0 gap-1">
            <button
              type="button"
              data-testid="client-file-open"
              className="w-fit rounded-sm text-left font-medium wrap-anywhere underline-offset-4 outline-none hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50"
              onClick={onOpen}
            >
              {file.name}
            </button>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span data-testid="client-file-kind">{kind.label}</span>
              {file.importRead === false && (
                <>
                  <Badge variant="secondary" data-testid="client-file-unread">
                    Necitit
                  </Badge>
                  {file.importReason && <span>{unreadReason(file.importReason)}</span>}
                </>
              )}
              <span className="sm:hidden">· {size}</span>
              {showOwnersOnly && file.ownersOnly && (
                <Badge variant="secondary" data-testid="client-file-owners-only">
                  <Lock aria-hidden="true" />
                  Doar administratori
                </Badge>
              )}
              <span className="basis-full sm:hidden">
                {date}
                {uploader && `, ${uploader}`}
              </span>
            </div>
            {file.note && (
              <p
                data-testid="client-file-row-note"
                className="text-xs whitespace-pre-line text-muted-foreground wrap-anywhere"
              >
                {file.note}
              </p>
            )}
          </div>
        </div>
      </TableCell>
      <TableCell className="text-right align-top tabular-nums max-sm:hidden">{size}</TableCell>
      <TableCell className="align-top max-sm:hidden">
        <span className="tabular-nums">{date}</span>
        {uploader && (
          <span className="mt-0.5 block max-w-48 truncate text-xs text-muted-foreground">
            {uploader}
          </span>
        )}
      </TableCell>
      <TableCell className="align-top max-sm:col-start-2 max-sm:row-start-1 max-sm:p-0">
        <div className="flex gap-1 max-sm:justify-end">
          <Button
            variant="ghost"
            size="icon"
            data-testid="client-file-download"
            aria-label={`Descarcă ${file.name}`}
            title="Descarcă"
            onClick={onDownload}
          >
            <Download aria-hidden="true" />
          </Button>
          {changeable && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  data-testid="client-file-actions"
                  aria-label={`Acțiuni pentru ${file.name}`}
                >
                  <MoreHorizontal aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem data-testid="client-file-rename" onSelect={onRename}>
                  <Pencil aria-hidden="true" />
                  Redenumește
                </DropdownMenuItem>
                {canSwitch && (
                  <DropdownMenuCheckboxItem
                    data-testid="client-file-owners-only-switch"
                    checked={file.ownersOnly}
                    disabled={switching}
                    onCheckedChange={(checked) => onOwnersOnly(checked === true)}
                  >
                    Doar pentru administratori
                  </DropdownMenuCheckboxItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  data-testid="client-file-delete"
                  variant="destructive"
                  onSelect={onDelete}
                >
                  <Trash2 aria-hidden="true" />
                  Șterge
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </TableCell>
    </TableRow>
  );
}
