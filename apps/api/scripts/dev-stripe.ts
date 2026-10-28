import { spawnSync } from 'node:child_process';
import console from 'node:console';
import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import { parseArgs } from 'node:util';

import { webhookEvents, webhookPath } from './lib/stripe-setup';

//   pnpm dev:stripe [--api-port 8787]   forwards the Stripe sandbox's events to the local API
//   pnpm dev:stripe --stop
// Stripe cannot reach localhost, so the Stripe CLI holds a connection open to Stripe and passes
// each event on. It runs from Stripe's image, so nothing needs installing beyond Docker, and with
// the key in apps/api/.dev.vars rather than a `stripe login`, which expires.

const image = 'stripe/stripe-cli:v1.53.1';
const container = 'ssm-usor-stripe';
const devVarsUrl = new URL('../.dev.vars', import.meta.url);

class Skip extends Error {}

function docker(args: string[], env?: Record<string, string>) {
  const result = spawnSync('docker', args, {
    encoding: 'utf8',
    env: { ...process.env, ...env },
    timeout: 120_000,
  });
  if (result.error) throw new Error(`Docker did not run: ${result.error.message}`);
  return result;
}

function readDevVars() {
  try {
    return readFileSync(devVarsUrl, 'utf8');
  } catch {
    throw new Skip('No apps/api/.dev.vars; the Stripe listener is not started.');
  }
}

function valueOf(devVars: string, name: string) {
  const line = devVars.split('\n').find((entry) => entry.startsWith(`${name}=`));
  return line
    ?.slice(name.length + 1)
    .trim()
    .replace(/^(['"])(.*)\1$/, '$2');
}

function withValue(devVars: string, name: string, value: string) {
  const lines = devVars.split('\n');
  const index = lines.findIndex((entry) => entry.startsWith(`${name}=`));
  if (index === -1) return `${devVars.replace(/\n*$/, '\n')}${name}=${value}\n`;
  lines[index] = `${name}=${value}`;
  return lines.join('\n');
}

function waitUntilReady() {
  const deadline = Date.now() + 30_000;
  while (Date.now() < deadline) {
    const logs = docker(['logs', container]);
    const output = `${logs.stdout}${logs.stderr}`;
    if (output.includes('Ready!')) return;
    const state = docker(['inspect', '--format', '{{.State.Running}}', container]).stdout.trim();
    if (state !== 'true') throw new Error(`The Stripe listener stopped:\n${output.trim()}`);
    spawnSync('sleep', ['1']);
  }
  throw new Error(`The Stripe listener did not get ready; see docker logs ${container}.`);
}

try {
  const { values } = parseArgs({
    args: process.argv.slice(2).filter((arg) => arg !== '--'),
    options: {
      'api-port': { type: 'string', default: '8787' },
      stop: { type: 'boolean', default: false },
    },
  });
  if (values.stop) {
    docker(['rm', '--force', container]);
    console.log('The Stripe listener is stopped.');
    process.exit(0);
  }
  const port = Number(values['api-port']);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('--api-port must be a port.');
  }

  const devVars = readDevVars();
  const key = valueOf(devVars, 'STRIPE_SECRET_KEY');
  if (!key)
    throw new Skip(
      'No STRIPE_SECRET_KEY in apps/api/.dev.vars; the Stripe listener is not started.'
    );
  if (!/^(sk|rk)_test_/.test(key)) {
    throw new Error(
      'STRIPE_SECRET_KEY in apps/api/.dev.vars is not a sandbox key; nothing was started.'
    );
  }
  const keyEnv = { STRIPE_API_KEY: key };

  if (docker(['info'], {}).status !== 0) throw new Error('Docker is not running.');

  const printed = docker(
    ['run', '--rm', '--env', 'STRIPE_API_KEY', image, 'listen', '--print-secret'],
    keyEnv
  );
  const secret = printed.stdout.trim();
  if (printed.status !== 0 || !secret.startsWith('whsec_')) {
    throw new Error(`The Stripe CLI gave no signing secret:\n${printed.stderr.trim()}`);
  }
  const secretChanged = valueOf(devVars, 'STRIPE_WEBHOOK_SECRET') !== secret;
  if (secretChanged) {
    writeFileSync(devVarsUrl, withValue(devVars, 'STRIPE_WEBHOOK_SECRET', secret));
  }

  docker(['rm', '--force', container]);
  const started = docker(
    [
      'run',
      '--detach',
      '--name',
      container,
      '--env',
      'STRIPE_API_KEY',
      // Linux has no host.docker.internal unless asked for; Docker Desktop has it already.
      '--add-host',
      'host.docker.internal:host-gateway',
      image,
      'listen',
      '--events',
      webhookEvents.join(','),
      '--forward-to',
      `http://host.docker.internal:${port}${webhookPath}`,
    ],
    keyEnv
  );
  if (started.status !== 0) {
    throw new Error(`The Stripe listener did not start:\n${started.stderr.trim()}`);
  }
  waitUntilReady();

  console.log(
    `Stripe sandbox events go to http://localhost:${port}${webhookPath} (docker logs -f ${container}).`
  );
  if (secretChanged) {
    console.log(
      "Wrote the listener's signing secret to STRIPE_WEBHOOK_SECRET in apps/api/.dev.vars; restart the API if it is running."
    );
  }
} catch (error) {
  if (error instanceof Skip) {
    console.log(error.message);
  } else {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
