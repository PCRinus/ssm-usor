import { Button } from '@ssm-usor/ui/components/button';
import { TableCell, TableRow } from '@ssm-usor/ui/components/table';
import { BookOpen, ChevronDown, ChevronRight, Plus } from 'lucide-react';
import { type ReactNode, useState } from 'react';

import { replayMask } from '@/app/observability/replay-masking';

import {
  type ClientFile,
  fileCountLabel,
  formatFileSize,
  formatUploadDate,
} from './client-file-format';
import { groupTitle } from './earlier-instructions';

const byDomainThenDay = (a: ClientFile, b: ClientFile) =>
  (a.earlierInstructions?.domain ?? '').localeCompare(b.earlierInstructions?.domain ?? '') ||
  (a.earlierInstructions?.validUntil ?? '').localeCompare(b.earlierInstructions?.validUntil ?? '');

export function EarlierInstructionsRows({
  files,
  onAdd,
  renderFile,
}: {
  files: ClientFile[];
  onAdd: (() => void) | null;
  renderFile: (file: ClientFile, depth: number) => ReactNode;
}) {
  const [open, setOpen] = useState(true);
  const latest = files.reduce((newest, file) =>
    file.createdAt > newest.createdAt ? file : newest
  );
  const uploader = latest.uploadedBy?.fullName ?? null;
  return (
    <>
      <TableRow data-testid="earlier-instructions-group" className="bg-muted/40 hover:bg-muted/60">
        <TableCell className="min-w-56 whitespace-normal">
          <div className="flex min-w-0 items-start gap-2">
            <Button
              variant="ghost"
              size="icon-sm"
              className="-my-1 size-7"
              aria-expanded={open}
              aria-label={open ? `Restrânge ${groupTitle}` : `Deschide ${groupTitle}`}
              data-testid="earlier-instructions-group-toggle"
              onClick={() => setOpen(!open)}
            >
              {open ? <ChevronDown aria-hidden="true" /> : <ChevronRight aria-hidden="true" />}
            </Button>
            <BookOpen className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <div className="grid min-w-0 gap-0.5">
              <span className="font-medium">
                {groupTitle} · {fileCountLabel(files.length)}
              </span>
              <span className="text-xs text-muted-foreground">
                Instrucțiunile la care trimit instruirile preluate de pe hârtie. Nu intră în
                documentele generate.
              </span>
            </div>
          </div>
        </TableCell>
        <TableCell className="text-right align-top tabular-nums">
          {formatFileSize(files.reduce((total, file) => total + file.sizeBytes, 0))}
        </TableCell>
        <TableCell className="align-top">
          <span className="tabular-nums">{formatUploadDate(latest.createdAt)}</span>
          {uploader && (
            <span
              className="mt-0.5 block max-w-48 truncate text-xs text-muted-foreground"
              {...replayMask}
            >
              {uploader}
            </span>
          )}
        </TableCell>
        <TableCell className="align-top">
          {onAdd && (
            <Button
              variant="outline"
              size="sm"
              data-testid="earlier-instructions-group-add"
              aria-label={`Adaugă ${groupTitle.toLowerCase()}`}
              onClick={onAdd}
            >
              <Plus aria-hidden="true" />
              Adaugă
            </Button>
          )}
        </TableCell>
      </TableRow>
      {open && [...files].sort(byDomainThenDay).map((file) => renderFile(file, 1))}
    </>
  );
}
