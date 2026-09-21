import type { MailReceipt } from '@ssm-usor/contracts';
import type { ReactElement } from 'react';
import { render, toPlainText } from 'react-email';

import type { MailEnv } from './env';
import { createProvider, type MailProvider } from './provider';

type Message = {
  to: string;
  subject: string;
  body: ReactElement;
  // For an email sent in a member's name: who it reads as from, who gets the replies and a
  // copy. The address it leaves from stays ours, which is the one the domain vouches for.
  sender?: { name: string | null; email: string };
  attachments?: { fileName: string; contentBase64: string }[];
};

// "SSM Ușor <noreply@mail.ssmusor.ro>" becomes "Olga Owner prin SSM Ușor <noreply@…>".
function fromOnBehalfOf(from: string, name: string | null) {
  const match = /^(.*)<([^>]+)>\s*$/.exec(from);
  if (!name || !match) return from;
  const ours = match[1]!.trim().replace(/^"|"$/g, '');
  return `"${name.replace(/["\\]/g, '')} prin ${ours}" <${match[2]}>`;
}

export async function sendEmail(
  env: MailEnv,
  { to, subject, body, sender, attachments }: Message,
  provider: MailProvider = createProvider(env)
): Promise<MailReceipt> {
  // Rendering is the expensive step, so the plain text is derived from the HTML
  // instead of rendering the tree a second time.
  const html = await render(body);
  const text = toPlainText(html);

  return provider.send({
    from: sender ? fromOnBehalfOf(env.MAIL_FROM, sender.name) : env.MAIL_FROM,
    replyTo: sender?.email ?? env.MAIL_REPLY_TO,
    to,
    cc: sender?.email,
    subject,
    html,
    text,
    attachments,
  });
}
