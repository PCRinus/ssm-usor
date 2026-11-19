import { afterEach, describe, expect, it, vi } from 'vitest';

import { mailbox, runAddresses } from './e2e-stack';

afterEach(() => vi.unstubAllGlobals());

describe('runAddresses', () => {
  it("tells this run's addresses from another run's and from the other app's", () => {
    const portal = runAddresses('p', '2');
    const app = runAddresses('w', '2');
    expect(portal.addressOf('ana')).toMatch(/^ana-[0-9a-z]+p2@e2e\.test$/);
    expect(portal.isOfRun(portal.addressOf('ana'))).toBe(true);
    expect(portal.isOfRun(app.addressOf('ana'))).toBe(false);
    expect(portal.isOfRun(undefined)).toBe(false);
  });
});

describe('mailbox', () => {
  it("reads one address's emails of one kind, in the order they were sent", async () => {
    const fetchEmails = vi.fn<(url: URL) => Promise<Response>>(async () =>
      Response.json([
        { kind: 'sign-in-code', url: 'https://portal.test/?code=111111' },
        { kind: 'signing-code', url: 'https://portal.test/?code=222222' },
        { kind: 'sign-in-code', url: 'https://portal.test/?code=333333' },
      ])
    );
    vi.stubGlobal('fetch', fetchEmails);

    const emails = await mailbox('http://localhost:8797', 'ana@e2e.test', 'sign-in-code');

    expect(emails.map((email) => email.url)).toEqual([
      'https://portal.test/?code=111111',
      'https://portal.test/?code=333333',
    ]);
    expect(String(fetchEmails.mock.calls[0]![0])).toBe(
      'http://localhost:8797/__e2e/emails?to=ana%40e2e.test'
    );
  });
});
