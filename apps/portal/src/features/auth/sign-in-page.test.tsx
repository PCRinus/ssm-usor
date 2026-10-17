import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useGetPortalMe } from '@/api/generated/api';
import { disposeRuntimes, fakeAuthClient, mountPortal, queryPending } from '@/test/portal';

vi.mock('@/api/generated/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api/generated/api')>()),
  useGetPortalMe: vi.fn(),
}));

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.mocked(useGetPortalMe).mockReturnValue(queryPending());
});

afterEach(() => {
  disposeRuntimes();
  vi.useRealTimers();
});

function user() {
  return userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
}

async function requestCode(client: ReturnType<typeof fakeAuthClient>, address: string) {
  const person = user();
  mountPortal(client, '/sign-in');
  await person.type(await screen.findByTestId('sign-in-address'), address);
  await person.click(screen.getByTestId('sign-in-request'));
  return person;
}

const sameAnswer = /Dacă adresa este cunoscută, un cod este pe drum spre/;

describe('signing in with a code', () => {
  it('asks for an email code without creating an account', async () => {
    const client = fakeAuthClient();
    await requestCode(client, '  Ana@Example.ro ');

    expect(await screen.findByTestId('sign-in-code-sent')).toHaveProperty(
      'textContent',
      expect.stringMatching(sameAnswer)
    );
    expect(screen.getByTestId('sign-in-code-target').textContent).toBe('ana@example.ro');
    expect(client.signInWithOtp).toHaveBeenCalledWith({
      email: 'ana@example.ro',
      options: { shouldCreateUser: false },
    });
  });

  it('asks for an SMS code at the phone in E.164, Romania by default', async () => {
    const client = fakeAuthClient();
    await requestCode(client, '0721 234 567');

    expect((await screen.findByTestId('sign-in-code-target')).textContent).toBe('+40721234567');
    expect(client.signInWithOtp).toHaveBeenCalledWith({
      phone: '+40721234567',
      options: { shouldCreateUser: false },
    });
  });

  it('asks for an SMS code at a foreign number in its own country', async () => {
    const client = fakeAuthClient();
    await requestCode(client, '+373 69 123 456');

    expect(await screen.findByTestId('sign-in-code-sent')).toBeTruthy();
    expect(client.signInWithOtp).toHaveBeenCalledWith({
      phone: '+37369123456',
      options: { shouldCreateUser: false },
    });
  });

  it('refuses a number too short for its country', async () => {
    const client = fakeAuthClient();
    await requestCode(client, '0721 234');

    expect((await screen.findByTestId('sign-in-address-error')).textContent).toContain(
      'prefixul țării'
    );
    expect(client.signInWithOtp).not.toHaveBeenCalled();
  });

  it.each([
    ['an address nobody invited', { message: 'Signups not allowed for otp', status: 422 }],
    ['a number the SMS hook refuses', { message: 'Error sending SMS', status: 500 }],
    ['a rate limit', { message: 'Too many requests', status: 429 }],
  ])('answers %s exactly like a known address', async (_case, error) => {
    const client = fakeAuthClient();
    client.signInWithOtp.mockResolvedValue({ error } as never);
    await requestCode(client, '0721 234 567');

    expect((await screen.findByTestId('sign-in-code-sent')).textContent).toMatch(sameAnswer);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('says the request failed only when it never reached Supabase', async () => {
    const client = fakeAuthClient();
    client.signInWithOtp.mockResolvedValue({
      error: { message: 'Failed to fetch', status: 0 },
    } as never);
    await requestCode(client, 'ana@example.ro');

    expect((await screen.findByTestId('sign-in-address-error')).textContent).toContain(
      'Cererea nu a putut fi trimisă'
    );
    expect(screen.queryByTestId('sign-in-code')).toBeNull();
  });

  it('refuses an address that is neither an email nor a phone number', async () => {
    const client = fakeAuthClient();
    await requestCode(client, '12');

    expect(await screen.findByTestId('sign-in-address-error')).toBeTruthy();
    expect(client.signInWithOtp).not.toHaveBeenCalled();
  });

  it('lets another code be asked for only after a minute', async () => {
    const client = fakeAuthClient();
    const person = await requestCode(client, 'ana@example.ro');
    const resend = await screen.findByTestId('sign-in-resend');

    expect(resend).toHaveProperty('disabled', true);
    expect(resend.textContent).toBe('Trimite alt cod în 60 s');
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(resend.textContent).toBe('Trimite alt cod în 30 s');
    await act(() => vi.advanceTimersByTimeAsync(30_000));
    expect(resend).toHaveProperty('disabled', false);

    await person.click(resend);
    expect(client.signInWithOtp).toHaveBeenCalledTimes(2);
    expect(await screen.findByTestId('sign-in-code-resent')).toBeTruthy();
    expect(screen.getByTestId('sign-in-resend').textContent).toBe('Trimite alt cod în 60 s');
  });

  it('verifies the email code once six digits are typed and opens the portal', async () => {
    const client = fakeAuthClient();
    const person = await requestCode(client, 'ana@example.ro');

    await person.type(await screen.findByTestId('sign-in-code'), '123456');

    expect(client.verifyOtp).toHaveBeenCalledWith({
      email: 'ana@example.ro',
      token: '123456',
      type: 'email',
    });
    expect(await screen.findByTestId('portal-loading')).toBeTruthy();
  });

  it('verifies an SMS code as such', async () => {
    const client = fakeAuthClient();
    const person = await requestCode(client, '+40 721 234 567');

    await person.type(await screen.findByTestId('sign-in-code'), '654321');

    expect(client.verifyOtp).toHaveBeenCalledWith({
      phone: '+40721234567',
      token: '654321',
      type: 'sms',
    });
  });

  it('says a wrong or expired code is wrong and lets the person try again', async () => {
    const client = fakeAuthClient();
    client.verifyOtp.mockResolvedValueOnce({
      data: { session: null },
      error: { message: 'Token has expired or is invalid', status: 403, code: 'otp_expired' },
    } as never);
    const person = await requestCode(client, 'ana@example.ro');
    const code = await screen.findByTestId('sign-in-code');

    await person.type(code, '111111');
    expect((await screen.findByTestId('sign-in-code-error')).textContent).toContain(
      'Codul nu este corect sau a expirat'
    );

    await person.clear(code);
    await person.type(code, '222222');
    await waitFor(() => expect(client.verifyOtp).toHaveBeenCalledTimes(2));
    expect(await screen.findByTestId('portal-loading')).toBeTruthy();
  });

  it('asks for six digits before verifying', async () => {
    const client = fakeAuthClient();
    const person = await requestCode(client, 'ana@example.ro');

    await person.type(await screen.findByTestId('sign-in-code'), '12a3');
    expect(screen.getByTestId('sign-in-code')).toHaveProperty('value', '123');
    await person.click(screen.getByTestId('sign-in-verify'));

    expect(screen.getByTestId('sign-in-code-error').textContent).toBe('Codul are șase cifre.');
    expect(client.verifyOtp).not.toHaveBeenCalled();
  });

  it('goes back to the address to use another one', async () => {
    const person = await requestCode(fakeAuthClient(), 'ana@example.ro');

    await person.click(await screen.findByTestId('sign-in-change-address'));

    expect(screen.getByTestId('sign-in-address')).toHaveProperty('value', 'ana@example.ro');
  });
});
