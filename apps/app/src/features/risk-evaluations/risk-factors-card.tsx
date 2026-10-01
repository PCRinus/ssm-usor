import { gravityConsequence } from '@ssm-usor/contracts';
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
import { useRouteContext } from '@tanstack/react-router';
import { Copy, MoreHorizontal, Plus, TriangleAlert } from 'lucide-react';
import { useState } from 'react';

import { useRemoveRiskFactor } from '@/api/generated/api';
import { rowClickProps } from '@/components/data-table/row-click';
import { Notice } from '@/components/notice';
import { SectionCard } from '@/components/section-card';

import { CopyRiskFactorsDialog } from './copy-risk-factors-dialog';
import { evaluationFailure } from './evaluation-failure';
import {
  componentLabels,
  factorCountLabel,
  factorGap,
  measureKindLabels,
  probabilityNames,
  type RiskEvaluation,
  type RiskFactor,
  sectionsOf,
} from './risk-evaluation-schema';
import { type FactorEditing, RiskFactorDialog } from './risk-factor-dialog';
import { RiskLevelBadge } from './risk-level-badge';
import { useEvaluationCache } from './use-evaluation-cache';

export function RiskFactorsCard({
  id,
  evaluation,
  userId,
  readOnly,
}: {
  id: string;
  evaluation: RiskEvaluation;
  userId: string;
  readOnly: boolean;
}) {
  const { apiRequest } = useRouteContext({ from: '__root__' });
  const cache = useEvaluationCache(evaluation.clientId);
  const remove = useRemoveRiskFactor({ request: apiRequest });
  const [editing, setEditing] = useState<FactorEditing>(null);
  const [removing, setRemoving] = useState<RiskFactor | null>(null);
  const [copying, setCopying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sections = sectionsOf(evaluation.factors);

  async function removeFactor(factor: RiskFactor) {
    setError(null);
    try {
      const result = await remove.mutateAsync({
        clientId: evaluation.clientId,
        evaluationId: evaluation.id,
        factorId: factor.id,
      });
      await cache.saved(result.evaluation);
      toast.success('Factorul a fost șters.');
    } catch (cause) {
      setError(
        evaluationFailure(
          cause,
          'Nu am putut șterge factorul. Verifică conexiunea și încearcă din nou.'
        )
      );
      await cache.refresh(evaluation);
    }
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
            {factorCountLabel(evaluation.factors.length)}
          </span>
        </span>
      }
      action={
        !readOnly && (
          <>
            <Button
              variant="outline"
              size="sm"
              data-testid="risk-factors-copy"
              onClick={() => setCopying(true)}
            >
              <Copy aria-hidden="true" />
              Copiază de la altă evaluare
            </Button>
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
          {readOnly
            ? 'Evaluarea nu are factori de risc. Clientul este arhivat, așa că nu i se mai adaugă.'
            : 'Niciun factor de risc încă. Adaugă-i pe rând, pe componentele sistemului de muncă, sau copiază-i de la o evaluare asemănătoare a clientului.'}
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
        evaluation={evaluation}
        editing={editing}
        onClose={() => setEditing(null)}
      />
      <CopyRiskFactorsDialog
        evaluation={evaluation}
        userId={userId}
        open={copying}
        onClose={() => setCopying(false)}
      />
      <Dialog
        open={removing !== null}
        onOpenChange={(open) => !open && !remove.isPending && setRemoving(null)}
      >
        {removing && (
          <DialogContent data-testid="risk-factor-remove-dialog" className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Ștergi factorul de risc?</DialogTitle>
              <DialogDescription>
                <span className="font-medium text-foreground">{removing.description}</span> și
                măsurile lui nu vor mai apărea în evaluare și în planul de prevenire.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter className="mt-2">
              <Button variant="ghost" disabled={remove.isPending} onClick={() => setRemoving(null)}>
                Renunță
              </Button>
              <Button
                variant="destructive"
                data-testid="risk-factor-remove-confirm"
                disabled={remove.isPending}
                onClick={() => void removeFactor(removing)}
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
        Probabilitate {factor.probabilityClass}: {probabilityNames[factor.probabilityClass]}
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
