import { type BillingExtra, type BillingExtras, type ExtraKind } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { Input } from '@ssm-usor/ui/components/input';
import { Label } from '@ssm-usor/ui/components/label';
import { Switch } from '@ssm-usor/ui/components/switch';
import { toast } from '@ssm-usor/ui/lib/toast';
import { cn } from '@ssm-usor/ui/lib/utils';
import { Link, useRouteContext } from '@tanstack/react-router';
import { type FormEvent, type ReactNode, useId, useState } from 'react';

import { setBillingExtra } from '@/api/generated/api';

import { billingErrorMessage } from './billing-errors';
import { BillingCard, UsageBar } from './billing-ui';
import {
  ceilingBuys,
  ceilingNote,
  checkCeiling,
  extraNames,
  extraOnLine,
  extraRowState,
  savedMessage,
  unavailableNote,
} from './extras-copy';
import { refreshBilling } from './use-billing';

const kinds = ['sms', 'credits'] as const satisfies ExtraKind[];

export function ExtrasCard({
  extras,
  owner,
  canAct,
  renewsAt,
  firstPaymentAt = null,
}: {
  extras: BillingExtras;
  owner: boolean;
  canAct: boolean;
  renewsAt: string | null;
  firstPaymentAt?: string | null;
}) {
  const note = unavailableNote(extras.unavailable, firstPaymentAt);
  const ownerRows = owner && (extras.unavailable === null || extras.unavailable === 'past_due');
  const bothOff = !extras.sms.enabled && !extras.credits.enabled;
  return (
    <BillingCard
      id="extra"
      title="Extra"
      help="organizatie.extra"
      aria-label="Extra"
      data-testid="extras-card"
      className="scroll-mt-24"
    >
      {owner && bothOff && extras.unavailable === null && (
        <p className="max-w-[68ch] text-sm leading-relaxed text-pretty text-muted-foreground">
          Peste ce include planul, codurile de semnare pleacă pe email, iar un import pe care
          creditele rămase nu-l acoperă așteaptă luna următoare.
        </p>
      )}
      <div className="grid gap-3">
        {kinds.map((kind) =>
          ownerRows ? (
            <OwnerRow
              key={kind}
              kind={kind}
              extra={extras[kind]}
              suspended={extras.unavailable === 'past_due'}
              canAct={canAct}
              renewsAt={renewsAt}
            />
          ) : (
            <PlainRow
              key={kind}
              kind={kind}
              extra={extras[kind]}
              suspended={extras.unavailable === 'past_due'}
            />
          )
        )}
      </div>
      {owner && note && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2" data-testid="extras-note">
          <p className="min-w-0 flex-[1_1_200px] text-[13px] leading-relaxed text-muted-foreground">
            {note}
          </p>
          {extras.unavailable === 'trial' && !firstPaymentAt && canAct && (
            <Button asChild className="h-9 font-semibold">
              <Link to="/organizatie/abonament/alege">Alege un plan</Link>
            </Button>
          )}
        </div>
      )}
      {!owner && (
        <p className="text-[13px] leading-relaxed text-muted-foreground">
          Doar adminul organizației pornește Extra și alege plafonul.
        </p>
      )}
      {owner && extras.unavailable === null && (
        <p className="border-t pt-3 text-[13px] leading-relaxed text-muted-foreground">
          {ceilingNote}
        </p>
      )}
    </BillingCard>
  );
}

function RowHead({ kind, children }: { kind: ExtraKind; children?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="grid min-w-0 gap-0.5">
        <span className="text-sm font-semibold">{extraNames[kind].label}</span>
        <span className="text-[13px] text-muted-foreground tabular-nums">
          {extraNames[kind].rate}
        </span>
      </div>
      {children}
    </div>
  );
}

function PlainRow({
  kind,
  extra,
  suspended,
}: {
  kind: ExtraKind;
  extra: BillingExtra;
  suspended: boolean;
}) {
  const on = extra.enabled && !suspended;
  return (
    <div data-testid={`extra-${kind}`} className="rounded-lg border px-3 py-2.5">
      <RowHead kind={kind}>
        <span
          className={cn(
            'inline-flex h-6 items-center rounded-full px-2.5 text-xs font-semibold whitespace-nowrap',
            on ? 'bg-primary text-primary-foreground' : 'border bg-muted text-muted-foreground'
          )}
        >
          {on ? 'Pornit' : extra.enabled ? 'Oprit până la plată' : 'Oprit'}
        </span>
      </RowHead>
    </div>
  );
}

