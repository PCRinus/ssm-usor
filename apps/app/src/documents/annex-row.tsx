import type { DocumentAnnex } from '@ssm-usor/contracts';
import { Badge } from '@ssm-usor/ui/components/badge';
import { Button } from '@ssm-usor/ui/components/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@ssm-usor/ui/components/dropdown-menu';
import { TableCell, TableRow } from '@ssm-usor/ui/components/table';
import { Link } from '@tanstack/react-router';
import { MoreHorizontal } from 'lucide-react';

import { formatRoDate } from '../lib/dates';

const day = (timestamp: string) => formatRoDate(timestamp.slice(0, 10));

// Named as chapter XIII of the own instructions lists it, and opened at the version the
// revision cites: what it prints and what the employer approved by name (ADR 012).
export function AnnexRow({ annex, onDownload }: { annex: DocumentAnnex; onDownload: () => void }) {
  const label = `Anexa ${annex.number}: I.P.S.S.M. ${annex.title}`;
  return (
    <TableRow data-testid="document-annex">
      <TableCell className="pl-8">
        <Link
          to="/instructions/$moduleId"
          params={{ moduleId: annex.moduleId }}
          search={{ version: annex.version.id }}
          state={{ openedFromList: true }}
          data-testid="document-annex-title"
          className="underline-offset-4 hover:underline"
        >
          {label}
        </Link>
        <span className="block text-xs text-muted-foreground">
          Versiunea {annex.version.number}
        </span>
      </TableCell>
      <TableCell>
        {annex.newerVersion && (
          <Badge
            variant="outline"
            data-testid="document-annex-newer"
            title={`Biblioteca are versiunea ${annex.newerVersion.number}, din ${day(annex.newerVersion.createdAt)}. Documentul o anexează după ce este generat din nou, iar generarea din nou pierde modificările făcute de mână în instrucțiunile proprii.`}
          >
            Versiune nouă în bibliotecă · {day(annex.newerVersion.createdAt)}
          </Badge>
        )}
      </TableCell>
      <TableCell className="text-muted-foreground tabular-nums">
        {day(annex.version.createdAt)}
      </TableCell>
      <TableCell>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              data-testid="document-annex-actions"
              aria-label={`Acțiuni pentru ${label}`}
            >
              <MoreHorizontal aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild data-testid="document-annex-open">
              <Link
                to="/instructions/$moduleId"
                params={{ moduleId: annex.moduleId }}
                search={{ version: annex.version.id }}
                state={{ openedFromList: true }}
              >
                Deschide
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem data-testid="document-annex-download" onSelect={onDownload}>
              Descarcă
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}
