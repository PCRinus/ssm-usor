import type { MailProvider } from './index';

const endpoint = 'https://api.resend.com/emails';

export function resendProvider(apiKey: string, fetcher: typeof fetch = fetch): MailProvider {
  return {
    async send({ from, replyTo, to, cc, subject, html, text, attachments }) {
      const response = await fetcher(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from,
          to: [to],
          cc: cc ? [cc] : undefined,
          reply_to: replyTo,
          subject,
          html,
          text,
          attachments: attachments?.map(({ fileName, contentBase64 }) => ({
            filename: fileName,
            content: contentBase64,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error(`Resend rejected the email (${response.status}): ${await response.text()}`);
      }

      const { id } = (await response.json()) as { id?: string };
      return { id: id ?? null };
    },
  };
}
