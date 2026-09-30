// The app and the API against the local Supabase stack, without touching apps/app/.env.local
// or apps/api/.dev.vars:
//
//   pnpm dev:local [--app-port 5173] [--api-port 8787]

import { execFileSync, spawn } from 'node:child_process';
import console from 'node:console';
import { connect } from 'node:net';
import { join } from 'node:path';
import process from 'node:process';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { parseArgs, styleText } from 'node:util';

const root = fileURLToPath(new URL('..', import.meta.url));
const MAIL_PORT = 8790;
// Not a secret: the local Auth signs its Send Email hook with it (supabase/config.toml).
const LOCAL_AUTH_HOOK_SECRET = 'v1,whsec_bm90LWEtc2VjcmV0LWxvY2FsLXN0YWNrLW9ubHktMzI=';

function fail(message) {
  console.error(message);
  process.exit(1);
}

function ports() {
  let values;
  try {
    ({ values } = parseArgs({
      args: process.argv.slice(2).filter((arg) => arg !== '--'),
      options: {
        'app-port': { type: 'string', default: '5173' },
        'api-port': { type: 'string', default: '8787' },
      },
    }));
  } catch (error) {
    fail(`${error.message}\nUsage: pnpm dev:local [--app-port 5173] [--api-port 8787]`);
  }
  const [app, api] = ['app-port', 'api-port'].map((name) => {
    const port = Number(values[name]);
    if (!Number.isInteger(port) || port < 1 || port > 65535) fail(`--${name} must be a port.`);
    return port;
  });
  if (app === api) fail('--app-port and --api-port must differ.');
  return { app, api };
}

function localSupabase() {
  let status;
  try {
    const output = execFileSync('supabase', ['status', '--output', 'json'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 30_000,
    });
    status = JSON.parse(output.slice(output.indexOf('{')));
  } catch {
    fail('The local Supabase stack is not running: run pnpm supabase:start.');
  }
  const { API_URL: url, PUBLISHABLE_KEY: publishableKey, SECRET_KEY: secretKey } = status;
  let address;
  try {
    address = new URL(url);
  } catch {
    fail('supabase status reported no API address.');
  }
  if (address.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(address.hostname)) {
    fail(`Refusing a Supabase address that is not on this machine: ${url}`);
  }
  if (!publishableKey?.startsWith('sb_publishable_') || !secretKey?.startsWith('sb_secret_')) {
    fail('supabase status reported no publishable or secret key (CLI 2.117.0 or newer).');
  }
  return { url, publishableKey, secretKey };
}

function inUse(port) {
  const probe = (host) =>
    new Promise((resolve) => {
      const socket = connect({ port, host });
      socket.once('connect', () => {
        socket.destroy();
        resolve(true);
      });
      socket.once('error', () => resolve(false));
    });
  return Promise.all(['127.0.0.1', '::1'].map(probe)).then((answers) => answers.includes(true));
}

const children = new Set();
let stopping = false;
let exitCode = 0;

function stop(code) {
  if (stopping) return;
  stopping = true;
  exitCode = code;
  for (const child of children) signal(child, 'SIGTERM');
  setTimeout(() => children.forEach((child) => signal(child, 'SIGKILL')), 10_000).unref();
  if (children.size === 0) process.exit(exitCode);
}

// Each child leads its own process group, so the Worker runtimes and Vite's helpers go with it
// and nothing outside the groups this script started is signalled.
function signal(child, name) {
  try {
    process.kill(-child.pid, name);
  } catch {
    // The group is already gone.
  }
}

function start(name, color, command, args, { cwd, env = {} }) {
  const child = spawn(command, args, {
    cwd: join(root, cwd),
    env: { ...process.env, ...env },
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const prefix = styleText(color, `[${name}]`);
  createInterface({ input: child.stdout }).on('line', (line) => console.log(`${prefix} ${line}`));
  createInterface({ input: child.stderr }).on('line', (line) => console.error(`${prefix} ${line}`));
  children.add(child);
  child.once('error', (error) => {
    console.error(`${prefix} ${error.message}`);
  });
  child.once('close', (code) => {
    children.delete(child);
    if (!stopping) {
      console.error(`${prefix} stopped with exit code ${code ?? 1}; stopping the others.`);
      stop(code ?? 1);
    }
    if (children.size === 0) process.exit(exitCode);
  });
}

async function ready(url) {
  for (let attempt = 0; attempt < 240 && !stopping; attempt++) {
    try {
      await fetch(url, { signal: AbortSignal.timeout(1_000) });
      return true;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  return false;
}

const port = ports();
const supabase = localSupabase();
for (const [name, value] of [
  ['--app-port', port.app],
  ['--api-port', port.api],
]) {
  if (await inUse(value)) fail(`Port ${value} is already in use; choose another with ${name}.`);
}

const appUrl = `http://localhost:${port.app}`;
const apiUrl = `http://localhost:${port.api}`;
const apiVars = {
  SUPABASE_URL: supabase.url,
  SUPABASE_PUBLISHABLE_KEY: supabase.publishableKey,
  // On the command line, so visible in the process list: acceptable for the local stack's key.
  SUPABASE_SECRET_KEY: supabase.secretKey,
  SUPABASE_AUTH_HOOK_SECRET: LOCAL_AUTH_HOOK_SECRET,
  CORS_ORIGINS: `${appUrl},http://127.0.0.1:${port.app}`,
  APP_ORIGIN: appUrl,
  API_ORIGIN: apiUrl,
};

process.on('SIGINT', () => stop(0));
process.on('SIGTERM', () => stop(0));

// The API reaches the mail Worker through Wrangler's dev registry, so one that `pnpm dev`
// already runs serves this API too.
const mailRunning = await inUse(MAIL_PORT);
if (!mailRunning) {
  start(
    'mail',
    'magenta',
    'node_modules/.bin/wrangler',
    ['dev', '--port', String(MAIL_PORT), '--inspector-port', '9239'],
    { cwd: 'apps/mail' }
  );
}
start(
  'api',
  'cyan',
  'node_modules/.bin/wrangler',
  [
    'dev',
    '--port',
    String(port.api),
    ...Object.entries(apiVars).flatMap(([key, value]) => ['--var', `${key}:${value}`]),
  ],
  { cwd: 'apps/api' }
);
start('app', 'green', 'node_modules/.bin/vite', ['--port', String(port.app), '--strictPort'], {
  cwd: 'apps/app',
  env: {
    VITE_SUPABASE_URL: supabase.url,
    VITE_SUPABASE_PUBLISHABLE_KEY: supabase.publishableKey,
    VITE_API_URL: apiUrl,
  },
});

const [apiReady, appReady] = await Promise.all([ready(`${apiUrl}/health`), ready(appUrl)]);
if (apiReady && appReady && !stopping) {
  const lines = [`App ${appUrl}  ·  API ${apiUrl}  ·  Supabase ${supabase.url}`];
  if (mailRunning) lines.push(`Mail: the Worker already running on port ${MAIL_PORT}.`);
  lines.push('An empty local database? pnpm seed:local and pnpm templates:register:local fill it.');
  console.log(`\n${lines.join('\n')}\n`);
}
