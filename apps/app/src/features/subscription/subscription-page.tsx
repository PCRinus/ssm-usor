import {
  type BillingChoice,
  type BillingOverview,
  formatCount,
  type PaidPlan,
  readOnlyDays,
  selfServeLimits,
} from '@ssm-usor/contracts';
import { Button } from '@ssm-usor/ui/components/button';
import { Skeleton } from '@ssm-usor/ui/components/skeleton';
import { toast } from '@ssm-usor/ui/lib/toast';
import { Link } from '@tanstack/react-router';
import { Info } from 'lucide-react';
import { type ReactNode, useState } from 'react';

import {
  changeSubscription,
  createBillingPortalSession,
  resumeSubscription,
} from '@/api/generated/api';
import { useApi } from '@/api/use-api';
import { openedHere } from '@/app/opener';
import { LoadFailed } from '@/components/load-failed';
import { Notice } from '@/components/notice';
import { useMe } from '@/features/account/use-me';
import { workerNoun } from '@/features/employees/employee-format';
import { formatRoDate } from '@/lib/dates';

import { billingErrorMessage } from './billing-errors';
import { addDays, cardBrand, formatEuro } from './billing-format';
import { BillingCard } from './billing-ui';
import { CancelDialog } from './cancel-dialog';
import { ChangeDialog } from './change-dialog';
import { nextStepAction, nextStepOf, nextStepSentence } from './checkout/checkout-choice';
import { EmployeesOverStepNotice } from './employees-over-step-notice';
import { ExtrasCard } from './extras-card';
import { InvoicesCard } from './invoices-card';
import { leaveFor } from './leave';
import { PaymentCard } from './payment-card';
import { type ActionsMode, PlanCard } from './plan-card';
import { contactEmail, endedSentence, pricingUrl, roDate } from './subscription-copy';
import { UsageCard } from './usage-card';
import {
  currentChoice,
  hasLiveSubscription,
  refreshBilling,
  type SubscriptionView,
  useBilling,
  viewOf,
} from './use-billing';

export function SubscriptionPage() {
  const me = useMe();
  const billing = useBilling();

  if (billing.isPending || !me.data) {
    return (
      <div data-testid="subscription-loading" className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <Skeleton className="h-80 w-full" />
        <Skeleton className="h-56 w-full" />
      </div>
    );
  }
  if (billing.isError) {
    return (
      <LoadFailed
        error={billing.error}
        busy={billing.isFetching}
        onRetry={() => void billing.refetch()}
      >
        Nu am putut încărca abonamentul.
      </LoadFailed>
    );
  }

  const isOwner = me.data.membership?.role === 'owner';
  const impersonating = Boolean(me.data.impersonation);
  return (
    <SubscriptionContent overview={billing.data} isOwner={isOwner} impersonating={impersonating} />
  );
}

