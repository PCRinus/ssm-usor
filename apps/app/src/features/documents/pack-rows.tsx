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
    <Table data-testid="pack-table" className="max-md:block md:table-fixed">
      <TableHeader className="max-md:hidden">
        <TableRow className="hover:bg-transparent">
          <TableHead className="px-3 text-muted-foreground">Document</TableHead>
          <TableHead className="w-66 px-3 text-muted-foreground">Stare</TableHead>
          <TableHead className="w-37 px-3 text-muted-foreground">Data documentului</TableHead>
          <TableHead className="w-11">
            <span className="sr-only">Acțiuni</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody className="max-md:block max-md:border-t">{children}</TableBody>
    </Table>
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
    <TableRow data-testid="document-missing" className={cn(packCells.row, className)}>
      <TableCell className={cn(packCells.title, 'font-medium text-muted-foreground')}>
        {row.title}
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
