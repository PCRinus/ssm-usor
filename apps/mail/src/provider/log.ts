import type { MailProvider } from './index';

export function logProvider(): MailProvider {
  return {
    async send({ to, cc, replyTo, subject, text, attachments }) {
      const extra = [
        cc && `cc: ${cc}`,
        replyTo && `reply-to: ${replyTo}`,
        ...(attachments ?? []).map(({ fileName }) => `attachment: ${fileName}`),
      ].filter(Boolean);
      console.log(
        `[mail] not sent, RESEND_API_KEY is unset\nto: ${to}\n${extra.map((line) => `${line}\n`).join('')}subject: ${subject}\n\n${text}`
      );
      return { id: null };
    },
  };
}
