import type { BillingChoice, BillingOverview } from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import { Link, useNavigate } from '@tanstack/react-router';
import { lazy, type ReactNode, Suspense, useState } from 'react';

import { BackLink, TitleWithBack } from '@/components/back-link';
import { Notice } from '@/components/notice';
import { useMe } from '@/features/account/use-me';

import { billingErrorMessage, problemMessage } from '../billing-errors';
import { employeesLabel } from '../billing-format';
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
import {
  choiceOf,
  ctaLabel,
  employeeStops,
  fitPick,
  minimumStop,
  type Pick,
} from './checkout-choice';
import { CheckoutFrame, type CheckoutState } from './checkout-frame';
import { CheckoutSummary } from './checkout-summary';
import type { ChoosePlanSearch } from './choose-plan-search';
import { PlanPicker } from './plan-picker';

// Stripe's libraries load with the card form, never with the rest of the app.
const StripeCheckout = lazy(() => import('./stripe-checkout'));

const up = <BackLink to="/organizatie/abonament" label="Înapoi la abonament" />;

function WithBack({ children }: { children: ReactNode }) {
  return (
    <div className="grid gap-4">
      <div className="flex">{up}</div>
      {children}
    </div>
  );
}

export function ChoosePlanPage({ search }: { search: ChoosePlanSearch }) {
  const me = useMe();
  // Coming back from the bank's app focuses the window mid-confirmation; a refetch then must
  // not reshape the page under the card form.
  const billing = useBilling({ refetchOnWindowFocus: false });

  if (billing.isPending || !me.data) {
    return (
      <div data-testid="choose-plan-loading" className="grid gap-5">
        <TitleWithBack back={up}>
          <Skeleton className="h-9 w-64 max-w-full" />
        </TitleWithBack>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }
  if (billing.isError) {
    return (
      <WithBack>
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
      </WithBack>
    );
  }

  const overview = billing.data;
  const owner = overview.owner;
  const isOwner = me.data.membership?.role === 'owner' && !me.data.impersonation;
  const back = (
    <Button variant="outline" asChild>
      <Link to="/organizatie/abonament">Înapoi la abonament</Link>
    </Button>
  );
  if (!isOwner || !owner) {
    return (
      <WithBack>
        <Notice variant="info" data-testid="choose-plan-owner-only" action={back}>
          Doar adminul organizației alege și schimbă planul.
        </Notice>
      </WithBack>
    );
  }
  if (viewOf(overview.subscription) === 'enterprise') {
    return (
      <WithBack>
        <Notice variant="info" action={back}>
          Abonamentul Enterprise se schimbă prin email, la {contactEmail}.
        </Notice>
      </WithBack>
    );
  }
  return <ChoosePlanForm overview={overview} owner={owner} search={search} />;
}

function initialPick(
  overview: BillingOverview,
  owner: BillingOwner,
  search: ChoosePlanSearch
): Pick {
  const current = currentChoice(overview.subscription);
  const employees = overview.usage.employees.used ?? 0;
  return fitPick(
    {
      plan: search.plan ?? current?.plan ?? 'start',
      stop: search.step ?? current?.step ?? minimumStop(employees) ?? employeeStops[0]!,
      interval: search.interval ?? current?.interval ?? 'year',
    },
    owner,
    employees
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
  const [pick, setPick] = useState(() => initialPick(overview, owner, search));
  const choice = choiceOf(pick);
  const [confirming, setConfirming] = useState<BillingChoice | null>(null);
  const { preview, settling } = useBillingPreview(choice);
  const [busy, setBusy] = useState(false);
  const employees = overview.usage.employees.used ?? 0;
  const members = overview.usage.members.used ?? 0;
  // A plan chosen with a trial end whose card never confirmed is chosen again with the card form; the mode stays as it opened, so the card form never disappears while the bank
  // confirms.
  const [mode] = useState(() =>
    live && current && !(view === 'trialChosen' && owner.card === null) ? 'change' : 'new'
  );

  const welcomeAhead = mode === 'new' && subscription?.status === 'trialing';

  const state: CheckoutState = {
    choice,
    preview: preview.data,
    settling,
    previewError: preview.isError ? billingErrorMessage(preview.error) : null,
    inTrial: view === 'trialChosen',
    endsTrial: mode === 'new' && subscription?.status === 'trialing' && view !== 'readOnly',
    welcomeAhead,
    readOnly: view === 'readOnly',
  };

  const heading = (
    <TitleWithBack back={up}>
      <div className="grid gap-1.5">
        <h1 className="text-[26px] font-bold tracking-tight">
          {mode === 'change' ? 'Schimbă planul' : 'Alege planul'}
        </h1>
        <p className="text-[15px] leading-relaxed text-muted-foreground">
          Ai {employeesLabel(employees)} la clienți și{' '}
          {members === 1 ? 'un utilizator' : `${members} utilizatori`}. Prețurile sunt fără TVA.
        </p>
      </div>
    </TitleWithBack>
  );
  const picker = (
    <PlanPicker
      pick={pick}
      owner={owner}
      employees={employees}
      onChange={(next) => setPick(fitPick(next, owner, employees))}
      disabled={busy}
      welcomeAhead={welcomeAhead}
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
          onDone={() => void navigate({ to: '/organizatie/abonament' })}
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
            {!settling &&
              preview.data?.problems.map((problem) => (
                <Notice key={problem.reason} variant="warning" data-testid="checkout-problem">
                  {problemMessage(problem)}
                </Notice>
              ))}
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
        onClose={() => setConfirming(null)}
        onDone={() => void navigate({ to: '/organizatie/abonament' })}
      />
    </>
  );
}
