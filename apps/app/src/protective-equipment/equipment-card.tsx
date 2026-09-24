import { Badge } from '@ssm-usor/ui/components/badge';
import { Button } from '@ssm-usor/ui/components/button';
import { Card, CardContent, CardHeader } from '@ssm-usor/ui/components/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ssm-usor/ui/components/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@ssm-usor/ui/components/dropdown-menu';
import { NativeSelect, NativeSelectOption } from '@ssm-usor/ui/components/native-select';
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
import { useRouteContext } from '@tanstack/react-router';
import { Copy, MoreHorizontal, Plus, ShieldCheck } from 'lucide-react';
import { useState } from 'react';

import {
  type ApiErrorResponse,
  getListEquipmentQueryKey,
  getListJobPositionsQueryKey,
  useCopyEquipment,
  useDecideProtectiveEquipment,
  useListEquipment,
  useListJobPositions,
  useRemoveEquipmentEntry,
} from '../api/generated/api';
import { ApiHttpError } from '../api/http';
import { rowClickProps } from '../components/data-table/row-click';
import { Field } from '../components/form-field';
import { Notice } from '../components/notice';
import type { JobPosition } from '../job-positions/job-position-schema';
import { type EquipmentEditing, EquipmentEntryDialog } from './equipment-entry-dialog';
import {
  allocationLabels,
  entryCountLabel,
  type EquipmentEntry,
  quantityLabel,
} from './equipment-schema';

const failureMessage = (cause: unknown, fallback: string) =>
  cause instanceof ApiHttpError && cause.status === 409
    ? (cause.body as Partial<ApiErrorResponse>).reason === 'equipment_entries_exist'
      ? 'Postul are articole de echipament; șterge-le înainte să spui că nu necesită.'
      : 'Clientul este arhivat; echipamentul lui nu se mai schimbă.'
    : cause instanceof ApiHttpError && cause.status === 404
      ? 'Postul sau articolul nu mai există la acest client.'
      : fallback;

