import { legalActs } from '@ssm-usor/document-engine/citations';
import {
  createLegislationClient,
  describeRun,
  legalActsSchema,
  runLegislationCheck,
} from '@ssm-usor/legislation-check';

export type LegislationEnv = {
  SUPABASE_URL?: string;
  SUPABASE_SECRET_KEY?: string;
};

export default {
  async scheduled(_controller, env) {
    if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) {
      throw new Error('Set SUPABASE_URL and SUPABASE_SECRET_KEY: without them no run is recorded.');
    }
    const { acts } = legalActsSchema.parse({ acts: legalActs() });
    const run = await runLegislationCheck(
      createLegislationClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY),
      acts
    );
    console.log(describeRun(run));
    // The run log carries the failure to the app; throwing also marks the invocation failed
    // in Cloudflare's cron events.
    if (run.status === 'failed') throw new Error(`The legislation check failed, run ${run.id}.`);
  },
} satisfies ExportedHandler<LegislationEnv>;
