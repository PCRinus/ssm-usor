import type { MailProvider } from './index';

export function logProvider(): MailProvider {
  return {
    async send({ to, subject, text }) {
      console.log(
        `[mail] not sent, RESEND_API_KEY is unset\nto: ${to}\nsubject: ${subject}\n\n${text}`
      );
      return { id: null };
    },
  };
}
