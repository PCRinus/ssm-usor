import console from 'node:console';
import process from 'node:process';
import { parseArgs } from 'node:util';

import {
  applyPlan,
  assertKeyMatchesEnvironment,
  createStripe,
  describeAction,
  planSetup,
  readStripeState,
  SetupError,
  type StripeEnvironment,
} from './lib/stripe-setup';

//   STRIPE_SECRET_KEY=… pnpm stripe:setup --environment non-prod \
//     --api-url https://api.non-prod.ssmusor.ro --app-url https://app.non-prod.ssmusor.ro [--apply]
// Without --apply it only prints what it would change. The key is read from the environment and
// never from an argument, so it stays out of the shell history and the process list.

const argv = process.argv.slice(2);
// `pnpm stripe:setup -- --apply` hands the script the separator too.
const { values } = parseArgs({
  args: argv[0] === '--' ? argv.slice(1) : argv,
  options: {
    environment: { type: 'string' },
    'api-url': { type: 'string', default: process.env.API_URL },
    'app-url': { type: 'string', default: process.env.APP_URL },
    apply: { type: 'boolean', default: false },
  },
});

function httpsUrl(name: string, value: string | undefined) {
  if (!value) throw new SetupError(`Pass --${name}.`);
  const url = new URL(value);
  if (url.protocol !== 'https:') throw new SetupError(`--${name} must be an https:// address.`);
  return url.origin;
}

try {
  const environment = values.environment;
  if (environment !== 'non-prod' && environment !== 'production') {
    throw new SetupError('Pass --environment non-prod or --environment production.');
  }
  const apiUrl = httpsUrl('api-url', values['api-url']);
  const appUrl = httpsUrl('app-url', values['app-url']);
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) throw new SetupError('Set STRIPE_SECRET_KEY.');
  assertKeyMatchesEnvironment(secretKey, environment satisfies StripeEnvironment);

  const stripe = createStripe(secretKey);
  const account = await stripe.accounts.retrieveCurrent().catch(() => null);
  console.log(
    account
      ? `Stripe account ${account.id} (${account.settings?.dashboard?.display_name ?? account.email ?? 'no name'}), ${environment}.`
      : `Stripe account not readable with this key; going by the key's mode, ${environment}.`
  );

  const state = await readStripeState(stripe, environment);
  const plan = planSetup(state, { apiUrl, appUrl, environment });

  for (const warning of plan.warnings) console.warn(`warning: ${warning}`);
  if (plan.actions.length === 0) {
    console.log('Stripe already matches the plan catalogue.');
  } else if (values.apply) {
    await applyPlan(stripe, plan, state, (line) => console.log(line));
  } else {
    for (const action of plan.actions) console.log(`would ${describeAction(action)}`);
    console.log('Dry run: nothing was changed. Run again with --apply to make these changes.');
  }
  if (plan.blockers.length > 0) {
    for (const blocker of plan.blockers) console.error(blocker);
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
