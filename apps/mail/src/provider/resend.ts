import type { MailProvider } from './index';

const endpoint = 'https://api.resend.com/emails';

export function resendProvider(apiKey: string, fetcher: typeof fetch = fetch): MailProvider {
  return {
    async send({ from, replyTo, to, subject, html, text }) {
      const response = await fetcher(endpoint, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to: [to], reply_to: replyTo, subject, html, text }),
      });

      if (!response.ok) {
        throw new Error(`Resend rejected the email (${response.status}): ${await response.text()}`);
      }

      const { id } = (await response.json()) as { id?: string };
      return { id: id ?? null };
    },
  };
}
