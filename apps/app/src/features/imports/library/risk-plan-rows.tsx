import { Button } from '@ssm-usor/ui/components/button';
import { ChevronDown, ChevronUp, Pencil, Plus, X } from 'lucide-react';
import { useState } from 'react';

import { RiskLevelTile } from '@/features/risk-evaluations/risk-level-tile';

import type { LabelledSource } from '../review-model';
import { SourceButton } from '../review-parts';
import { DecisionRow, RowActions } from './decision-row';
import {
  factorSource,
  type FactorState,
  planFieldsLine,
  planRowsLine,
  type SheetState,
} from './risks-model';

export function PlanRowText({ description, fields }: { description: string; fields: string }) {
  return (
    <>
      <p className="text-sm wrap-anywhere" data-testid="risk-import-plan-row-description">
        {description}
      </p>
      {fields && <p className="text-[13px] text-muted-foreground wrap-anywhere">{fields}</p>}
    </>
  );
}

function PlanRowItem({
  state,
  sheetFile,
  readOnly,
  onAdd,
  onRemove,
  onSource,
}: {
  state: FactorState;
  sheetFile: string;
  readOnly: boolean;
  onAdd: () => void;
  onRemove: () => void;
  onSource: (source: LabelledSource) => void;
}) {
  const source = factorSource(state, sheetFile);
  const added = state.included;
  return (
    <li
      data-testid="risk-import-plan-row"
      data-key={state.factor.key}
      data-added={added || undefined}
      className="grid gap-x-4 gap-y-2 border-t border-border/70 bg-muted/30 py-3 pr-4 pl-12 sm:grid-cols-[minmax(0,1fr)_auto] sm:pr-5 sm:pl-14"
    >
      <div className="grid min-w-0 gap-1">
        <span className="text-xs font-semibold text-muted-foreground">Din planul de prevenire</span>
        <PlanRowText description={state.description} fields={planFieldsLine(state)} />
        {added && (
          <>
            <div className="mt-1 flex items-center gap-2.5">
              {state.level !== null && <RiskLevelTile level={state.level} />}
              <span className="text-[13px] text-muted-foreground">
                gravitate {state.gravityClass ?? '–'}, probabilitate {state.probabilityClass ?? '–'}
              </span>
            </div>
            <p className="text-[13px] font-medium text-success-foreground">
              Adăugat pe fișă ca factor.
            </p>
          </>
        )}
      </div>
      <RowActions className="sm:items-start">
        {!readOnly && !added && (
          <Button
            type="button"
            variant="outline"
            data-testid="risk-import-plan-row-add"
            aria-label={`Adaugă ca factor: ${state.description}`}
            onClick={onAdd}
          >
            <Plus aria-hidden="true" />
            Adaugă ca factor
          </Button>
        )}
        {!readOnly && added && (
          <>
            <Button
              type="button"
              variant="outline"
              data-testid="risk-import-plan-row-edit"
              aria-label={`Modifică factorul ${state.description}`}
              onClick={onAdd}
            >
              <Pencil aria-hidden="true" />
              Modifică
            </Button>
            <Button
              type="button"
              variant="outline"
              data-testid="risk-import-plan-row-remove"
              aria-label={`Scoate de pe fișă: ${state.description}`}
              onClick={onRemove}
            >
              <X aria-hidden="true" />
              Scoate de pe fișă
            </Button>
          </>
        )}
        <SourceButton
          outlined
          label="Vezi în document"
          sources={[source]}
          onOpen={() => onSource(source)}
        />
      </RowActions>
    </li>
  );
}

export function RiskPlanRows({
  state,
  readOnly,
  onAdd,
  onRemove,
  onSource,
}: {
  state: SheetState;
  readOnly: boolean;
  onAdd: (row: FactorState) => void;
  onRemove: (row: FactorState) => void;
  onSource: (source: LabelledSource) => void;
}) {
  const [open, setOpen] = useState(false);
  const rows = state.planRows;
  if (rows.length === 0) return null;
  const one = rows.length === 1;
  const Chevron = open ? ChevronUp : ChevronDown;
  return (
    <>
      <DecisionRow
        tone={rows.every((row) => row.included) ? 'done' : 'warning'}
        label="Rânduri fără factor"
        testId="risk-import-plan-rows-row"
        actions={
          <Button
            type="button"
            variant="outline"
            data-testid="risk-import-plan-rows-toggle"
            aria-expanded={open}
            onClick={() => setOpen((shown) => !shown)}
          >
            <Chevron aria-hidden="true" />
            {open
              ? one
                ? 'Ascunde rândul'
                : 'Ascunde rândurile'
              : one
                ? 'Arată rândul'
                : 'Arată rândurile'}
          </Button>
        }
      >
        <span data-testid="risk-import-plan-rows-summary">{planRowsLine(state)}</span>
        <span className="text-[13px] text-muted-foreground">
          {one
            ? 'Îl preiei doar dacă îl adaugi ca factor; altfel rămâne în document.'
            : 'Le preiei doar dacă le adaugi ca factori; altfel rămân în document.'}
        </span>
      </DecisionRow>
      {open && (
        <ul data-testid="risk-import-plan-rows">
          {rows.map((row) => (
            <PlanRowItem
              key={row.factor.key}
              state={row}
              sheetFile={state.sheet.file}
              readOnly={readOnly}
              onAdd={() => onAdd(row)}
              onRemove={() => onRemove(row)}
              onSource={onSource}
            />
          ))}
        </ul>
      )}
    </>
  );
}
