import { describe, expect, it, vi } from 'vitest';

import type { OutgoingEmail } from './index';
import { resendProvider } from './resend';

const email: OutgoingEmail = {
  from: 'SSM Ușor <noreply@mail.ssmusor.ro>',
  replyTo: 'contact@ssmusor.ro',
  to: 'ana@example.ro',
  subject: 'Subiect',
  html: '<p>Salut</p>',
  text: 'Salut',
};

describe('resendProvider', () => {
  it('posts the email to Resend with the API key and returns the message id', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ id: 'msg_1' }));

    const receipt = await resendProvider('re_test', fetcher).send(email);

    expect(receipt).toEqual({ id: 'msg_1' });
    const [url, init] = fetcher.mock.calls[0]!;
    expect(url).toBe('https://api.resend.com/emails');
    expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer re_test');
    expect(JSON.parse(init?.body as string)).toEqual({
      from: email.from,
      to: ['ana@example.ro'],
      reply_to: 'contact@ssmusor.ro',
      subject: 'Subiect',
      html: '<p>Salut</p>',
      text: 'Salut',
    });
  });

  it('sends a copy and the attachments in the shape Resend takes', async () => {
    const fetcher = vi.fn<typeof fetch>(async () => Response.json({ id: 'msg_2' }));
    await resendProvider('re_test', fetcher).send({
      ...email,
      cc: 'olga@exemplu.example',
      attachments: [{ fileName: 'Contract nr. 52.pdf', contentBase64: 'JVBERi0=' }],
    });
    expect(JSON.parse(fetcher.mock.calls[0]![1]?.body as string)).toMatchObject({
      cc: ['olga@exemplu.example'],
      attachments: [{ filename: 'Contract nr. 52.pdf', content: 'JVBERi0=' }],
    });
  });

  it('rejects with the status and body when Resend refuses the email', async () => {
    const fetcher = vi.fn<typeof fetch>(
      async () => new Response('{"message":"Invalid from"}', { status: 422 })
    );

    await expect(resendProvider('re_test', fetcher).send(email)).rejects.toThrow(
      'Resend rejected the email (422): {"message":"Invalid from"}'
    );
  });
});
