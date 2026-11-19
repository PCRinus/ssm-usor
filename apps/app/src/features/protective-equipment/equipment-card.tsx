import { Button } from '@ssm-usor/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ssm-usor/ui/components/dialog';
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
import { Copy, HardHat, Plus } from 'lucide-react';
import { useState } from 'react';

import {
  getListEquipmentQueryKey,
  getListJobPositionsQueryKey,
  useCopyEquipment,
  useDecideProtectiveEquipment,
  useListEquipment,
  useListJobPositions,
  useRemoveEquipmentEntry,
} from '@/api/generated/api';
import { apiErrorReason, ApiHttpError } from '@/api/http';
import { useApi } from '@/api/use-api';
import { replayShow } from '@/app/observability/replay-masking';
import { ConfirmDialog } from '@/components/confirm-dialog';
import { rowClickProps } from '@/components/data-table/row-click';
import { EmptyState } from '@/components/empty-state';
import { Field } from '@/components/form-field';
import { LoadFailed } from '@/components/load-failed';
import { Notice } from '@/components/notice';
import { RowActionsMenu } from '@/components/row-actions-menu';
import { SectionCard } from '@/components/section-card';
import { DecisionBadge } from '@/features/job-positions/decision-badge';
import type { JobPosition } from '@/features/job-positions/job-position-schema';
import { useSavedToast } from '@/features/missing-data/saved-toast';
import { commonFailure } from '@/lib/api-errors';

import { type EquipmentEditing, EquipmentEntryDialog } from './equipment-entry-dialog';
import {
  allocationLabels,
  entryCountLabel,
  type EquipmentEntry,
  equipmentStateLabel,
  quantityLabel,
} from './equipment-schema';

const failureMessage = (cause: unknown, fallback: string) =>
  commonFailure(cause) ??
  (cause instanceof ApiHttpError && cause.status === 409
    ? apiErrorReason(cause) === 'equipment_entries_exist'
      ? 'Postul are articole de echipament; șterge-le înainte să spui că nu necesită.'
      : 'Clientul este arhivat; echipamentul lui nu se mai schimbă.'
    : cause instanceof ApiHttpError && cause.status === 404
      ? 'Postul sau articolul nu mai există la acest client.'
      : fallback);

// The protective equipment of one job position (ADR 011). `readOnly` is an archived client.
export function EquipmentCard({
  id,
  clientId,
  position,
  readOnly,
}: {
  id: string;
  clientId: string;
  position: JobPosition;
  readOnly: boolean;
}) {
  const { request, queryClient, key } = useApi();
  const savedToast = useSavedToast();
  const equipment = useListEquipment(clientId, position.id, {
    request,
    query: { queryKey: key(getListEquipmentQueryKey(clientId, position.id)) },
  });
  const decide = useDecideProtectiveEquipment({ request });
  const remove = useRemoveEquipmentEntry({ request });
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

  const addAction = (label: string, variant: 'default' | 'secondary') =>
    !readOnly &&
    decision !== false && (
      <Button
        variant={variant}
        size="sm"
        data-testid="equipment-add"
        onClick={() => setEditing('new')}
      >
        <Plus aria-hidden="true" />
        {label}
      </Button>
    );

  const copyAction = !readOnly && (
    <Button
      variant="secondary"
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
      action={items.length > 0 && addAction('Adaugă', 'secondary')}
    >
      {error && (
        <Notice variant="destructive" data-testid="equipment-error">
          {error}
        </Notice>
      )}
      {equipment.isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : equipment.isError ? (
        <LoadFailed
          error={equipment.error}
          busy={equipment.isFetching}
          onRetry={() => void equipment.refetch()}
        >
          Nu am putut încărca echipamentul postului.
        </LoadFailed>
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
        <EmptyState
          data-testid="equipment-empty"
          icon={HardHat}
          actions={
            !readOnly && (
              <>
                {addAction('Adaugă un articol', 'default')}
                <Button
                  variant="secondary"
                  size="sm"
                  data-testid="equipment-decide-none"
                  disabled={decide.isPending}
                  onClick={() => void decideNone(false)}
                >
                  Postul nu necesită echipament
                </Button>
                {copyAction}
              </>
            )
          }
        >
          {readOnly
            ? 'Nu s-a stabilit ce primește postul. Clientul este arhivat, așa că echipamentul lui nu se mai completează.'
            : 'Documentația nu se poate genera până nu spui ce primește postul, sau că nu are nevoie de echipament.'}
        </EmptyState>
      ) : (
        <>
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
                  className={cn(!readOnly && 'cursor-pointer')}
                >
                  <TableCell className="min-w-40 whitespace-normal">{entry.risk}</TableCell>
                  <TableCell className="min-w-40 font-medium whitespace-normal">
                    {entry.item}
                  </TableCell>
                  <TableCell className="tabular-nums" data-testid="equipment-quantity-cell">
                    {quantityLabel(entry)}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {allocationLabels[entry.allocation]}
                  </TableCell>
                  {!readOnly && (
                    <TableCell>
                      <RowActionsMenu
                        name={entry.item}
                        testId="equipment"
                        deleteTestId="equipment-remove"
                        onEdit={() => setEditing(entry)}
                        onDelete={() => setRemoving(entry)}
                      />
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
        open={copying}
        onClose={() => setCopying(false)}
        onCopied={refresh}
      />
      {removing && (
        <ConfirmDialog
          open
          testId="equipment-remove"
          title="Ștergi articolul?"
          confirmLabel="Șterge"
          pendingLabel="Se șterge…"
          onConfirm={() => removeEntry(removing)}
          onClose={() => setRemoving(null)}
        >
          <span className="font-medium text-foreground">{removing.item}</span>
          {items.length === 1
            ? ' este singurul articol al postului. Fără el, postul rămâne nedecis până spui ce primește sau că nu necesită echipament.'
            : ' nu va mai apărea în lista internă de dotare la următoarea generare.'}
        </ConfirmDialog>
      )}
    </SectionCard>
  );
}

function CopyEquipmentDialog({
  clientId,
  position,
  open,
  onClose,
  onCopied,
}: {
  clientId: string;
  position: JobPosition;
  open: boolean;
  onClose: () => void;
  onCopied: () => Promise<unknown>;
}) {
  const { request, key } = useApi();
  const savedToast = useSavedToast();
  const positions = useListJobPositions(clientId, {
    request,
    query: { queryKey: key(getListJobPositionsQueryKey(clientId)), enabled: open },
  });
  const copy = useCopyEquipment({ request });
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
                {...replayShow}
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
