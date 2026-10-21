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
import { Link, useRouteContext } from '@tanstack/react-router';
import { MoreHorizontal } from 'lucide-react';

import { getInstructionModuleFileLink } from '@/api/generated/api';
import { FileMenuItem } from '@/components/file-menu-item';
import { formatRoDate } from '@/lib/dates';

const day = (timestamp: string) => formatRoDate(timestamp.slice(0, 10));

// Named as the annex chapter of either set's own instructions lists it, and opened at the
// version the revision cites: what it prints and what the employer approved by name (ADR 012).
export function AnnexRow({ annex, typeKey }: { annex: DocumentAnnex; typeKey: string }) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const code = typeKey === 'fire_own_instructions' ? 'I.P.S.U.' : 'I.P.S.S.M.';
  const label = `Anexa ${annex.number}: ${code} ${annex.title}`;
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
            <FileMenuItem
              testId="document-annex-download"
              apiRequest={apiRequest}
              disposition="attachment"
              queryKey={['instruction-module-file', annex.moduleId, annex.version.id]}
              load={async (signal) => {
                const link = await getInstructionModuleFileLink(
                  annex.moduleId,
                  { versionId: annex.version.id },
                  { ...apiRequest, signal }
                );
                return {
                  url: link.url,
                  fileName: link.fileName,
                  expiresInSeconds: Math.max(
                    0,
                    Math.round((Date.parse(link.expiresAt) - Date.now()) / 1_000)
                  ),
                };
              }}
            >
              Descarcă
            </FileMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}
