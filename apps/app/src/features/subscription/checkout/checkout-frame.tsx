import type { BillingChoice, BillingPreview } from '@ssm-usor/contracts';
import type { ReactNode } from 'react';

export interface CheckoutFrameProps {
  heading: ReactNode;
  picker: ReactNode;
  card: ReactNode;
  summary: ReactNode;
}

export function CheckoutFrame({ heading, picker, card, summary }: CheckoutFrameProps) {
  return (
    <div data-testid="choose-plan-page" className="grid gap-[18px] sm:gap-6">
      {heading}
      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-6">
        <div className="grid min-w-0 gap-4 sm:gap-5">
          {picker}
          {card}
        </div>
        {summary}
      </div>
    </div>
  );
}

export interface CheckoutState {
  choice: BillingChoice;
  preview: BillingPreview | undefined;
  settling: boolean;
  previewError: string | null;
  // A plan chosen during the trial before 2026-11-14, which Stripe charges at the trial's end.
  inTrial: boolean;
  endsTrial: boolean;
  welcomeAhead: boolean;
  readOnly: boolean;
}
