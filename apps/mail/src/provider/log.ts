import type { MailProvider } from './index';

/** Local development default: print the email instead of sending it. */
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
