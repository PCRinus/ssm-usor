import { documentNumberOf } from '@ssm-usor/contracts';
import { Badge } from '@ssm-usor/ui/components/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ssm-usor/ui/components/table';
import { cn } from '@ssm-usor/ui/lib/utils';
import type { ReactNode } from 'react';

import type { PackRow } from './pack-status';
import { packCells } from './pack-styles';

export function PackTable({ children }: { children: ReactNode }) {
  return (
    <Table data-testid="pack-table" className="md:table-fixed">
      <TableHeader>
        <TableRow>
          <TableHead className="px-3">Document</TableHead>
          <TableHead className="w-66 px-3">Stare</TableHead>
          <TableHead className="w-37 px-3">Data documentului</TableHead>
          <TableHead className="w-11">
            <span className="sr-only">Acțiuni</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>{children}</TableBody>
    </Table>
  );
}

export function NumberedTitle({
  number,
  children,
}: {
  number: string | null;
  children: ReactNode;
}) {
  if (number === null) return <div>{children}</div>;
  return (
    <div className="flex items-baseline gap-3">
      <span
        data-testid="document-number"
        className="w-9 shrink-0 font-semibold tracking-[-0.01em] tabular-nums"
      >
        {number}
      </span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function MissingDocumentRow({
  row,
  className,
}: {
  row: Extract<PackRow, { kind: 'missing' }>;
  className?: string;
}) {
  return (
    <TableRow data-testid="document-missing" className={className}>
      <TableCell className={cn(packCells.title, 'font-medium text-muted-foreground')}>
        <NumberedTitle number={documentNumberOf(row.key)}>
          <span data-testid="document-missing-title">{row.title}</span>
        </NumberedTitle>
      </TableCell>
      <TableCell className={packCells.status}>
        <Badge variant="outline" className="border-dashed text-muted-foreground">
          Negenerat
        </Badge>
      </TableCell>
      <TableCell className={packCells.date}>—</TableCell>
      <TableCell className={packCells.actions} />
    </TableRow>
  );
}
