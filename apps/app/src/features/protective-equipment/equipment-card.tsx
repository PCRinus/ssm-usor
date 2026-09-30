import { Button } from '@ssm-usor/ui/components/button';
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
import { cn } from '@ssm-usor/ui/lib/utils';
import { useRouteContext } from '@tanstack/react-router';
import { Copy, MoreHorizontal, Plus } from 'lucide-react';
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
} from '@/api/generated/api';
import { ApiHttpError } from '@/api/http';
import { rowClickProps } from '@/components/data-table/row-click';
import { Field } from '@/components/form-field';
import { Notice } from '@/components/notice';
import { SectionCard } from '@/components/section-card';
import { DecisionBadge } from '@/features/job-positions/decision-badge';
import type { JobPosition } from '@/features/job-positions/job-position-schema';
import { useSavedToast } from '@/features/missing-data/saved-toast';

import { type EquipmentEditing, EquipmentEntryDialog } from './equipment-entry-dialog';
import {
  allocationLabels,
  entryCountLabel,
  type EquipmentEntry,
  equipmentStateLabel,
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
  id,
  clientId,
  position,
  userId,
  readOnly,
}: {
  id: string;
  clientId: string;
  position: JobPosition;
  userId: string;
  readOnly: boolean;
}) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const savedToast = useSavedToast();
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
      savedToast(
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

  const copyAction = !readOnly && (
    <Button
      variant="outline"
      size="sm"
      data-testid="equipment-copy"
      onClick={() => setCopying(true)}
    >
      <Copy aria-hidden="true" />
      Copiază de la alt post
    </Button>
  );

  return (
    <SectionCard
      id={id}
      headingLevel={3}
      data-testid="equipment-card"
      title={
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          Echipament de protecție
          {equipment.data && (
            <DecisionBadge decision={decision} data-testid="equipment-state">
              {equipmentStateLabel({
                needsProtectiveEquipment: decision,
                equipmentCount: items.length,
              })}
            </DecisionBadge>
          )}
        </span>
      }
      action={
        !readOnly &&
        decision !== false && (
          <Button
            variant="outline"
            size="sm"
            data-testid="equipment-add"
            onClick={() => setEditing('new')}
          >
            <Plus aria-hidden="true" />
            Adaugă
          </Button>
        )
      }
    >
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
                size="sm"
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
        <div data-testid="equipment-empty" className="grid gap-3">
          <p className="text-sm text-muted-foreground">
            {readOnly
              ? 'Nu s-a stabilit ce primește postul. Clientul este arhivat, așa că echipamentul lui nu se mai completează.'
              : 'Documentația nu se poate genera până nu spui ce primește postul, sau că nu are nevoie de echipament.'}
          </p>
          {!readOnly && (
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                data-testid="equipment-decide-none"
                disabled={decide.isPending}
                onClick={() => void decideNone(false)}
              >
                Postul nu necesită echipament
              </Button>
              {copyAction}
            </div>
          )}
        </div>
      ) : (
        <>
          <Table className="max-sm:block">
            <TableHeader className="max-sm:sr-only">
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
            <TableBody className="max-sm:block">
              {items.map((entry) => (
                <TableRow
                  key={entry.id}
                  data-testid="equipment-row"
                  {...rowClickProps(readOnly ? undefined : () => setEditing(entry))}
                  className={cn(
                    'max-sm:grid max-sm:grid-cols-[auto_minmax(0,1fr)_auto] max-sm:gap-x-3 max-sm:gap-y-1 max-sm:py-3',
                    !readOnly && 'cursor-pointer'
                  )}
                >
                  <TableCell className="whitespace-normal max-sm:col-span-2 max-sm:col-start-1 max-sm:row-start-2 max-sm:p-0 max-sm:text-muted-foreground">
                    {entry.risk}
                  </TableCell>
                  <TableCell className="font-medium whitespace-normal max-sm:col-span-2 max-sm:col-start-1 max-sm:row-start-1 max-sm:p-0">
                    {entry.item}
                  </TableCell>
                  <TableCell
                    className="tabular-nums max-sm:col-start-1 max-sm:row-start-3 max-sm:p-0"
                    data-testid="equipment-quantity-cell"
                  >
                    {quantityLabel(entry)}
                  </TableCell>
                  <TableCell className="text-muted-foreground max-sm:col-start-2 max-sm:row-start-3 max-sm:p-0 max-sm:whitespace-normal">
                    {allocationLabels[entry.allocation]}
                  </TableCell>
                  {!readOnly && (
                    <TableCell className="max-sm:col-start-3 max-sm:row-span-3 max-sm:row-start-1 max-sm:p-0">
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
          {copyAction && <div>{copyAction}</div>}
        </>
      )}
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
    </SectionCard>
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
  const savedToast = useSavedToast();
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
      savedToast(`Postul are acum ${entryCountLabel(result.items.length).toLowerCase()}.`);
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
