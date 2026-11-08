import { Switch } from '@ssm-usor/ui/components/switch';
import { cn } from '@ssm-usor/ui/lib/utils';
import { type ReactNode, useEffect } from 'react';

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
}: {
  id: string;
  name: string;
  included: boolean;
  onChange: (included: boolean) => void;
  agreement: Agreement;
  disabled: boolean;
  testId: string;
}) {
  useEffect(() => {
    if (refocus !== id) return;
    refocus = null;
    document.getElementById(id)?.focus();
  }, [id]);
  return (
    <span className="inline-flex shrink-0 items-center gap-2.5">
      {!included && (
        <span
          className="text-[13px] font-medium whitespace-nowrap text-muted-foreground"
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
  collapsedClassName,
  collapsed,
  children,
}: {
  id: string;
  name: string;
  included: boolean;
  proposed: boolean;
  onChange: (included: boolean) => void;
  agreement?: Agreement;
  disabled?: boolean;
  testId?: string;
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
      <span className="min-w-0 text-sm font-medium wrap-anywhere text-muted-foreground">
        {name}
      </span>
      {toggle}
    </div>
  );
}

const switchRowLayouts = {
  plain: {
    grid: 'gap-x-5 grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[minmax(0,1fr)_auto_auto]',
    line: 'min-h-5',
    title: 'col-start-1',
    toggle: 'col-start-2 sm:col-start-3',
    details: 'col-span-2 sm:col-span-1 sm:col-start-1',
    actions: 'col-span-2 sm:col-span-1 sm:col-start-2 sm:-mt-2',
  },
  leading: {
    grid: 'gap-x-3 grid-cols-[auto_minmax(0,1fr)_auto] sm:gap-x-4 sm:grid-cols-[auto_minmax(0,1fr)_auto_auto]',
    line: 'min-h-9',
    title: 'col-start-2',
    toggle: 'col-start-3 sm:col-start-4',
    details: 'col-span-2 col-start-2 sm:col-span-1 sm:col-start-2',
    actions: 'col-span-3 col-start-1 sm:col-span-1 sm:col-start-3 sm:mt-0',
  },
};

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
  const layout = switchRowLayouts[leading ? 'leading' : 'plain'];
  return (
    <div className={cn('grid gap-y-1', layout.grid, className)}>
      {leading && <div className="col-start-1 row-start-1">{leading}</div>}
      <div
        className={cn(
          'row-start-1 flex min-w-0 flex-wrap items-center gap-2',
          layout.line,
          layout.title
        )}
      >
        {title}
      </div>
      {toggle && (
        <div
          className={cn('row-start-1 flex items-center justify-end', layout.line, layout.toggle)}
        >
          {toggle}
        </div>
      )}
      {details && (
        <div className={cn('grid min-w-0 gap-1 sm:row-start-2', layout.details)}>{details}</div>
      )}
      {actions && (
        <RowActions
          className={cn(
            'mt-1 self-start sm:row-span-2 sm:row-start-1 sm:justify-end',
            layout.actions
          )}
        >
          {actions}
        </RowActions>
      )}
    </div>
  );
}