function SubscriptionContent({
  overview,
  isOwner,
  impersonating,
}: {
  overview: BillingOverview;
  isOwner: boolean;
  impersonating: boolean;
}) {
  const { request, queryClient } = useApi();
  const view = viewOf(overview.subscription);
  const subscription = overview.subscription;
  const owner = overview.owner;
  const choice = currentChoice(subscription);
  // An admin acting as the owner sees the owner's page; the API refuses its changes anyway.
  const canAct = isOwner && !impersonating && owner !== null;
  const actionsMode: ActionsMode = canAct ? 'enabled' : isOwner ? 'disabled' : 'hidden';
  const [cancelling, setCancelling] = useState(false);
  const [changeTarget, setChangeTarget] = useState<BillingChoice | null>(null);
  const [busy, setBusy] = useState<'resume' | 'card' | 'withdraw' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function run(kind: 'resume' | 'card' | 'withdraw', action: () => Promise<void>) {
    setError(null);
    setBusy(kind);
    try {
      await action();
    } catch (cause) {
      setError(billingErrorMessage(cause));
    } finally {
      setBusy(null);
    }
  }

  const resume = () =>
    run('resume', async () => {
      await resumeSubscription(request);
      toast.success('Abonamentul se reînnoiește din nou.');
      await refreshBilling(queryClient);
    });

  const changeCard = () =>
    run('card', async () => {
      const { url } = await createBillingPortalSession(request);
      leaveFor(url);
    });

  const withdrawScheduled = () =>
    run('withdraw', async () => {
      if (!choice) return;
      await changeSubscription(choice, request);
      toast.success('Schimbarea programată a fost anulată.');
      await refreshBilling(queryClient);
    });

  const notice = canAct
    ? noticeFor(overview, view, {
        resume,
        changeCard,
        busy: busy !== null,
      })
    : null;

  return (
    <div data-testid="subscription-page" data-view={view} className="grid gap-4 sm:gap-5">
      {impersonating && isOwner && (
        <Notice variant="info">
          Vezi abonamentul ca adminul organizației. Doar el îl poate schimba.
        </Notice>
      )}
      {notice}
      {(!owner || view !== 'active') && <EmployeesOverStepNotice />}
      {error && <Notice variant="destructive">{error}</Notice>}

      <div className="grid items-start gap-4 sm:gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid min-w-0 gap-4 sm:gap-5">
          <PlanCard
            overview={overview}
            view={view}
            actionsMode={actionsMode}
            actions={{
              cancel: () => setCancelling(true),
              resume: () => void resume(),
              switchInterval: setChangeTarget,
              withdrawScheduled: () => void withdrawScheduled(),
              changeCard: () => void changeCard(),
              busy: busy !== null,
            }}
          />
          <UsageCard overview={overview} view={view} canAct={canAct} />
        </div>
        <div className="grid min-w-0 gap-4 sm:gap-5">
          {extrasShown.has(view) && (
            <ExtrasCard
              extras={overview.extras}
              owner={owner !== null}
              canAct={canAct}
              renewsAt={
                overview.usage.smsThisMonth.periodEnd ?? overview.usage.creditsThisMonth.periodEnd
              }
              firstPaymentAt={
                subscription?.planChosen && subscription.status === 'trialing'
                  ? subscription.trialEndsAt
                  : null
              }
            />
          )}
          {owner ? (
            <PaymentCard
              owner={owner}
              refused={subscription?.status === 'past_due'}
              canAct={canAct}
              changingCard={busy === 'card'}
              onChangeCard={() => void changeCard()}
            />
          ) : !isOwner ? (
            <MemberNote overview={overview} />
          ) : null}
        </div>
      </div>

      {owner && (
        <InvoicesCard
          invoices={owner.invoices}
          vatPayer={owner.vatPayer}
          emptyText={
            view === 'trialChosen' && subscription?.trialEndsAt
              ? `Prima factură apare aici după ${roDate(subscription.trialEndsAt)}.`
              : 'Prima factură apare aici după prima plată.'
          }
        />
      )}

      {subscription && (
        <CancelDialog
          subscription={subscription}
          scheduledChange={owner?.scheduledChange ?? null}
          open={cancelling}
          onClose={() => setCancelling(false)}
        />
      )}
      {choice && (
        <ChangeDialog
          current={choice}
          target={changeTarget}
          inTrial={view === 'trialChosen'}
          onClose={() => setChangeTarget(null)}
        />
      )}
    </div>
  );
}

const extrasShown = new Set<SubscriptionView>([
  'trial',
  'trialChosen',
  'active',
  'canceling',
  'pastDue',
]);

