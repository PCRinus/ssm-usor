import { gravityConsequence, probabilityFrequency } from '@ssm-usor/contracts';
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
import { Table, TableCell, TableHead, TableHeader, TableRow } from '@ssm-usor/ui/components/table';
import { toast } from '@ssm-usor/ui/lib/toast';
import { cn } from '@ssm-usor/ui/lib/utils';
import { MoreHorizontal, Plus, TriangleAlert } from 'lucide-react';
import { Fragment, type ReactNode, useState } from 'react';

import { rowClickProps } from '@/components/data-table/row-click';
import { Notice } from '@/components/notice';
import { SectionCard } from '@/components/section-card';

import type { FactorStore } from './factor-store';
import {
  componentLabels,
  factorCountLabel,
  factorGap,
  measureKindLabels,
  type RiskFactor,
  sectionsOf,
} from './risk-evaluation-schema';
import { type FactorEditing, RiskFactorDialog } from './risk-factor-dialog';
import { RiskLevelBadge } from './risk-level-badge';

export function RiskFactorsCard({
  id,
  factors,
  store,
  readOnly,
  tools,
  empty,
  removalConsequence,
}: {
  id: string;
  factors: RiskFactor[];
  store: FactorStore;
  readOnly: boolean;
  tools?: ReactNode;
  empty: ReactNode;
  /** Continues "<factor> și măsurile lui …" in the removal dialog. */
  removalConsequence: string;
}) {
  const [editing, setEditing] = useState<FactorEditing>(null);
  const [removing, setRemoving] = useState<RiskFactor | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sections = sectionsOf(factors);
  const columns = readOnly ? 4 : 5;

  async function removeFactor(factor: RiskFactor) {
    setError(null);
    setPending(true);
    try {
      await store.remove(factor.id);
      toast.success('Factorul a fost șters.');
    } catch (cause) {
      setError(
        store.failure(
          cause,
          'Nu am putut șterge factorul. Verifică conexiunea și încearcă din nou.'
        )
      );
      await store.refresh();
    }
    setPending(false);
    setRemoving(null);
  }

  return (
    <SectionCard
      id={id}
      headingLevel={3}
      data-testid="risk-factors-card"
      className={cn(sections.length > 0 && 'overflow-hidden pb-0')}
      title={
        <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          Factori de risc
          <span
            data-testid="risk-factors-count"
            className="text-sm font-normal text-muted-foreground"
          >
            {factorCountLabel(factors.length)}
          </span>
        </span>
      }
      action={
        !readOnly && (
          <>
            {tools}
            <Button
              variant="outline"
              size="sm"
              data-testid="risk-factor-add"
              onClick={() => setEditing('new')}
            >
              <Plus aria-hidden="true" />
              Adaugă un factor
            </Button>
          </>
        )
      }
    >
      {error && (
        <Notice variant="destructive" data-testid="risk-factors-error">
          {error}
        </Notice>
      )}
      {sections.length === 0 ? (
        <p data-testid="risk-factors-empty" className="text-sm text-muted-foreground">
          {empty}
        </p>
      ) : (
        <div className="-mx-6 min-w-0 border-t">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="min-w-64 pl-6">Factor de risc</TableHead>
                <TableHead>Gravitate</TableHead>
                <TableHead>Probabilitate</TableHead>
                <TableHead className={cn(readOnly && 'pr-6')}>Nivel</TableHead>
                {!readOnly && (
                  <TableHead className="w-12 pr-4">
                    <span className="sr-only">Acțiuni</span>
                  </TableHead>
                )}
              </TableRow>
            </TableHeader>
            {sections.map((section) => (
              <tbody
                key={section.component}
                data-testid="risk-component"
                className="last:[&>tr:last-child]:border-0"
              >
                <TableRow className="bg-muted/40 hover:bg-muted/40">
                  <TableHead scope="rowgroup" colSpan={columns} className="h-auto py-2 pl-6">
                    {componentLabels[section.component]}
                    <span className="ml-2 font-normal text-muted-foreground">
                      {factorCountLabel(section.count).toLowerCase()}
                    </span>
                  </TableHead>
                </TableRow>
                {section.groups.map((group) => (
                  <Fragment key={group.name}>
                    <TableRow data-testid="risk-group" className="border-0 hover:bg-transparent">
                      <TableHead
                        colSpan={columns}
                        className="h-auto pt-3 pb-1 pl-6 font-normal whitespace-normal text-muted-foreground"
                      >
                        {group.name}
                      </TableHead>
                    </TableRow>
                    {group.factors.map((factor) => (
                      <FactorRow
                        key={factor.id}
                        factor={factor}
                        readOnly={readOnly}
                        onEdit={() => setEditing(factor)}
                        onRemove={() => setRemoving(factor)}
                      />
                    ))}
                  </Fragment>
                ))}
              </tbody>
            ))}
          </Table>
        </div>
      )}
      <RiskFactorDialog
        factors={factors}
        store={store}
        editing={editing}
        onClose={() => setEditing(null)}
      />
      <Dialog
        open={removing !== null}
        onOpenChange={(open) => !open && !pending && setRemoving(null)}
      >
        {removing && (
          <DialogContent data-testid="risk-factor-remove-dialog" className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Ștergi factorul de risc?</DialogTitle>
              <DialogDescription>
                <span className="font-medium text-foreground">{removing.description}</span> și
                măsurile lui {removalConsequence}
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="mt-2">
              <Button variant="ghost" disabled={pending} onClick={() => setRemoving(null)}>
                Renunță
              </Button>
              <Button
                variant="destructive"
                data-testid="risk-factor-remove-confirm"
                disabled={pending}
                onClick={() => void removeFactor(removing)}
              >
                {pending ? 'Se șterge…' : 'Șterge'}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </SectionCard>
  );
}

function FactorRow({
  factor,
  readOnly,
  onEdit,
  onRemove,
}: {
  factor: RiskFactor;
  readOnly: boolean;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const gap = readOnly ? null : factorGap(factor);
  const hasPlan = factor.deadline || factor.responsiblePerson;
  return (
    <TableRow
      data-testid="risk-factor-row"
      {...rowClickProps(readOnly ? undefined : onEdit)}
      className={cn(readOnly ? 'hover:bg-transparent' : 'cursor-pointer')}
    >
      <TableCell className="py-3 pl-6 align-top whitespace-normal">
        <div className="grid gap-1">
          <p className="font-medium wrap-anywhere">{factor.description}</p>
          {factor.measures.length > 0 && (
            <ul
              data-testid="risk-factor-measures"
              className="grid gap-0.5 text-xs text-muted-foreground"
            >
              {factor.measures.map((measure) => (
                <li key={measure.id} className="wrap-anywhere">
                  {measureKindLabels[measure.kind]}: {measure.description}
                </li>
              ))}
            </ul>
          )}
          {hasPlan && (
            <p className="flex flex-wrap gap-x-4 text-xs text-muted-foreground">
              {factor.deadline && <span className="wrap-anywhere">Termen: {factor.deadline}</span>}
              {factor.responsiblePerson && (
                <span className="wrap-anywhere">Răspunde: {factor.responsiblePerson}</span>
              )}
            </p>
          )}
          {gap && (
            <p
              data-testid="risk-factor-gap"
              className="flex items-start gap-1.5 text-xs text-warning-foreground"
            >
              <TriangleAlert aria-hidden="true" className="mt-px size-3.5 shrink-0" />
              {gap}
            </p>
          )}
        </div>
      </TableCell>
      <TableCell data-testid="risk-factor-gravity-class" className="py-3 align-top">
        <span className="font-medium tabular-nums">{factor.gravityClass}</span>
        <span className="block text-xs text-muted-foreground">
          {gravityConsequence(factor.gravityClass)}
        </span>
      </TableCell>
      <TableCell data-testid="risk-factor-probability-class" className="py-3 align-top">
        <span className="font-medium tabular-nums">{factor.probabilityClass}</span>
        <span className="block text-xs text-muted-foreground">
          {probabilityFrequency(factor.probabilityClass).period}
        </span>
      </TableCell>
      <TableCell className={cn('py-3 align-top', readOnly && 'pr-6')}>
        <RiskLevelBadge level={factor.riskLevel} />
      </TableCell>
      {!readOnly && (
        <TableCell className="py-2 pr-4 align-top">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                data-testid="risk-factor-actions"
                aria-label={`Acțiuni pentru ${factor.description}`}
              >
                <MoreHorizontal aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem data-testid="risk-factor-edit" onSelect={onEdit}>
                Modifică
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                data-testid="risk-factor-remove"
                variant="destructive"
                onSelect={onRemove}
              >
                Șterge
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </TableCell>
      )}
    </TableRow>
  );
}
