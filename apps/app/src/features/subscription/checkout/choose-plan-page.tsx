import type { BillingChoice, BillingOverview } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import { Link, useNavigate } from '@tanstack/react-router';
import { lazy, Suspense, useState } from 'react';

import { Notice } from '@/components/notice';
import { useMe } from '@/features/account/use-me';

import { billingErrorMessage } from '../billing-errors';
import { formatCount } from '../billing-format';
import { ChangeDialog } from '../change-dialog';
import { contactEmail } from '../subscription-copy';
import {
  type BillingOwner,
  currentChoice,
  hasLiveSubscription,
  useBilling,
  viewOf,
} from '../use-billing';
import { useBillingPreview } from '../use-billing-preview';
import { ctaLabel } from './checkout-choice';
import { clampChoice, unavailableReason } from './checkout-choice';
import { CheckoutFrame, type CheckoutState } from './checkout-frame';
import { CheckoutSummary } from './checkout-summary';
import type { ChoosePlanSearch } from './choose-plan-search';
import { PlanPicker } from './plan-picker';

// Stripe's libraries load with the card form, never with the rest of the app.
const StripeCheckout = lazy(() => import('./stripe-checkout'));

export function ChoosePlanPage({ search }: { search: ChoosePlanSearch }) {
  const me = useMe();
  const billing = useBilling();

  if (billing.isPending || !me.data) {
    return (
      <div data-testid="choose-plan-loading" className="grid gap-5">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }
  if (billing.isError) {
    return (
      <Notice
        variant="destructive"
        action={
          <Button
            variant="outline"
            disabled={billing.isFetching}
            onClick={() => void billing.refetch()}
          >
            Încearcă din nou
          </Button>
        }
      >
        Nu am putut încărca abonamentul.
      </Notice>
    );
  }

  const overview = billing.data;
  const owner = overview.owner;
  const isOwner = me.data.membership?.role === 'owner' && !me.data.impersonation;
  const back = (
    <Button variant="outline" asChild>
      <Link to="/organization/subscription">Înapoi la abonament</Link>
    </Button>
  );
  if (!isOwner || !owner) {
    return (
      <Notice variant="info" data-testid="choose-plan-owner-only" action={back}>
        Doar administratorul organizației alege și schimbă planul.
      </Notice>
    );
  }
  if (viewOf(overview.subscription) === 'enterprise') {
    return (
      <Notice variant="info" action={back}>
        Abonamentul Enterprise se schimbă prin email, la {contactEmail}.
      </Notice>
    );
  }
  return <ChoosePlanForm overview={overview} owner={owner} search={search} />;
}

function initialChoice(
  overview: BillingOverview,
  owner: BillingOwner,
  search: ChoosePlanSearch
): BillingChoice {
  const current = currentChoice(overview.subscription);
  const live = hasLiveSubscription(overview.subscription);
  const fallbackPlan = unavailableReason('start', owner) ? 'profesional' : 'start';
  const plan = search.plan ?? current?.plan ?? fallbackPlan;
  const usable = unavailableReason(plan, owner) ? 'profesional' : plan;
  const base: BillingChoice =
    live && current && current.plan === usable
      ? current
      : {
          plan: usable,
          interval: current?.interval ?? 'month',
          employeePacks: 0,
          extraMembers: current?.plan === usable ? current.extraMembers : 0,
        };
  return clampChoice(
    {
      ...base,
      interval: search.interval ?? base.interval,
      employeePacks: search.packs ?? base.employeePacks,
      extraMembers: search.members ?? base.extraMembers,
    },
    owner
  );
}

function ChoosePlanForm({
  overview,
  owner,
  search,
}: {
  overview: BillingOverview;
  owner: BillingOwner;
  search: ChoosePlanSearch;
}) {
  const navigate = useNavigate();
  const subscription = overview.subscription;
  const view = viewOf(subscription);
  const live = hasLiveSubscription(subscription);
  const current = currentChoice(subscription);
  const [choice, setChoice] = useState(() => initialChoice(overview, owner, search));
  const [confirming, setConfirming] = useState<BillingChoice | null>(null);
  const { preview, settling } = useBillingPreview(choice);
  const [busy, setBusy] = useState(false);
  const employees = overview.usage.employees.used ?? 0;
  const members = overview.usage.members.used ?? 0;
  const mode = live && current ? 'change' : 'new';

  const state: CheckoutState = {
    choice,
    preview: preview.data,
    settling,
    previewError: preview.isError ? billingErrorMessage(preview.error) : null,
    inTrial: view === 'trialChosen',
    readOnly: view === 'readOnly',
  };

  const heading = (
    <div className="grid gap-1.5">
      <h1 className="text-[26px] font-bold tracking-tight">
        {mode === 'change' ? 'Schimbă planul' : 'Alege planul'}
      </h1>
      <p className="text-[15px] leading-relaxed text-muted-foreground">
        Ai {formatCount(employees)} {employees === 1 ? 'angajat' : 'de angajați'} la clienți și{' '}
        {members === 1 ? 'un utilizator' : `${members} utilizatori`}. Prețurile sunt fără TVA.
      </p>
    </div>
  );
  const picker = (
    <PlanPicker
      choice={choice}
      owner={owner}
      employees={employees}
      members={members}
      onChange={(next) => setChoice(clampChoice(next, owner))}
      disabled={busy}
    />
  );

  if (mode === 'new') {
    return (
      <Suspense
        fallback={
          <CheckoutFrame
            heading={heading}
            picker={picker}
            card={<Skeleton className="h-64 w-full" />}
            summary={<Skeleton className="h-96 w-full" />}
          />
        }
      >
        <StripeCheckout
          state={state}
          heading={heading}
          picker={picker}
          onBusy={setBusy}
          onDone={() => void navigate({ to: '/organization/subscription' })}
        />
      </Suspense>
    );
  }

  const blocked =
    !preview.data || settling || preview.data.unchanged || preview.data.problems.length > 0;
  return (
    <>
      <CheckoutFrame
        heading={heading}
        picker={picker}
        card={null}
        summary={
          <CheckoutSummary
            mode="change"
            choice={choice}
            preview={preview.data}
            settling={settling}
            inTrial={state.inTrial}
            readOnly={state.readOnly}
          >
            {state.previewError && <Notice variant="destructive">{state.previewError}</Notice>}
            <Button
              className="h-12 rounded-xl text-[15px] font-semibold"
              data-testid="checkout-submit"
              disabled={blocked}
              onClick={() => setConfirming(choice)}
            >
              {ctaLabel('change', choice, preview.data)}
            </Button>
          </CheckoutSummary>
        }
      />
      <ChangeDialog
        current={current!}
        target={confirming}
        inTrial={state.inTrial}
        usage={{ employees, members }}
        onClose={() => setConfirming(null)}
        onDone={() => void navigate({ to: '/organization/subscription' })}
      />
    </>
  );
}