function noticeFor(
  overview: BillingOverview,
  view: SubscriptionView,
  actions: { resume: () => Promise<void>; changeCard: () => Promise<void>; busy: boolean }
): ReactNode {
  const subscription = overview.subscription;
  const owner = overview.owner;
  const choice = currentChoice(subscription);
  if (!subscription || !owner) return null;

  const actionButton = (label: string, onClick: () => void, testId: string) => (
    <Button
      className="font-semibold"
      disabled={actions.busy}
      data-testid={testId}
      onClick={onClick}
    >
      {label}
    </Button>
  );
  const chooseLink = (label: string, search?: { plan?: PaidPlan; step?: number }) => (
    <Button className="font-semibold" asChild>
      <Link to="/organizatie/abonament/alege" search={search} state={openedHere}>
        {label}
      </Link>
    </Button>
  );

  switch (view) {
    case 'trialChosen': {
      if (!choice || !subscription.trialEndsAt) return null;
      const first = owner.nextPayment;
      const amount = first ? `, de ${formatEuro(first.totalCents)} cu TVA,` : '';
      if (!owner.card) {
        return (
          <Notice
            variant="warning"
            data-testid="subscription-notice"
            title="Cardul nu a fost confirmat."
            action={chooseLink('Adaugă cardul')}
          >
            Ai ales {choice.plan === 'start' ? 'Start' : 'Profesional'}, dar banca nu a confirmat
            cardul, așa că nu e salvat. Fără card, prima plată{amount} din{' '}
            {roDate(subscription.trialEndsAt)} nu reușește. Azi nu plătești nimic.
          </Notice>
        );
      }
      return (
        <Notice
          variant="info"
          data-testid="subscription-notice"
          title={`Ai ales ${choice.plan === 'start' ? 'Start' : 'Profesional'}. Azi nu ai plătit nimic.`}
        >
          Cardul e salvat. Prima plată{amount} se face pe {roDate(subscription.trialEndsAt)}, când
          se încheie perioada de probă. Până atunci lucrezi exact ca acum.
        </Notice>
      );
    }
    case 'pastDue': {
      const card = owner.card ? cardBrand(owner.card.brand) : null;
      return (
        <Notice
          variant="destructive"
          data-testid="subscription-notice"
          title="Plata abonamentului nu a reușit."
          action={actionButton('Schimbă cardul', () => void actions.changeCard(), 'notice-card')}
        >
          {card && owner.card
            ? `Banca a refuzat cardul ${card.name} •••• ${owner.card.last4}. `
            : ''}
          Reîncercăm automat în zilele următoare; când salvezi un card nou, plata se reîncearcă pe
          loc.
          {subscription.accessUntil
            ? ` Dacă plata nu reușește până pe ${roDate(subscription.accessUntil)}, contul trece în modul doar citire.`
            : ''}
        </Notice>
      );
    }
    case 'canceling': {
      const end = subscription.cancelsAt ?? subscription.accessUntil;
      if (!end) return null;
      const overdue = subscription.status === 'past_due';
      return (
        <Notice
          variant={overdue ? 'warning' : 'info'}
          data-testid="subscription-notice"
          title={
            overdue
              ? `Abonamentul e anulat și se încheie pe ${roDate(end)}.`
              : `Abonamentul se încheie pe ${roDate(end)}.`
          }
          action={actionButton('Reactivează', () => void actions.resume(), 'notice-resume')}
        >
          {overdue ? 'Ultima plată nu a reușit. ' : ''}Până atunci lucrezi ca acum. Apoi contul
          rămâne {readOnlyDays} de zile doar pentru citire, până pe{' '}
          {roDate(addDays(end, readOnlyDays))}, iar după aceea datele se șterg.
        </Notice>
      );
    }
    case 'readOnly': {
      const deletes = subscription.deletesAt;
      const live = hasLiveSubscription(subscription);
      const trialEnded = subscription.status === 'trialing' && !subscription.planChosen;
      return (
        <Notice
          variant="warning"
          data-testid="subscription-notice"
          title={
            deletes
              ? `Contul e doar pentru citire până pe ${roDate(deletes)}.`
              : 'Contul e doar pentru citire.'
          }
          action={
            live
              ? actionButton('Schimbă cardul', () => void actions.changeCard(), 'notice-card')
              : chooseLink(trialEnded ? 'Alege un plan' : 'Reactivează abonamentul')
          }
        >
          {endedSentence(subscription)} Vezi și descarci tot
          {deletes ? `; după ${roDate(deletes)} datele se șterg` : ''}. Dacă{' '}
          {trialEnded ? 'alegi un plan' : 'reactivezi'}, continui de unde ai rămas.
        </Notice>
      );
    }
    case 'active': {
      const employees = overview.usage.employees;
      if (!choice || employees.used === null || employees.limit === null) return null;
      if (employees.used <= employees.limit) return null;
      const next = nextStepOf(choice, employees.used);
      const action = next && nextStepAction(choice, next);
      const over = overview.usage.employeesOverStep;
      return (
        <Notice
          variant="warning"
          data-testid="subscription-notice"
          title={
            over?.blocked
              ? 'Nu mai poți adăuga lucrători noi.'
              : over
                ? `Ai trecut de treapta de lucrători. Poți adăuga lucrători noi până pe ${formatRoDate(over.lastDay)} inclusiv.`
                : 'Ai trecut de treapta de lucrători.'
          }
          action={action && chooseLink(action.label, action.search)}
        >
          {over?.blocked
            ? 'De mai bine de o lună ai mai mulți lucrători decât treapta ta. Acum ai '
            : 'Ai '}
          {workerNoun(employees.used)} la clienți, cu{' '}
          {formatCount(employees.used - employees.limit)} peste treapta ta, de{' '}
          {formatCount(employees.limit)}. Lucrezi mai departe cu tot ce ai
          {over?.blocked
            ? ', dar nu mai adaugi lucrători până nu treci pe o treaptă mai mare sau arhivezi clienții cu care nu mai lucrezi, ori marchezi plecarea lucrătorilor care nu mai lucrează la clienți.'
            : over
              ? '. Dacă după această dată ai tot mai mulți, nu mai poți adăuga lucrători noi până nu treci pe o treaptă mai mare sau arhivezi clienții cu care nu mai lucrezi, ori marchezi plecarea lucrătorilor care nu mai lucrează la clienți.'
              : '.'}
          {next
            ? ` ${nextStepSentence(choice, next)}`
            : ` Peste ${workerNoun(selfServeLimits.employees)}, scrie-ne pentru o ofertă, la ${contactEmail}.`}
        </Notice>
      );
    }
    default:
      return null;
  }
}

