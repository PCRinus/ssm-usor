import { type BillingSmsUsage, smsCapFactor, smsOverage } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@ssm-usor/ui/components/dialog';
import { Label } from '@ssm-usor/ui/components/label';
import { NativeSelect, NativeSelectOption } from '@ssm-usor/ui/components/native-select';
import { toast } from '@ssm-usor/ui/lib/toast';
import { useRouteContext } from '@tanstack/react-router';
import { useState } from 'react';

import { useUpdateSmsCap } from '@/api/generated/api';
import { HelpLink } from '@/components/help-link';
import { Notice } from '@/components/notice';

import { billingErrorMessage } from './billing-errors';
import { formatCount, formatEuro } from './billing-format';
import { codesLabel, smsPrice } from './sms-copy';
import { roDate } from './subscription-copy';
import { refreshBilling } from './use-billing';

const factors = Array.from(
  { length: smsCapFactor.max - smsCapFactor.default + 1 },
  (_, index) => smsCapFactor.default + index
);

export function SmsCapDialog({
  sms,
  open,
  onClose,
}: {
  sms: BillingSmsUsage;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent data-testid="sms-cap-dialog" className="sm:max-w-[520px]">
        {open && sms.allowance !== null && sms.capFactor !== null && (
          <SmsCapForm
            sms={sms}
            allowance={sms.allowance}
            current={sms.capFactor}
            onClose={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function SmsCapForm({
  sms,
  allowance,
  current,
  onClose,
}: {
  sms: BillingSmsUsage;
  allowance: number;
  current: number;
  onClose: () => void;
}) {
  const { apiRequest, queryClient } = useRouteContext({ from: '__root__' });
  const update = useUpdateSmsCap({ request: apiRequest });
  const [factor, setFactor] = useState(Math.min(current + 1, smsCapFactor.max));
  const [error, setError] = useState<string | null>(null);
  // Codes granted by hand raise the cap by as many, so the numbers here match the meter's.
  const capAt = (multiple: number) => allowance * multiple + sms.granted;
  const included = allowance + sms.granted;
  const cap = capAt(factor);
  const unchanged = factor === current;
  const renews = sms.periodEnd ? roDate(sms.periodEnd) : null;

  async function save() {
    setError(null);
    try {
      await update.mutateAsync({ data: { factor } });
      toast.success(`Limita e acum de ${codesLabel(cap)} pe lună.`);
      await refreshBilling(queryClient);
      onClose();
    } catch (cause) {
      setError(billingErrorMessage(cause));
    }
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!unchanged) void save();
      }}
      aria-busy={update.isPending}
      noValidate
    >
      <DialogHeader>
        <DialogTitle className="text-xl leading-snug font-bold">
          Ridică limita de siguranță
        </DialogTitle>
        <DialogDescription className="leading-relaxed text-pretty">
          Peste limită, codurile de semnare nu mai pleacă prin SMS, ca o lună neobișnuită să nu
          coste mai mult decât ai hotărât. Acum e de {codesLabel(capAt(current))} pe lună, de{' '}
          {current} ori cele {formatCount(allowance)} ale planului.{' '}
          <HelpLink topic="organizatie.limita-sms">Află mai mult</HelpLink>
        </DialogDescription>
      </DialogHeader>
      <DialogBody className="mt-5 grid gap-5">
        <div className="grid gap-2">
          <Label htmlFor="sms-cap-factor">Limita nouă</Label>
          <NativeSelect
            id="sms-cap-factor"
            data-testid="sms-cap-factor"
            value={String(factor)}
            disabled={update.isPending}
            onChange={(event) => setFactor(Number(event.target.value))}
          >
            {factors.map((option) => (
              <NativeSelectOption key={option} value={String(option)}>
                {codesLabel(capAt(option))} pe lună
                {option === current ? ' (acum)' : ''}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
        <div
          data-testid="sms-cap-summary"
          className="grid gap-1.5 rounded-lg bg-muted/60 px-4 py-3 text-sm leading-relaxed"
        >
          <p className="font-semibold">Până la {codesLabel(cap)} pe lună.</p>
          <p className="text-muted-foreground">
            Cele peste {formatCount(included)} incluse costă {smsPrice} fiecare și apar pe factura
            lunii: cel mult {formatEuro((cap - included) * smsOverage.price.unitAmount)} + TVA pe
            lună. Limita rămâne așa până o schimbi.
          </p>
          {!unchanged && sms.used >= cap && (
            <p data-testid="sms-cap-still-reached" className="text-warning-foreground">
              Luna aceasta s-au trimis deja {codesLabel(sms.used)}, așa că până pe{' '}
              {renews ?? 'luna următoare'} codurile pleacă tot pe email.
            </p>
          )}
        </div>
        {error && (
          <Notice variant="destructive" data-testid="sms-cap-error">
            {error}
          </Notice>
        )}
      </DialogBody>
      <DialogFooter className="mt-6">
        <Button
          type="button"
          variant="outline"
          className="h-11 font-semibold"
          disabled={update.isPending}
          onClick={onClose}
        >
          Renunță
        </Button>
        <Button
          type="submit"
          className="h-11 font-semibold"
          data-testid="sms-cap-save"
          disabled={update.isPending || unchanged}
        >
          {update.isPending
            ? 'Se salvează…'
            : factor < current
              ? 'Coboară limita'
              : 'Ridică limita'}
        </Button>
      </DialogFooter>
    </form>
  );
}
