import { Button } from '@ssm-usor/ui/components/button';
import { Checkbox } from '@ssm-usor/ui/components/checkbox';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Info, Pencil, TriangleAlert } from 'lucide-react';

import { measureCountLabel } from '@/features/risk-evaluations/factor-list';
import { componentLabels } from '@/features/risk-evaluations/risk-evaluation-schema';
import { RiskLevelTile } from '@/features/risk-evaluations/risk-level-tile';

import type { LabelledSource } from '../review-model';
import { SourceButton } from '../review-parts';
import {
  asksToCheck,
  byComponent,
  factorFlagText,
  factorSource,
  type FactorState,
} from './risks-model';

function FlagChip({ text, informs }: { text: string; informs: boolean }) {
  return (
    <li
      className={cn(
        'inline-flex max-w-full items-start gap-1.5 rounded-md border px-2 py-1 text-[12.5px] leading-snug font-medium',
        informs
          ? 'border-info-border bg-info text-info-foreground'
          : 'border-warning-border bg-warning text-warning-foreground'
      )}
      data-testid="risk-factor-flag"
    >
      {informs ? (
        <Info className="mt-px size-3.5 shrink-0" aria-hidden="true" />
      ) : (
        <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />
      )}
      <span className="wrap-anywhere">{text}</span>
    </li>
  );
}

function planLine(state: FactorState) {
  return [
    state.deadline && `Termen: ${state.deadline}`,
    state.responsiblePerson && `Răspunde: ${state.responsiblePerson}`,
    state.actions && `Acțiuni: ${state.actions}`,
    state.observations && `Observații: ${state.observations}`,
  ]
    .filter(Boolean)
    .join(' · ');
}

function FactorRow({
  state,
  sheetFile,
  readOnly,
  refused,
  onToggle,
  onEdit,
  onSource,
}: {
  state: FactorState;
  sheetFile: string;
  readOnly: boolean;
  refused: boolean;
  onToggle: (included: boolean) => void;
  onEdit: () => void;
  onSource: (source: LabelledSource) => void;
}) {
  const plan = planLine(state);
  const source = factorSource(state, sheetFile);
  const muted = !state.included;
  return (
    <li
      data-testid="risk-import-factor"
      data-key={state.factor.key}
      data-included={state.included || undefined}
      className={cn(
        'grid grid-cols-[1.25rem_2.25rem_minmax(0,1fr)] items-start gap-x-3 gap-y-2 border-t border-border/70 px-4 py-3 sm:grid-cols-[1.25rem_2.25rem_minmax(0,1fr)_auto] sm:px-5',
        refused && 'bg-destructive-soft/40'
      )}
    >
      <Checkbox
        className="mt-2.5"
        data-testid="risk-import-factor-included"
        aria-label={`Preiei factorul: ${state.description}`}
        checked={state.included}
        disabled={readOnly}
        onCheckedChange={(checked) => onToggle(checked === true)}
      />
      {state.level !== null ? (
        <RiskLevelTile level={state.level} className={cn(muted && 'opacity-50')} />
      ) : (
        <span
          className="inline-grid size-9 place-items-center rounded-[9px] border border-dashed text-muted-foreground"
          title="Lipsește o clasă"
        >
          <span aria-hidden="true">–</span>
          <span className="sr-only">Fără nivel: lipsește o clasă</span>
        </span>
      )}
      <div className={cn('grid min-w-0 gap-1', muted && 'text-muted-foreground')}>
        <p className="text-sm wrap-anywhere" data-testid="risk-import-factor-description">
          {state.description}
        </p>
        <p className="text-[13px] text-muted-foreground wrap-anywhere">
          {state.group || 'Fără grupă'}
          {' · '}
          <span data-testid="risk-import-factor-classes">
            gravitate {state.gravityClass ?? '–'}, probabilitate {state.probabilityClass ?? '–'}
          </span>
          {' · '}
          {measureCountLabel(state.measures.length).toLowerCase()}
        </p>
        {plan && <p className="text-[13px] text-muted-foreground wrap-anywhere">{plan}</p>}
        {!state.complete && !readOnly && (
          <p className="text-[13px] font-medium text-warning-foreground">
            Alege {state.component === null ? 'componenta și clasele' : 'clasele'} ca să-l poți
            prelua.
          </p>
        )}
        {refused && (
          <p className="text-[13px] font-medium text-destructive" role="alert">
            E bifat, dar nu are toate clasele. Alege-le sau debifează-l.
          </p>
        )}
        {state.flags.length > 0 && (
          <ul className="flex flex-wrap gap-1.5" data-testid="risk-import-factor-flags">
            {state.flags.map((flag, index) => (
              <FlagChip key={index} text={factorFlagText(flag)} informs={!asksToCheck(flag)} />
            ))}
          </ul>
        )}
      </div>
      <div className="col-span-3 grid grid-cols-2 gap-2 sm:col-span-1 sm:flex">
        <SourceButton
          outlined
          label="Vezi în document"
          sources={[source]}
          onOpen={() => onSource(source)}
        />
        {!readOnly && (
          <Button
            type="button"
            variant="outline"
            data-testid="risk-import-factor-edit"
            aria-label={`Modifică factorul ${state.description}`}
            onClick={onEdit}
          >
            <Pencil aria-hidden="true" />
            Modifică
          </Button>
        )}
      </div>
    </li>
  );
}

export function RiskFactorRows({
  factors,
  sheetFile,
  readOnly,
  refused,
  onToggle,
  onEdit,
  onSource,
}: {
  factors: readonly FactorState[];
  sheetFile: string;
  readOnly: boolean;
  refused: ReadonlySet<string>;
  onToggle: (state: FactorState, included: boolean) => void;
  onEdit: (state: FactorState) => void;
  onSource: (source: LabelledSource) => void;
}) {
  return (
    <div data-testid="risk-import-factors">
      {byComponent(factors).map((group) => (
        <section
          key={group.component ?? 'none'}
          aria-label={group.component ? componentLabels[group.component] : 'Fără componentă'}
        >
          <h4 className="border-t border-border/70 bg-muted/45 px-4 py-1.5 text-xs font-semibold text-muted-foreground sm:px-5">
            {group.component ? componentLabels[group.component] : 'Fără componentă'}{' '}
            <span className="font-normal tabular-nums">{group.factors.length}</span>
          </h4>
          <ul>
            {group.factors.map((state) => (
              <FactorRow
                key={state.factor.key}
                state={state}
                sheetFile={sheetFile}
                readOnly={readOnly}
                refused={refused.has(state.factor.key)}
                onToggle={(included) => onToggle(state, included)}
                onEdit={() => onEdit(state)}
                onSource={onSource}
              />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
