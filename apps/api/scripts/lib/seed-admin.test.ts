import { createClient } from '@supabase/supabase-js';
import { describe, expect, it, vi } from 'vitest';

import { seedAdmin } from './seed-admin';

const email = 'admin@ssmusor.test';
const seededUser = {
  id: '5288ae45-7820-4f4d-a252-4fa67c541ef0',
  email,
  app_metadata: { role: 'admin', seed: 'ssm-usor-development-admin', existing_setting: true },
};

function fixture() {
  const fetchMock = vi.fn<typeof fetch>();
  const client = createClient('https://example.supabase.co', 'sb_secret_test', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: fetchMock },
  });
  return { admin: client.auth.admin, fetchMock };
}

const requestBody = (init?: RequestInit) => JSON.parse(String(init?.body));

describe('development admin seed', () => {
  it('creates a confirmed admin, then updates the same account on rerun without touching the password', async () => {
    const { admin, fetchMock } = fixture();
    fetchMock
      .mockResolvedValueOnce(Response.json({ users: [] }))
      .mockResolvedValueOnce(Response.json(seededUser))
      .mockResolvedValueOnce(Response.json({ users: [seededUser] }))
      .mockResolvedValueOnce(Response.json(seededUser));
    const first = await seedAdmin(admin, email, 'admin123');
    const second = await seedAdmin(admin, email, 'changed-password');
    expect(first.action).toBe('Created');
    expect(second.action).toBe('Updated');
    expect(second.user.id).toBe(first.user.id);
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe('POST');
    expect(requestBody(fetchMock.mock.calls[1]?.[1])).toMatchObject({
      email,
      password: 'admin123',
      email_confirm: true,
      app_metadata: { role: 'admin', seed: 'ssm-usor-development-admin' },
    });
    expect(requestBody(fetchMock.mock.calls[1]?.[1])).not.toHaveProperty('user_metadata');
    expect(fetchMock.mock.calls[3]?.[0]).toBe(
      `https://example.supabase.co/auth/v1/admin/users/${seededUser.id}`
    );
    expect(fetchMock.mock.calls[3]?.[1]?.method).toBe('PUT');
    expect(requestBody(fetchMock.mock.calls[3]?.[1])).toMatchObject({
      email_confirm: true,
      app_metadata: { ...seededUser.app_metadata },
    });
    expect(requestBody(fetchMock.mock.calls[3]?.[1])).not.toHaveProperty('password');
  });

  it('resets the password of the seeded account only when asked', async () => {
    const { admin, fetchMock } = fixture();
    fetchMock
      .mockResolvedValueOnce(Response.json({ users: [seededUser] }))
      .mockResolvedValueOnce(Response.json(seededUser));
    const result = await seedAdmin(admin, email, 'new-password', { resetPassword: true });
    expect(result.action).toBe('Updated');
    expect(fetchMock.mock.calls[1]?.[1]?.method).toBe('PUT');
    expect(requestBody(fetchMock.mock.calls[1]?.[1])).toMatchObject({ password: 'new-password' });
  });

  it('refuses to reset or promote an existing account without the trusted seed marker', async () => {
    const { admin, fetchMock } = fixture();
    fetchMock.mockResolvedValue(
      Response.json({
        users: [
          {
            ...seededUser,
            email: email.toUpperCase(),
            app_metadata: {},
            user_metadata: { seed: 'ssm-usor-development-admin' },
          },
        ],
      })
    );
    await expect(seedAdmin(admin, email, 'admin123')).rejects.toThrow(
      'not managed by the development seed'
    );
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('searches later pages before creating an account', async () => {
    const { admin, fetchMock } = fixture();
    fetchMock
      .mockResolvedValueOnce(
        Response.json({
          users: Array.from({ length: 1000 }, () => ({
            ...seededUser,
            email: 'other@example.test',
          })),
        })
      )
      .mockResolvedValueOnce(Response.json({ users: [seededUser] }))
      .mockResolvedValueOnce(Response.json(seededUser));
    expect((await seedAdmin(admin, email, 'admin123')).action).toBe('Updated');
    expect(String(fetchMock.mock.calls[1]?.[0])).toContain('page=2');
    expect(fetchMock.mock.calls[2]?.[1]?.method).toBe('PUT');
  });

  it('does not create an account if lookup fails', async () => {
    const { admin, fetchMock } = fixture();
    fetchMock.mockResolvedValue(Response.json({ message: 'Admin access denied' }, { status: 403 }));
    await expect(seedAdmin(admin, email, 'admin123')).rejects.toThrow(
      'Could not find the seed account'
    );
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('reports password-policy failures without retrying with a different password', async () => {
    const { admin, fetchMock } = fixture();
    fetchMock
      .mockResolvedValueOnce(Response.json({ users: [] }))
      .mockResolvedValueOnce(Response.json({ message: 'Password is too weak' }, { status: 422 }));
    await expect(seedAdmin(admin, email, 'admin123')).rejects.toThrow('Password is too weak');
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