function OwnerRow({
  kind,
  extra,
  suspended,
  canAct,
  renewsAt,
}: {
  kind: ExtraKind;
  extra: BillingExtra;
  suspended: boolean;
  canAct: boolean;
  renewsAt: string | null;
}) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const state = extraRowState(extra, suspended ? 'past_due' : null);

  async function save(euros: number | null) {
    setBusy(true);
    setError(null);
    try {
      await setBillingExtra(kind, { ceilingEuros: euros }, apiRequest);
    } catch (cause) {
      setError(billingErrorMessage(cause));
      setBusy(false);
      return;
    }
    toast.success(savedMessage(kind, euros));
    // Saved either way; a page that failed to reload shows the change on the next one.
    await refreshBilling(queryClient).catch(() => undefined);
    setEditing(false);
    setBusy(false);
  }

  return (
    <div
      data-testid={`extra-${kind}`}
      data-state={state}
      className={cn(
        'grid gap-2.5 rounded-lg border px-3 py-3',
        state === 'reached' && 'border-destructive/40 bg-destructive/5'
      )}
    >
      <RowHead kind={kind}>
        <Switch
          checked={extra.enabled || editing}
          disabled={!canAct || busy || (suspended && !extra.enabled)}
          aria-label={extraNames[kind].label}
          data-testid={`extra-${kind}-switch`}
          onCheckedChange={(on) => {
            setError(null);
            if (on) setEditing(true);
            else if (editing && !extra.enabled) setEditing(false);
            else void save(null);
          }}
        />
      </RowHead>
      {extra.enabled && !editing && (
        <>
          {state !== 'suspended' && extra.limit !== null && extra.limit > 0 && (
            <UsageBar
              used={extra.used ?? 0}
              limit={extra.limit}
              label={`${extraNames[kind].label}, folosit din plafon`}
              tone={state === 'reached' ? 'danger' : 'over'}
            />
          )}
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
            <p
              data-testid={`extra-${kind}-line`}
              className={cn(
                'min-w-0 flex-[1_1_180px] text-[13px] leading-relaxed text-pretty tabular-nums',
                state === 'reached' ? 'text-destructive-foreground' : 'text-muted-foreground'
              )}
            >
              {state === 'suspended'
                ? `Oprit până la plată. Plafon ${(extra.ceilingCents ?? 0) / 100} € pe lună.`
                : extraOnLine(kind, extra, renewsAt)}
            </p>
            {canAct && (
              <Button
                variant={state === 'reached' ? 'default' : 'outline'}
                className="h-8 px-3 text-[13px] font-semibold"
                disabled={busy}
                data-testid={`extra-${kind}-edit`}
                onClick={() => setEditing(true)}
              >
                {state === 'reached' ? 'Mărește plafonul' : 'Modifică'}
              </Button>
            )}
          </div>
        </>
      )}
      {editing && (
        <CeilingForm
          kind={kind}
          initial={extra.ceilingCents === null ? '' : String(extra.ceilingCents / 100)}
          turningOn={!extra.enabled}
          busy={busy}
          onCancel={() => {
            setEditing(false);
            setError(null);
          }}
          onSave={(euros) => void save(euros)}
        />
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

function CeilingForm({
  kind,
  initial,
  turningOn,
  busy,
  onCancel,
  onSave,
}: {
  kind: ExtraKind;
  initial: string;
  turningOn: boolean;
  busy: boolean;
  onCancel: () => void;
  onSave: (euros: number) => void;
}) {
  const id = useId();
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const check = checkCeiling(value);

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!check.ok) {
      setError(check.error);
      return;
    }
    setError(null);
    onSave(check.euros);
  }

  return (
    <form noValidate onSubmit={submit} className="grid gap-1.5" data-testid={`extra-${kind}-form`}>
      <Label htmlFor={id} className="text-[13px] font-medium">
        Plafon lunar
      </Label>
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex h-10 w-[148px] items-center gap-1.5 rounded-md border bg-card pr-3 focus-within:ring-[3px] focus-within:ring-ring/50 has-[[aria-invalid=true]]:border-destructive">
          <Input
            id={id}
            data-testid={`extra-${kind}-ceiling`}
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            value={value}
            aria-invalid={error ? true : undefined}
            aria-describedby={`${id}-hint`}
            onChange={(event) => {
              setValue(event.target.value);
              setError(null);
            }}
            className="h-9 min-w-0 flex-1 border-0 text-right font-semibold tabular-nums shadow-none focus-visible:ring-0"
          />
          <span className="text-[13px] whitespace-nowrap text-muted-foreground">€ pe lună</span>
        </div>
        <Button type="submit" className="h-10 font-semibold" disabled={busy}>
          {busy ? 'Se salvează…' : turningOn ? 'Pornește' : 'Salvează'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="h-10 px-3 font-semibold"
          onClick={onCancel}
        >
          Renunță
        </Button>
      </div>
      <p
        id={`${id}-hint`}
        role={error ? 'alert' : undefined}
        className={cn(
          'text-[13px] leading-relaxed text-pretty',
          error ? 'text-destructive' : 'text-muted-foreground'
        )}
      >
        {error ?? (check.ok ? ceilingBuys(kind, check.euros) : 'De la 1 € la 500 €, fără TVA.')}
      </p>
    </form>
  );
}
