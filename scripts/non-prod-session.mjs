#!/usr/bin/env node
// The keys are read here so that whoever runs it, an agent included, never sees them (CLAUDE.md,
// "Trying a change on non-prod"). The file holds [key, value] pairs for the page's localStorage.
import { execFileSync } from 'node:child_process';
import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

// A worktree has neither `.dev.vars` nor, often, `node_modules`: both come from the main checkout.
const root = dirname(
  resolve(
    execFileSync('git', ['rev-parse', '--git-common-dir'], {
      cwd: dirname(new URL(import.meta.url).pathname),
      encoding: 'utf8',
    }).trim()
  )
);
const require = createRequire(join(root, 'apps/app/package.json'));
const { createClient } = require('@supabase/supabase-js');

const nonProdRef = 'vzgwbdxmimbcqftltmmo';

const vars = {};
for (const line of readFileSync(join(root, 'apps/api/.dev.vars'), 'utf8').split('\n')) {
  const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
  if (match) vars[match[1]] = match[2].replace(/^["']|["']$/g, '');
}
const url = vars.SUPABASE_URL;
const secretKey = vars.SUPABASE_SECRET_KEY;
const publishableKey = vars.SUPABASE_PUBLISHABLE_KEY;
if (!url || !secretKey || !publishableKey)
  throw new Error(
    'apps/api/.dev.vars lacks SUPABASE_URL, SUPABASE_SECRET_KEY or SUPABASE_PUBLISHABLE_KEY'
  );
if (!url.includes(nonProdRef)) throw new Error('apps/api/.dev.vars does not point at non-prod');

const email = process.env.E2E_EMAIL ?? 'e2e@non-prod.ssmusor.ro';
const admin = createClient(url, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const link = await admin.auth.admin.generateLink({ type: 'magiclink', email });
if (link.error) throw link.error;

const stored = new Map();
const client = createClient(url, publishableKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: false,
    storage: {
      getItem: (key) => stored.get(key) ?? null,
      setItem: (key, value) => void stored.set(key, value),
      removeItem: (key) => void stored.delete(key),
    },
  },
});
const verified = await client.auth.verifyOtp({
  token_hash: link.data.properties.hashed_token,
  type: 'magiclink',
});
if (verified.error) throw verified.error;

const out = process.argv[2] ?? join(tmpdir(), 'ssm-usor-non-prod-session.json');
writeFileSync(out, JSON.stringify([...stored]), { mode: 0o600 });
chmodSync(out, 0o600);
console.log(`Non-prod session for ${email} written to ${out}`);
