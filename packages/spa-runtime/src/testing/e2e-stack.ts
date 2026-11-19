import { createClient } from '@supabase/supabase-js';

export const e2ePassword = 'Parola-e2e-1';

// Turnstile's dummy token, the only one the local stack's test secret accepts
// (supabase/config.toml).
export const captchaToken = 'XXXX.DUMMY.TOKEN.XXXX';

export const stackClient = (url: string, key: string) =>
  createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

// One run never collides with another, or with what a developer has in their local stack.
// Workers start in the same millisecond, so the worker's index is part of it, and `tag` keeps
// the app's flows and the portal's apart.
export function runAddresses(tag: string, workerIndex = '') {
  const run = `${Date.now().toString(36)}${tag}${workerIndex}`;
  const suffix = `-${run}@e2e.test`;
  return {
    run,
    addressOf: (name: string) => `${name}${suffix}`,
    isOfRun: (email: string | undefined) => email?.endsWith(suffix) === true,
  };
}

export interface MailboxEntry {
  kind: string;
  url: string;
}

// The in-memory mailbox of the e2e API: `url` is the link of an email that has one, and a
// description of what it carried for one that does not.
export async function mailbox(apiUrl: string, to: string, kind: string) {
  const url = new URL('/__e2e/emails', apiUrl);
  url.searchParams.set('to', to);
  const emails = (await (await fetch(url)).json()) as MailboxEntry[];
  return emails.filter((email) => email.kind === kind);
}
