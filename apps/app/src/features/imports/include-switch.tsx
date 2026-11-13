import { Switch } from '@ssm-usor/ui/components/switch';
import { cn } from '@ssm-usor/ui/lib/utils';
import { type ReactNode, useEffect } from 'react';

import { replayMask } from '@/app/observability/replay-masking';

import { leftOutByMember } from './include-rule';
import { RowActions } from './library/decision-row';

// The word agrees with the thing left out: "inclusă" for an instrucțiune, instruire or valoare.
export type Agreement = 'masculine' | 'feminine';

const words: Record<Agreement, { on: string; off: string }> = {
  masculine: { on: 'Inclus', off: 'Nu e inclus' },
  feminine: { on: 'Inclusă', off: 'Nu e inclusă' },
};

const includedWord = (included: boolean, agreement: Agreement = 'masculine') =>
  included ? words[agreement].on : words[agreement].off;

// A row that collapses or opens renders another tree, so the switch the member pressed unmounts;
// the one mounted under the same id takes the focus back.
let refocus: string | null = null;

function IncludeSwitch({
  id,
  name,
  included,
  onChange,
  agreement,
  disabled,
  testId,
  holdWordSpace,
}: {
  id: string;
  name: string;
  included: boolean;
  onChange: (included: boolean) => void;
  agreement: Agreement;
  disabled: boolean;
  testId: string;
  holdWordSpace: boolean;
}) {
  useEffect(() => {
    if (refocus !== id) return;
    refocus = null;
    document.getElementById(id)?.focus();
  }, [id]);
  return (
    <span className="inline-flex shrink-0 items-center gap-2.5">
      {(!included || holdWordSpace) && (
        <span
          className={cn(
            'text-[13px] font-medium whitespace-nowrap text-muted-foreground',
            included && 'invisible',
            holdWordSpace && 'max-lg:hidden'
          )}
          aria-hidden="true"
          data-testid={`${testId}-word`}
        >
          {words[agreement].off}
        </span>
      )}
      <Switch
        id={id}
        data-testid={testId}
        aria-label={`${includedWord(included, agreement)}: ${name}`}
        checked={included}
        disabled={disabled}
        onCheckedChange={(next) => {
          refocus = id;
          setTimeout(() => {
            if (refocus === id) refocus = null;
          }, 500);
          onChange(next);
        }}
        className="relative after:absolute after:-inset-x-1 after:-inset-y-3 after:rounded-xl"
      />
    </span>
  );
}

/**
 * Something the import can leave out. `included` is what confirming writes and `proposed` what
 * the documents proposed; the row collapses when `leftOutByMember`.
 */
export function Includable({
  id,
  name,
  included,
  proposed,
  onChange,
  agreement = 'masculine',
  disabled = false,
  testId = 'include-switch',
  holdWordSpace = false,
  collapsedClassName,
  collapsed,
  personal = false,
  children,
}: {
  id: string;
  name: string;
  included: boolean;
  proposed: boolean;
  personal?: boolean;
  onChange: (included: boolean) => void;
  agreement?: Agreement;
  disabled?: boolean;
  testId?: string;
  // Rows that share their columns: the word showing on one row would widen the column and move
  // every switch and button beside it. Below lg the room it holds squeezes the row's text into
  // a narrow column, so there the switch shows the state alone.
  holdWordSpace?: boolean;
  collapsedClassName?: string;
  // The collapsed line when the thing has a look of its own, as an instruction's card.
  collapsed?: (toggle: ReactNode) => ReactNode;
  children: (toggle: ReactNode) => ReactNode;
}) {
  const toggle = (
    <IncludeSwitch
      id={id}
      name={name}
      included={included}
      agreement={agreement}
      disabled={disabled}
      testId={testId}
      holdWordSpace={holdWordSpace}
      onChange={onChange}
    />
  );
  if (!leftOutByMember(included, proposed)) return children(toggle);
  if (collapsed) return collapsed(toggle);
  return (
    <div
      data-testid="left-out-row"
      className={cn('flex min-h-5 items-center justify-between gap-3', collapsedClassName)}
    >
      <span
        className="min-w-0 text-sm font-medium wrap-anywhere text-muted-foreground"
        {...(personal && replayMask)}
      >
        {name}
      </span>
      {toggle}
    </div>
  );
}

export function SwitchRow({
  leading,
  title,
  toggle,
  details,
  actions,
  className,
}: {
  leading?: ReactNode;
  title: ReactNode;
  toggle?: ReactNode;
  details?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('@container/import-row min-w-0', className)}>
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-3 @3xl/import-row:grid-cols-[minmax(0,1fr)_auto_auto]">
        <div className="col-start-1 row-start-1 flex min-h-9 min-w-0 items-start gap-3">
          {leading && <div className="shrink-0">{leading}</div>}
          <div className="flex min-h-9 min-w-0 flex-wrap items-center gap-2">{title}</div>
        </div>
        {actions && (
          <RowActions className="col-span-2 col-start-1 row-start-2 @3xl/import-row:col-span-1 @3xl/import-row:col-start-2 @3xl/import-row:row-start-1 @3xl/import-row:justify-end">
            {actions}
          </RowActions>
        )}
        {toggle && (
          <div className="col-start-2 row-start-1 flex min-h-9 items-center justify-end @3xl/import-row:col-start-3">
            {toggle}
          </div>
        )}
      </div>
      {details && (
        <div className={cn('mt-2 grid min-w-0 gap-1', leading && 'pl-12')}>{details}</div>
      )}
    </div>
  );
}
