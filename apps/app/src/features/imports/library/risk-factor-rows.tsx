import { Button } from '@ssm-usor/ui/components/button';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Info, Pencil, TriangleAlert } from 'lucide-react';

import { measureCountLabel } from '@/features/risk-evaluations/factor-list';
import { componentLabels } from '@/features/risk-evaluations/risk-evaluation-schema';
import { RiskLevelTile } from '@/features/risk-evaluations/risk-level-tile';

import { IncludeSwitch, LeftOutRow, SwitchRow } from '../include-switch';
import type { LabelledSource } from '../review-model';
import { SourceButton } from '../review-parts';
import {
  asksToCheck,
  byComponent,
  factorFlagText,
  factorSource,
  type FactorState,
  lacksText,
  measureGap,
  missingText,
  removedByMember,
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
  if (removedByMember(state)) {
    return (
      <li
        data-testid="risk-import-factor"
        data-key={state.factor.key}
        className="border-t border-border/70 px-4 py-3 sm:px-5"
      >
        <LeftOutRow
          name={state.description}
          disabled={readOnly}
          switchTestId="risk-import-factor-included"
          onInclude={() => onToggle(true)}
        />
      </li>
    );
  }
  const plan = planLine(state);
  const gap = state.included && !readOnly ? measureGap(state) : null;
  const flags = gap?.explainsLevel
    ? state.flags.filter((flag) => flag.kind !== 'level_mismatch')
    : state.flags;
  const source = factorSource(state, sheetFile);
  const muted = !state.included;
  return (
    <li
      data-testid="risk-import-factor"
      data-key={state.factor.key}
      data-included={state.included || undefined}
      className={cn(
        'border-t border-border/70 px-4 py-3 sm:px-5',
        refused && 'bg-destructive-soft/40'
      )}
    >
      <SwitchRow
        leading={
          state.level !== null ? (
            <RiskLevelTile level={state.level} className={cn(muted && 'opacity-50')} />
          ) : (
            <span
              className="inline-grid size-9 place-items-center rounded-[9px] border border-dashed text-muted-foreground"
              title="Lipsește o clasă"
            >
              <span aria-hidden="true">–</span>
              <span className="sr-only">Fără nivel: lipsește o clasă</span>
            </span>
          )
        }
        title={
          <p
            className={cn('text-sm wrap-anywhere', muted && 'text-muted-foreground')}
            data-testid="risk-import-factor-description"
          >
            {state.description}
          </p>
        }
        toggle={
          <IncludeSwitch
            name={state.description}
            included={state.included}
            disabled={readOnly}
            testId="risk-import-factor-included"
            onChange={onToggle}
          />
        }
        details={
          <>
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
                Alege {missingText(state.missing)} ca să-l poți prelua.
              </p>
            )}
            {refused && (
              <p className="text-[13px] font-medium text-destructive" role="alert">
                {state.missing.length > 0
                  ? `E inclus, dar ${lacksText(state.missing)}. Completează-l sau oprește-l.`
                  : 'E inclus, dar nu a fost primit. Verifică-l sau oprește-l.'}
              </p>
            )}
            {gap && (
              <p
                className="flex items-start gap-1.5 text-[13px] font-medium text-warning-foreground"
                data-testid="risk-import-factor-measure-gap"
              >
                <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                <span>{gap.text}</span>
              </p>
            )}
            {flags.length > 0 && (
              <ul className="flex flex-wrap gap-1.5" data-testid="risk-import-factor-flags">
                {flags.map((flag, index) => (
                  <FlagChip key={index} text={factorFlagText(flag)} informs={!asksToCheck(flag)} />
                ))}
              </ul>
            )}
          </>
        }
        actions={
          <>
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
                aria-label={`Schimbă factorul ${state.description}`}
                onClick={onEdit}
              >
                <Pencil aria-hidden="true" />
                Schimbă
              </Button>
            )}
          </>
        }
      />
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
