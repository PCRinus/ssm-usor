import { legalActs } from '@ssm-usor/document-engine/citations';
import {
  createLegislationClient,
  describeOutcome,
  describeRun,
  legalActsSchema,
  type LegislationClient,
  type PortalEnv,
  portalOptionsFromEnv,
  runInProgress,
  runLegislationCheck,
  type RunOptions,
} from '@ssm-usor/legislation-check';

export type LegislationEnv = PortalEnv & {
  SUPABASE_URL?: string;
  SUPABASE_SECRET_KEY?: string;
  LEGISLATION_RUN_SECRET?: string;
};

function connect(env: LegislationEnv) {
  if (!env.SUPABASE_URL || !env.SUPABASE_SECRET_KEY) {
    throw new Error('Set SUPABASE_URL and SUPABASE_SECRET_KEY: without them no run is recorded.');
  }
  return createLegislationClient(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY);
}

async function check(db: LegislationClient, env: LegislationEnv, options: RunOptions = {}) {
  const { acts } = legalActsSchema.parse({ acts: legalActs() });
  return runLegislationCheck(db, acts, { ...options, portal: portalOptionsFromEnv(env) });
}

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

const textHeaders = { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' };

async function sameSecret(given: string, expected: string) {
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all(
    [given, expected].map((value) => crypto.subtle.digest('SHA-256', encoder.encode(value)))
  );
  // Equal-length digests compared in full: the timing shows neither the secret's length nor
  // how much of it matched.
  const left = new Uint8Array(a!);
  const right = new Uint8Array(b!);
  let difference = 0;
  for (let index = 0; index < left.length; index++) difference |= left[index]! ^ right[index]!;
  return difference === 0;
}

// Not ctx.waitUntil: it outlives the response by 30 seconds and a run takes minutes. A fetch
// handler has no time limit while its client stays connected, so the run lives in the stream.
async function streamRun(db: LegislationClient, env: LegislationEnv) {
  const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
  const writer = writable.getWriter();
  const encoder = new TextEncoder();
  // A client that hangs up must not fail the run; the Worker log still gets every line.
  const say = (line: string) => void writer.write(encoder.encode(`${line}\n`)).catch(() => {});

  let runId = '';
  let markStarted = () => {};
  const started = new Promise<void>((resolve) => (markStarted = resolve));
  const run = check(db, env, {
    onStart: (id) => {
      runId = id;
      say(`Run ${id} started.`);
      markStarted();
    },
    onOutcome: (outcome) => say(describeOutcome(outcome)),
  });
  try {
    await Promise.race([started, run]);
  } catch (error) {
    return new Response(`${messageOf(error)}\n`, { status: 500, headers: textHeaders });
  }

  void run
    .then(
      (result) => {
        console.log(describeRun(result));
        say(describeRun(result, { perAct: false }));
      },
      (error: unknown) => {
        console.error(messageOf(error));
        say(`The run stopped: ${messageOf(error)}`);
        say(`Run ${runId} failed.`);
      }
    )
    .finally(() => writer.close().catch(() => {}));
  return new Response(readable, { headers: textHeaders });
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (!env.LEGISLATION_RUN_SECRET || request.method !== 'POST' || pathname !== '/run') {
      return new Response(null, { status: 404 });
    }
    const token = /^Bearer (.+)$/.exec(request.headers.get('Authorization') ?? '')?.[1];
    if (token === undefined || !(await sameSecret(token, env.LEGISLATION_RUN_SECRET))) {
      return new Response(null, { status: 401 });
    }

    const db = connect(env);
    const running = await runInProgress(db);
    if (running) {
      return new Response(`Run ${running.id} is still running, since ${running.started_at}.\n`, {
        status: 409,
        headers: textHeaders,
      });
    }
    return streamRun(db, env);
  },

  async scheduled(_controller, env) {
    const db = connect(env);
    const running = await runInProgress(db);
    if (running) {
      console.log(`Run ${running.id} is still running, since ${running.started_at}; skipped.`);
      return;
    }
    const run = await check(db, env);
    console.log(describeRun(run));
    // The run log carries the failure to the app; throwing also marks the invocation failed
    // in Cloudflare's cron events.
    if (run.status === 'failed') throw new Error(`The legislation check failed, run ${run.id}.`);
  },
} satisfies ExportedHandler<LegislationEnv>;
