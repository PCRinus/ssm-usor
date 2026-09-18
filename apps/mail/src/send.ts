import type { MailReceipt } from '@ssm-usor/contracts';
import type { ReactElement } from 'react';
import { render, toPlainText } from 'react-email';

import type { MailEnv } from './env';
import { createProvider, type MailProvider } from './provider';

type Message = { to: string; subject: string; body: ReactElement };

export async function sendEmail(
  env: MailEnv,
  { to, subject, body }: Message,
  provider: MailProvider = createProvider(env)
): Promise<MailReceipt> {
  // Rendering is the expensive step, so the plain text is derived from the HTML
  // instead of rendering the tree a second time.
  const html = await render(body);
  const text = toPlainText(html);

  return provider.send({
    from: env.MAIL_FROM,
    replyTo: env.MAIL_REPLY_TO,
    to,
    subject,
    html,
    text,
  });
}