function MemberNote({ overview }: { overview: BillingOverview }) {
  const { plans } = overview.catalogue;
  return (
    <>
      <BillingCard data-testid="member-note">
        <div className="flex items-start gap-3">
          <Info aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <div className="grid gap-1.5">
            <strong className="text-[15px] font-semibold">
              Adminul organizației se ocupă de abonament.
            </strong>
            <p className="text-sm leading-relaxed text-muted-foreground">
              Dacă ai nevoie de o treaptă cu mai mulți lucrători sau de alt plan, scrie-i adminului.
            </p>
          </div>
        </div>
      </BillingCard>
      <BillingCard title="Prețurile planurilor" aside="fără TVA" data-testid="price-list">
        <dl className="grid gap-2 text-sm">
          {plans.map((plan) => (
            <div key={plan.key} className="flex justify-between gap-4">
              <dt className="font-medium">
                {plan.key === 'start' ? 'Start' : 'Profesional'}, {plan.members} utilizatori
              </dt>
              <dd className="text-right text-muted-foreground tabular-nums">
                de la {formatEuro(plan.steps[0]!.prices.month)} pe lună, pentru{' '}
                {formatCount(plan.steps[0]!.employees)} de lucrători
              </dd>
            </div>
          ))}
        </dl>
        <a
          href={pricingUrl}
          target="_blank"
          rel="noreferrer"
          className="w-fit text-sm font-semibold underline-offset-2 hover:underline"
        >
          Vezi toate prețurile
        </a>
      </BillingCard>
    </>
  );
}
