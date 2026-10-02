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
import { toast } from '@ssm-usor/ui/lib/toast';
import { cn } from '@ssm-usor/ui/lib/utils';
import { MoreHorizontal, Plus, TriangleAlert } from 'lucide-react';
import { type ReactNode, useState } from 'react';

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
        <div className="grid gap-6">
          {sections.map((section) => (
            <section
              key={section.component}
              data-testid="risk-component"
              aria-labelledby={`risk-component-${section.component}`}
              className="grid gap-3"
            >
              <h4
                id={`risk-component-${section.component}`}
                className="flex items-baseline gap-2 border-b pb-2 text-base font-semibold"
              >
                {componentLabels[section.component]}
                <span className="text-sm font-normal text-muted-foreground">
                  {factorCountLabel(section.count).toLowerCase()}
                </span>
              </h4>
              {section.groups.map((group) => (
                <div key={group.name} data-testid="risk-group" className="grid gap-1">
                  <h5 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                    {group.name}
                  </h5>
                  <ul className="grid divide-y">
                    {group.factors.map((factor) => (
                      <FactorRow
                        key={factor.id}
                        factor={factor}
                        readOnly={readOnly}
                        onEdit={() => setEditing(factor)}
                        onRemove={() => setRemoving(factor)}
                      />
                    ))}
                  </ul>
                </div>
              ))}
            </section>
          ))}
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
  const plan = [
    factor.deadline && `Termen: ${factor.deadline}`,
    factor.responsiblePerson && `Răspunde: ${factor.responsiblePerson}`,
  ].filter(Boolean);
  return (
    <li
      data-testid="risk-factor-row"
      {...rowClickProps(readOnly ? undefined : onEdit)}
      className={cn(
        'grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1.5 py-3 text-sm',
        !readOnly && 'cursor-pointer rounded-md hover:bg-muted/50'
      )}
    >
      <p className="font-medium wrap-anywhere">{factor.description}</p>
      <div className="row-span-2 flex items-start gap-1">
        <RiskLevelBadge level={factor.riskLevel} className="mt-0.5" />
        {!readOnly && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="-mt-1.5 size-8"
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
        )}
      </div>
      <p data-testid="risk-factor-classes" className="text-xs text-muted-foreground">
        Gravitate {factor.gravityClass}: {gravityConsequence(factor.gravityClass)}
        <span aria-hidden="true"> · </span>
        Probabilitate {factor.probabilityClass}:{' '}
        {probabilityFrequency(factor.probabilityClass).period}
      </p>
      {factor.measures.length > 0 && (
        <ul data-testid="risk-factor-measures" className="col-span-2 grid gap-0.5 sm:col-span-1">
          {factor.measures.map((measure) => (
            <li key={measure.id} className="wrap-anywhere">
              <span className="text-muted-foreground">{measureKindLabels[measure.kind]}: </span>
              {measure.description}
            </li>
          ))}
        </ul>
      )}
      {plan.length > 0 && (
        <p className="col-span-2 text-xs text-muted-foreground wrap-anywhere sm:col-span-1">
          {plan.join(' · ')}
        </p>
      )}
      {gap && (
        <p
          data-testid="risk-factor-gap"
          className="col-span-2 flex items-start gap-1.5 text-xs text-warning-foreground sm:col-span-1"
        >
          <TriangleAlert aria-hidden="true" className="mt-px size-3.5 shrink-0" />
          {gap}
        </p>
      )}
    </li>
  );
}
