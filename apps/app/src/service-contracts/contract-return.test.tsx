import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { authFixture } from '../test/auth-fixture';
import { disposeRuntimes, mountApp } from '../test/mount';

const contract = {
  status: 'open',
  organizationName: 'S.C. SAFETY S.R.L.',
  clientName: 'S.C. VELOCITA URBANA S.R.L.',
  contractNumber: 51,
  contractDate: '2026-02-15',
  revision: 1,
  contactEmail: 'olga@safety.example',
  receivedAt: null,
};

const fetchMock = vi.fn<typeof fetch>();

function mockApi({
  lookup = () => Response.json(contract),
  upload = () =>
    Response.json({ ...contract, status: 'received', receivedAt: '2026-09-22T09:30:00+00:00' }),
}: { lookup?: () => Response; upload?: () => Response } = {}) {
  fetchMock.mockImplementation(async (input, init) => {
    const { pathname } = new URL(String(input));
    if (pathname === '/contract-returns/lookup') return lookup();
    if (pathname === '/contract-returns/upload') return upload();
    if (pathname === '/contract-returns/download') {
      return Response.json({
        url: 'https://files.example/x',
        fileName: 'x.pdf',
        expiresInSeconds: 60,
      });
    }
    throw new Error(`Unexpected request: ${init?.method ?? 'GET'} ${pathname}`);
  });
}

const calls = (pathname: string) =>
  fetchMock.mock.calls.filter(([input]) => new URL(String(input)).pathname === pathname);

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  disposeRuntimes();
  vi.unstubAllGlobals();
});

describe('the return page', () => {
  it('names the contract and the parties, and asks for the token in the body', async () => {
    mockApi();
    mountApp(authFixture().client, '/contract?token=tok-123');
    await screen.findByTestId('return-upload');
    const page = screen.getByTestId('contract-return-page');
    expect(page.textContent).toContain('S.C. SAFETY S.R.L.');
    expect(page.textContent).toContain('nr. 51 din 15.02.2026');
    expect(page.textContent).toContain('S.C. VELOCITA URBANA S.R.L.');
    expect(page.textContent).toContain('certificatul calificat');
    expect(page.textContent).toContain('Politica de confidențialitate');
    const [lookup] = calls('/contract-returns/lookup');
    expect(JSON.parse(String(lookup![1]?.body))).toEqual({ token: 'tok-123' });
    expect(String(lookup![0])).not.toContain('tok-123');
  });

  it('sends the chosen PDF with the token, then says it arrived', async () => {
    mockApi();
    mountApp(authFixture().client, '/contract?token=tok-123');
    const user = userEvent.setup();
    const button = await screen.findByTestId('return-upload');
    expect(button).toHaveProperty('disabled', true);
    await user.upload(
      screen.getByTestId('return-file'),
      new File(['%PDF-1.7'], 'contract semnat.pdf', { type: 'application/pdf' })
    );
    await user.click(screen.getByTestId('return-upload'));
    expect((await screen.findByTestId('return-done')).textContent).toContain(
      'a primit exemplarul semnat'
    );
    const [upload] = calls('/contract-returns/upload');
    const form = upload![1]?.body as FormData;
    expect(form.get('token')).toBe('tok-123');
    expect((form.get('file') as File).name).toBe('contract semnat.pdf');
  });

  it('says that a copy is already there, and that it can be replaced', async () => {
    mockApi({
      lookup: () =>
        Response.json({ ...contract, status: 'received', receivedAt: '2026-09-22T09:30:00+00:00' }),
    });
    mountApp(authFixture().client, '/contract?token=tok-123');
    expect((await screen.findByTestId('return-received')).textContent).toContain('22.09.2026');
    expect(screen.getByTestId('return-upload')).toBeTruthy();
  });

  it.each([
    ['confirmed', 'a fost confirmat'],
    ['superseded', 'a fost modificat între timp'],
    ['expired', 'nu mai este valabil'],
  ] as const)('closes when the link is %s, and says whom to write to', async (status, text) => {
    mockApi({ lookup: () => Response.json({ ...contract, status }) });
    mountApp(authFixture().client, '/contract?token=tok-123');
    await waitFor(() =>
      expect(screen.getByTestId('contract-return-page').textContent).toContain(text)
    );
    expect(screen.getByTestId('contract-return-page').textContent).toContain('olga@safety.example');
    expect(screen.queryByTestId('return-upload')).toBeNull();
  });

  it('says when the link is not one of ours', async () => {
    mockApi({
      lookup: () => Response.json({ error: 'not_found', message: 'no' }, { status: 404 }),
    });
    mountApp(authFixture().client, '/contract?token=tok-123');
    await waitFor(() =>
      expect(screen.getByTestId('contract-return-page').textContent).toContain(
        'Linkul nu este valid'
      )
    );
  });
});
