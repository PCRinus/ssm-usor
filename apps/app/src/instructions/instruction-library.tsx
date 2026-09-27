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
import { BookOpenText, MoreHorizontal, PenLine, Upload } from 'lucide-react';
import { useRef, useState } from 'react';

import {
  type ApiErrorResponse,
  getListInstructionModulesQueryKey,
  useListInstructionModules,
  useUpdateInstructionModule,
  useUploadInstructionModule,
} from '../api/generated/api';
import { ApiHttpError } from '../api/http';
import { rowClickProps } from '../components/data-table/row-click';
import { Notice } from '../components/notice';
import { InstructionModuleDialog, type ModuleEditing } from './instruction-module-dialog';
import {
  articleCountLabel,
  groupLabels,
  type InstructionModule,
  invalidateLibrary,
  positionCountLabel,
} from './instruction-schema';

// The organization's instruction library (ADR 012): the modules the own instructions annex.
export function InstructionLibrary({ userId }: { userId: string }) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const navigate = useNavigate();
  const [showArchived, setShowArchived] = useState(false);
  const params = { archived: showArchived ? ('true' as const) : ('false' as const) };
  const modules = useListInstructionModules(params, {
    request: apiRequest,
    query: { queryKey: [...getListInstructionModulesQueryKey(params), userId] },
  });
  const upload = useUploadInstructionModule({ request: apiRequest });
  const update = useUpdateInstructionModule({ request: apiRequest });
  const fileInput = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState<ModuleEditing>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploaded, setUploaded] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  async function uploadFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setError(null);
    setUploaded([]);
    setUploading(true);
    const titles: string[] = [];
    const failures: string[] = [];
    for (const file of Array.from(files)) {
      try {
        // The file's first line is the title unless it has none; then its name is.
        const fallback = file.name.replace(/\.docx$/i, '').trim();
        const { module } = await upload.mutateAsync({
          data: file,
          params: fallback.length >= 2 ? { title: undefined } : { title: fallback },
        });
        titles.push(module.title);
      } catch (cause) {
        const body =
          cause instanceof ApiHttpError ? (cause.body as Partial<ApiErrorResponse>) : null;
        failures.push(
          body?.reason === 'instruction_module_title_taken'
            ? `${file.name}: biblioteca are deja o instrucțiune cu acest titlu.`
            : cause instanceof ApiHttpError && cause.status === 400
              ? `${file.name}: nu este un document Word (.docx) sau are peste 15 MB.`
              : `${file.name}: nu a putut fi încărcat.`
        );
      }
    }
    setUploading(false);
    setUploaded(titles);
    if (failures.length > 0) setError(failures.join('\n'));
    if (titles.length > 0) {
      toast.success(
        titles.length === 1
          ? `„${titles[0]}” a fost adăugată în bibliotecă.`
          : `${titles.length} instrucțiuni au fost adăugate în bibliotecă.`
      );
    }
    await invalidateLibrary(queryClient);
  }

  async function setArchived(module: InstructionModule, archived: boolean) {
    setError(null);
    try {
      await update.mutateAsync({ moduleId: module.id, data: { archived } });
      toast.success(
        archived ? `„${module.title}” a fost arhivată.` : `„${module.title}” a fost restaurată.`
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

  return (
    <div data-testid="instruction-library" className="grid gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="text-xl font-semibold tracking-tight">Biblioteca de instrucțiuni</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Instrucțiunile proprii ale organizației, câte un fișier Word pentru fiecare activitate,
            echipament de muncă sau echipament de protecție. Un post de lucru aplică pe cele care îl
            privesc, iar instrucțiunile proprii ale clientului le anexează.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            data-testid="instruction-upload"
            disabled={uploading}
            onClick={() => fileInput.current?.click()}
          >
            <Upload aria-hidden="true" />
            {uploading ? 'Se încarcă…' : 'Încarcă fișiere'}
          </Button>
          <Button data-testid="instruction-write" onClick={() => setEditing('new')}>
            <PenLine aria-hidden="true" />
            Scrie o instrucțiune
          </Button>
        </div>
      </div>
      {error && (
        <Notice
          variant="destructive"
          data-testid="instruction-error"
          className="whitespace-pre-line"
        >
          {error}
        </Notice>
      )}
      {uploaded.length > 0 && (
        <Notice variant="info" data-testid="instruction-uploaded">
          Titlul fiecărei instrucțiuni încărcate este primul rând al fișierului, iar grupul este
          „Activități”. Corectează-le din meniul rândului unde este cazul.
        </Notice>
      )}
      <Card>
        <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-4">
          <h2 className="text-lg font-semibold">
            {showArchived ? 'Instrucțiuni arhivate' : 'Instrucțiuni în uz'}
          </h2>
          <Button
            variant="ghost"
            size="sm"
            data-testid="instruction-toggle-archived"
            onClick={() => setShowArchived((value) => !value)}
          >
            {showArchived ? 'Arată instrucțiunile în uz' : 'Arată arhiva'}
          </Button>
        </CardHeader>
        <CardContent>
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
                {showArchived ? 'Nicio instrucțiune arhivată' : 'Biblioteca este goală'}
              </p>
              {!showArchived && (
                <p className="max-w-md text-center text-sm text-muted-foreground">
                  Încarcă fișierele Word cu instrucțiunile pe care le folosești deja, câte unul
                  pentru fiecare activitate sau echipament, sau scrie una nouă pornind de la
                  schelet.
                </p>
              )}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Titlu</TableHead>
                  <TableHead>Grup</TableHead>
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
                      navigate({ to: '/instructions/$moduleId', params: { moduleId: module.id } })
                    )}
                  >
                    <TableCell className="font-medium whitespace-normal">
                      <Link
                        to="/instructions/$moduleId"
                        params={{ moduleId: module.id }}
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
                            Titlu și grup
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          {module.archivedAt ? (
                            <DropdownMenuItem
                              data-testid="instruction-restore"
                              onSelect={() => void setArchived(module, false)}
                            >
                              Restaurează
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
      <input
        ref={fileInput}
        type="file"
        multiple
        data-testid="instruction-file-input"
        className="hidden"
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        onChange={(event) => {
          const { files } = event.target;
          void uploadFiles(files);
          // Emptied, so that choosing the same files again is still a change.
          event.target.value = '';
        }}
      />
      <InstructionModuleDialog
        editing={editing}
        onClose={() => setEditing(null)}
        onSaved={(module) => {
          if (editing === 'new') {
            void navigate({ to: '/instructions/$moduleId', params: { moduleId: module.id } });
          }
        }}
      />
    </div>
  );
}
