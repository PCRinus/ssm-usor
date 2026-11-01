import type { InstructionDomain } from '@ssm-usor/contracts';
import { Badge } from '@ssm-usor/ui/components/badge';
import { Button } from '@ssm-usor/ui/components/button';
import { Card, CardContent, CardHeader } from '@ssm-usor/ui/components/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@ssm-usor/ui/components/dropdown-menu';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@ssm-usor/ui/components/table';
import { toast } from '@ssm-usor/ui/lib/toast';
import { Link, useNavigate, useRouteContext } from '@tanstack/react-router';
import { BookOpenText, MoreHorizontal, PenLine } from 'lucide-react';
import { useState } from 'react';

import {
  type ApiErrorResponse,
  getListInstructionModulesQueryKey,
  useListInstructionModules,
  useUpdateInstructionModule,
} from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import { rowClickProps } from '@/components/data-table/row-click';
import { Notice } from '@/components/notice';

import { InstructionModuleDialog, type ModuleEditing } from './instruction-module-dialog';
import {
  articleCountLabel,
  domainLabels,
  groupLabels,
  type InstructionModule,
  invalidateLibrary,
  positionCountLabel,
} from './instruction-schema';

export function InstructionLibrary({
  domain,
  userId,
}: {
  domain: InstructionDomain;
  userId: string;
}) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const navigate = useNavigate();
  const [showArchived, setShowArchived] = useState(false);
  const params = { archived: showArchived ? ('true' as const) : ('false' as const), domain };
  const modules = useListInstructionModules(params, {
    request: apiRequest,
    query: { queryKey: [...getListInstructionModulesQueryKey(params), userId] },
  });
  const update = useUpdateInstructionModule({ request: apiRequest });
  const [editing, setEditing] = useState<ModuleEditing>(null);
  const [error, setError] = useState<string | null>(null);

  async function setArchived(module: InstructionModule, archived: boolean) {
    setError(null);
    try {
      await update.mutateAsync({ moduleId: module.id, data: { archived } });
      toast.success(
        archived ? `„${module.title}” a fost arhivată.` : `„${module.title}” a fost reactivată.`
      );
    } catch (cause) {
      const body = cause instanceof ApiHttpError ? (cause.body as Partial<ApiErrorResponse>) : null;
      setError(
        body?.reason === 'instruction_module_applied'
          ? `„${module.title}” este aplicată la ${positionCountLabel(module.appliedCount).toLowerCase()}; scoate-o de acolo înainte să o arhivezi.`
          : cause instanceof ApiHttpError && cause.status === 404
            ? 'Instrucțiunea nu mai există în bibliotecă.'
            : 'Nu am putut salva schimbarea. Verifică conexiunea și încearcă din nou.'
      );
    }
    await invalidateLibrary(queryClient);
  }

  const items = modules.data?.items ?? [];
  const label = domainLabels[domain];

  return (
    <div data-testid={`instruction-library-${domain}`} className="grid gap-6">
      {error && (
        <Notice
          variant="destructive"
          data-testid="instruction-error"
          className="whitespace-pre-line"
        >
          {error}
        </Notice>
      )}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">
            {showArchived ? 'Instrucțiuni arhivate' : 'Instrucțiuni în uz'}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              data-testid="instruction-toggle-archived"
              onClick={() => setShowArchived((value) => !value)}
            >
              {showArchived ? 'Arată instrucțiunile în uz' : 'Arată arhiva'}
            </Button>
            <Button size="sm" data-testid="instruction-write" onClick={() => setEditing('new')}>
              <PenLine aria-hidden="true" />
              Scrie o instrucțiune
            </Button>
          </div>
        </CardHeader>
        {/* A grid, so the table's scroll box can shrink to the card; a block would widen the page on a phone. */}
        <CardContent className="grid">
          {modules.isPending ? (
            <Skeleton className="h-24 w-full" />
          ) : modules.isError ? (
            <Notice
              variant="destructive"
              action={
                <Button
                  variant="outline"
                  disabled={modules.isFetching}
                  onClick={() => void modules.refetch()}
                >
                  Încearcă din nou
                </Button>
              }
            >
              Nu am putut încărca biblioteca.
            </Notice>
          ) : items.length === 0 ? (
            <div data-testid="instruction-empty" className="grid justify-items-center gap-3 py-10">
              <BookOpenText className="size-8 text-muted-foreground" aria-hidden="true" />
              <p className="text-sm font-medium">
                {showArchived
                  ? `Nicio instrucțiune proprie ${label} arhivată`
                  : `Nicio instrucțiune proprie ${label} încă`}
              </p>
              {!showArchived && (
                <p className="max-w-md text-center text-sm text-muted-foreground">
                  Scrie câte o instrucțiune pentru fiecare activitate sau echipament, apoi aplic-o
                  la posturile clienților tăi.
                </p>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Titlu</TableHead>
                  <TableHead>Categorie</TableHead>
                  <TableHead>Versiune</TableHead>
                  <TableHead>Aplicată la</TableHead>
                  <TableHead className="w-12">
                    <span className="sr-only">Acțiuni</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((module) => (
                  <TableRow
                    key={module.id}
                    data-testid="instruction-row"
                    {...rowClickProps(() =>
                      navigate({
                        to: '/instructions/$moduleId',
                        params: { moduleId: module.id },
                        state: { openedFromList: true },
                      })
                    )}
                  >
                    <TableCell className="font-medium whitespace-normal">
                      <Link
                        to="/instructions/$moduleId"
                        params={{ moduleId: module.id }}
                        state={{ openedFromList: true }}
                        data-testid="instruction-open"
                        className="hover:underline"
                      >
                        {module.title}
                      </Link>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{groupLabels[module.group]}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground" data-testid="instruction-version">
                      {`v${module.version.number} · ${articleCountLabel(module.version.articleCount).toLowerCase()}`}
                    </TableCell>
                    <TableCell className="text-muted-foreground" data-testid="instruction-applied">
                      {positionCountLabel(module.appliedCount)}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            data-testid="instruction-actions"
                            aria-label={`Acțiuni pentru ${module.title}`}
                          >
                            <MoreHorizontal aria-hidden="true" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            data-testid="instruction-rename"
                            onSelect={() => setEditing(module)}
                          >
                            Titlu, categorie și domeniu
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {module.archivedAt ? (
                            <DropdownMenuItem
                              data-testid="instruction-restore"
                              onSelect={() => void setArchived(module, false)}
                            >
                              Reactivează
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              data-testid="instruction-archive"
                              variant="destructive"
                              onSelect={() => void setArchived(module, true)}
                            >
                              Arhivează
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
      <InstructionModuleDialog
        editing={editing}
        defaultDomain={domain}
        onClose={() => setEditing(null)}
        onSaved={(module) => {
          if (editing === 'new') {
            void navigate({
              to: '/instructions/$moduleId',
              params: { moduleId: module.id },
              state: { openedFromList: true },
            });
          }
        }}
      />
    </div>
  );
}
