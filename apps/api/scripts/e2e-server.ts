// The API for browser flow tests: the real application served by Node, pointed at the local
// Supabase stack, with a mailer that keeps emails in memory instead of sending them. It
// never touches the mail Worker, so a flow test cannot send a real email, even on a machine
// whose mail Worker holds a provider key.
//
//   SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, SUPABASE_SECRET_KEY   from `supabase status`
//   APP_ORIGIN, CORS_ORIGINS                                      where the SPA under test is served
//   SUPABASE_AUTH_HOOK_SECRET                                     the local placeholder from supabase/config.toml
//   PORT                                                          defaults to 8797
//   HOST                                                          defaults to 127.0.0.1; 0.0.0.0 on Linux, where the
//                                                                 Supabase containers reach the host over the Docker bridge
//
// The local stack's Send Email hook points here, so signing up or asking for a password
// reset through Supabase lands in the same in-memory mailbox.
import { createServer } from 'node:http';

import type { MailService } from '@ssm-usor/contracts';

import { createApp } from '../src/app';
import type { ApiEnv } from '../src/lib/env';

const supabaseUrl = process.env.SUPABASE_URL ?? '';
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(supabaseUrl)) {
  throw new Error('The e2e server only runs against a local Supabase stack.');
}

const sent: { to: string; kind: string; url: string }[] = [];
const record = (kind: string, to: string, url: string) => {
  sent.push({ to, kind, url });
  return Promise.resolve({ id: null });
};
const mail: MailService = {
  sendWaitlistConfirmation: ({ to, confirmUrl }) => record('waitlist', to, confirmUrl),
  sendOrganizationInvitation: ({ to, acceptUrl }) => record('invitation', to, acceptUrl),
  sendPasswordReset: ({ to, resetUrl }) => record('password-reset', to, resetUrl),
  sendSignupConfirmation: ({ to, confirmUrl }) => record('signup-confirmation', to, confirmUrl),
  sendPasswordChanged: ({ to, forgotPasswordUrl }) =>
    record('password-changed', to, forgotPasswordUrl),
};

const env: ApiEnv['Bindings'] = {
  SUPABASE_URL: supabaseUrl,
  SUPABASE_PUBLISHABLE_KEY: process.env.SUPABASE_PUBLISHABLE_KEY,
  SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
  SUPABASE_AUTH_HOOK_SECRET: process.env.SUPABASE_AUTH_HOOK_SECRET,
  CORS_ORIGINS: process.env.CORS_ORIGINS,
  APP_ORIGIN: process.env.APP_ORIGIN,
  GOTENBERG_URL: process.env.GOTENBERG_URL || undefined,
  MAIL: mail,
};

const app = createApp();
const port = Number(process.env.PORT ?? 8797);

createServer(async (incoming, outgoing) => {
  const url = new URL(incoming.url ?? '/', `http://localhost:${port}`);

  if (url.pathname === '/__e2e/emails') {
    const to = url.searchParams.get('to');
    outgoing.setHeader('Content-Type', 'application/json');
    outgoing.end(JSON.stringify(sent.filter((email) => email.to === to)));
    return;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of incoming) chunks.push(chunk as Buffer);
  const headers = new Headers();
  for (const [name, value] of Object.entries(incoming.headers)) {
    if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
  }
  const hasBody = incoming.method !== 'GET' && incoming.method !== 'HEAD';
  const response = await app.fetch(
    new Request(url, {
      method: incoming.method,
      headers,
      body: hasBody ? Buffer.concat(chunks) : undefined,
    }),
    env
  );

  outgoing.statusCode = response.status;
  response.headers.forEach((value, name) => outgoing.setHeader(name, value));
  outgoing.end(Buffer.from(await response.arrayBuffer()));
}).listen(port, process.env.HOST ?? '127.0.0.1', () => {
  console.log(`e2e API on port ${port} against ${supabaseUrl}`);
});