// The protective equipment of one job position (ADR 011). `readOnly` is an archived client.
export function EquipmentCard({
  clientId,
  position,
  userId,
  readOnly,
}: {
  clientId: string;
  position: JobPosition;
  userId: string;
  readOnly: boolean;
}) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const equipment = useListEquipment(clientId, position.id, {
    request: apiRequest,
    query: { queryKey: [...getListEquipmentQueryKey(clientId, position.id), userId] },
  });
  const decide = useDecideProtectiveEquipment({ request: apiRequest });
  const remove = useRemoveEquipmentEntry({ request: apiRequest });
  const [editing, setEditing] = useState<EquipmentEditing>(null);
  const [removing, setRemoving] = useState<EquipmentEntry | null>(null);
  const [copying, setCopying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: getListEquipmentQueryKey(clientId, position.id) }),
      queryClient.invalidateQueries({ queryKey: getListJobPositionsQueryKey(clientId) }),
    ]);

  async function decideNone(needsProtectiveEquipment: false | null) {
    setError(null);
    try {
      await decide.mutateAsync({
        clientId,
        jobPositionId: position.id,
        data: { needsProtectiveEquipment },
      });
      toast.success(
        needsProtectiveEquipment === false
          ? 'Am notat că postul nu necesită echipament.'
          : 'Decizia a fost reluată.'
      );
    } catch (cause) {
      setError(
        failureMessage(cause, 'Nu am putut salva decizia. Verifică conexiunea și încearcă din nou.')
      );
    }
    await refresh();
  }

  async function removeEntry(entry: EquipmentEntry) {
    setError(null);
    try {
      await remove.mutateAsync({ clientId, jobPositionId: position.id, entryId: entry.id });
      toast.success(`Articolul „${entry.item}” a fost șters.`);
    } catch (cause) {
      setError(
        failureMessage(
          cause,
          'Nu am putut șterge articolul. Verifică conexiunea și încearcă din nou.'
        )
      );
    }
    setRemoving(null);
    await refresh();
  }

  const decision = equipment.data?.needsProtectiveEquipment ?? position.needsProtectiveEquipment;
  const items = equipment.data?.items ?? [];

  return (
    <Card data-testid="equipment-card">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-lg font-semibold">Echipament individual de protecție</h2>
          {equipment.data && (
            <Badge
              variant={decision === null ? 'outline' : 'secondary'}
              data-testid="equipment-state"
            >
              {decision === null
                ? 'Nedecis'
                : decision === false
                  ? 'Nu necesită'
                  : entryCountLabel(items.length)}
            </Badge>
          )}
        </div>
        {!readOnly && (
          <div className="flex flex-wrap gap-2">
            {decision !== false && (
              <Button
                variant="outline"
                data-testid="equipment-copy"
                onClick={() => setCopying(true)}
              >
                <Copy aria-hidden="true" />
                Copiază de la alt post
              </Button>
            )}
            {decision !== false && (
              <Button data-testid="equipment-add" onClick={() => setEditing('new')}>
                <Plus aria-hidden="true" />
                Adaugă un articol
              </Button>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent className="grid gap-4">
        {error && (
          <Notice variant="destructive" data-testid="equipment-error">
            {error}
          </Notice>
        )}
        {equipment.isPending ? (
          <Skeleton className="h-24 w-full" />
        ) : equipment.isError ? (
          <Notice
            variant="destructive"
            action={
              <Button
                variant="outline"
                disabled={equipment.isFetching}
                onClick={() => void equipment.refetch()}
              >
                Încearcă din nou
              </Button>
            }
          >
            Nu am putut încărca echipamentul postului.
          </Notice>
        ) : decision === false ? (
          <Notice
            variant="info"
            data-testid="equipment-none"
            action={
              !readOnly && (
                <Button
                  variant="outline"
                  data-testid="equipment-undecide"
                  disabled={decide.isPending}
                  onClick={() => void decideNone(null)}
                >
                  Reia decizia
                </Button>
              )
            }
          >
            Postul nu necesită echipament individual de protecție. Lista internă de dotare îl lasă
            deoparte.
          </Notice>
        ) : items.length === 0 ? (
          <div data-testid="equipment-empty" className="grid justify-items-center gap-3 py-8">
            <ShieldCheck className="size-8 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm font-medium">Nedecis încă</p>
            <p className="max-w-md text-center text-sm text-muted-foreground">
              {readOnly
                ? 'Clientul este arhivat, așa că echipamentul lui nu se mai completează.'
                : 'Documentația nu se poate genera până nu spui ce primește postul, sau că nu are nevoie de echipament.'}
            </p>
            {!readOnly && (
              <Button
                variant="outline"
                data-testid="equipment-decide-none"
                disabled={decide.isPending}
                onClick={() => void decideNone(false)}
              >
                Postul nu necesită echipament
              </Button>
            )}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Risc</TableHead>
                <TableHead>Articol</TableHead>
                <TableHead>Cantitate și durată</TableHead>
                <TableHead>Mod de acordare</TableHead>
                {!readOnly && (
                  <TableHead className="w-12">
                    <span className="sr-only">Acțiuni</span>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((entry) => (
                <TableRow
                  key={entry.id}
                  data-testid="equipment-row"
                  {...rowClickProps(readOnly ? undefined : () => setEditing(entry))}
                >
                  <TableCell className="whitespace-normal">{entry.risk}</TableCell>
                  <TableCell className="font-medium whitespace-normal">{entry.item}</TableCell>
                  <TableCell className="tabular-nums" data-testid="equipment-quantity-cell">
                    {quantityLabel(entry)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {allocationLabels[entry.allocation]}
                  </TableCell>
                  {!readOnly && (
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            data-testid="equipment-actions"
                            aria-label={`Acțiuni pentru ${entry.item}`}
                          >
                            <MoreHorizontal aria-hidden="true" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            data-testid="equipment-edit"
                            onSelect={() => setEditing(entry)}
                          >
                            Modifică
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            data-testid="equipment-remove"
                            variant="destructive"
                            onSelect={() => setRemoving(entry)}
                          >
                            Șterge
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      <EquipmentEntryDialog
        clientId={clientId}
        jobPositionId={position.id}
        editing={editing}
        onClose={() => setEditing(null)}
      />
      <CopyEquipmentDialog
        clientId={clientId}
        position={position}
        userId={userId}
        open={copying}
        onClose={() => setCopying(false)}
        onCopied={refresh}
      />
      <Dialog
        open={removing !== null}
        onOpenChange={(open) => !open && !remove.isPending && setRemoving(null)}
      >
        {removing && (
          <DialogContent data-testid="equipment-remove-dialog" className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Ștergi articolul?</DialogTitle>
              <DialogDescription>
                <span className="font-medium text-foreground">{removing.item}</span>
                {items.length === 1
                  ? ' este singurul articol al postului. Fără el, postul rămâne nedecis până spui ce primește sau că nu necesită echipament.'
                  : ' nu va mai apărea în lista internă de dotare la următoarea generare.'}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="mt-2">
              <Button variant="ghost" disabled={remove.isPending} onClick={() => setRemoving(null)}>
                Renunță
              </Button>
              <Button
                variant="destructive"
                data-testid="equipment-remove-confirm"
                disabled={remove.isPending}
                onClick={() => void removeEntry(removing)}
              >
                {remove.isPending ? 'Se șterge…' : 'Șterge'}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </Card>
  );
}

function CopyEquipmentDialog({
  clientId,
  position,
  userId,
  open,
  onClose,
  onCopied,
}: {
  clientId: string;
  position: JobPosition;
  userId: string;
  open: boolean;
  onClose: () => void;
  onCopied: () => Promise<unknown>;
}) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const positions = useListJobPositions(clientId, {
    request: apiRequest,
    query: { queryKey: [...getListJobPositionsQueryKey(clientId), userId], enabled: open },
  });
  const copy = useCopyEquipment({ request: apiRequest });
  const [source, setSource] = useState('');
  const [error, setError] = useState<string | null>(null);
  const sources = (positions.data?.items ?? []).filter(
    (candidate) => candidate.id !== position.id && candidate.equipmentCount > 0
  );

  async function copyEntries() {
    setError(null);
    try {
      const result = await copy.mutateAsync({
        clientId,
        jobPositionId: position.id,
        data: { fromJobPositionId: source },
      });
      await onCopied();
      toast.success(`Postul are acum ${entryCountLabel(result.items.length).toLowerCase()}.`);
      onClose();
    } catch (cause) {
      setError(
        failureMessage(
          cause,
          'Nu am putut copia articolele. Verifică conexiunea și încearcă din nou.'
        )
      );
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && !copy.isPending && onClose()}>
      <DialogContent data-testid="equipment-copy-dialog" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Copiază echipamentul altui post</DialogTitle>
          <DialogDescription>
            Articolele postului ales se adaugă după cele pe care{' '}
            <span className="font-medium text-foreground">{position.name}</span> le are deja.
          </DialogDescription>
        </DialogHeader>
        <div className="mt-4 grid gap-4">
          {error && (
            <Notice variant="destructive" data-testid="equipment-copy-error">
              {error}
            </Notice>
          )}
          {positions.data && sources.length === 0 ? (
            <Notice variant="info">Niciun alt post al clientului nu are articole încă.</Notice>
          ) : (
            <Field id="equipment-copy-source" label="Postul de la care copiezi" mark="required">
              <NativeSelect
                id="equipment-copy-source"
                data-testid="equipment-copy-source"
                className="w-full"
                value={source}
                disabled={copy.isPending || positions.isPending}
                onChange={(event) => setSource(event.target.value)}
              >
                <NativeSelectOption value="">Alege un post…</NativeSelectOption>
                {sources.map((candidate) => (
                  <NativeSelectOption key={candidate.id} value={candidate.id}>
                    {candidate.name} ({entryCountLabel(candidate.equipmentCount).toLowerCase()})
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </Field>
          )}
        </div>
        <DialogFooter className="mt-6">
          <Button type="button" variant="ghost" disabled={copy.isPending} onClick={onClose}>
            Renunță
          </Button>
          <Button
            type="button"
            data-testid="equipment-copy-confirm"
            disabled={copy.isPending || !source}
            onClick={() => void copyEntries()}
          >
            {copy.isPending ? 'Se copiază…' : 'Copiază'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
