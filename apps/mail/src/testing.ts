import type { MailEnv } from './env';
import type { MailProvider, OutgoingEmail } from './provider';
import { type Message, sendEmail } from './send';

export const testEnv: MailEnv = {
  MAIL_FROM: 'SSM Ușor <noreply@mail.ssmusor.ro>',
  MAIL_FROM_CONTRACTS: 'SSM Ușor <contracte@mail.ssmusor.ro>',
  MAIL_REPLY_TO: 'contact@ssmusor.ro',
};

export function captureProvider(): MailProvider & { sent: OutgoingEmail[] } {
  const sent: OutgoingEmail[] = [];
  return {
    sent,
    send: async (email) => {
      sent.push(email);
      return { id: 'msg_1' };
    },
  };
}

export async function sentEmail(message: Message, env: MailEnv = testEnv): Promise<OutgoingEmail> {
  const provider = captureProvider();
  await sendEmail(env, message, provider);
  return provider.sent[0]!;
}
