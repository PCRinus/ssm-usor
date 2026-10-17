import { describe, expect, it } from 'vitest';

import {
  clientAdministratorInvitationRequestSchema,
  participantInvitationRequestSchema,
} from './participants';

describe('participantInvitationRequestSchema', () => {
  it('lowercases an email', () => {
    expect(
      participantInvitationRequestSchema.parse({ channel: 'email', address: ' Ion@Example.RO ' })
    ).toEqual({ channel: 'email', address: 'ion@example.ro' });
  });

  it('stores a Romanian phone in E.164', () => {
    expect(
      participantInvitationRequestSchema.parse({ channel: 'sms', address: '0721 000 002' })
    ).toEqual({ channel: 'sms', address: '+40721000002' });
  });

  it.each([
    ['email', '0721000002'],
    ['sms', 'ion@example.ro'],
    ['sms', '0721'],
  ] as const)('refuses an address that is not of its channel (%s, %s)', (channel, address) => {
    const parsed = participantInvitationRequestSchema.safeParse({ channel, address });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.path).toEqual(['address']);
  });
});

describe('clientAdministratorInvitationRequestSchema', () => {
  it('takes a name for a person who is not an employee', () => {
    expect(
      clientAdministratorInvitationRequestSchema.parse({
        channel: 'email',
        address: 'hr@client.ro',
        fullName: ' Maria Pop ',
      })
    ).toMatchObject({ fullName: 'Maria Pop', address: 'hr@client.ro' });
  });

  it('takes an employee without a name', () => {
    expect(
      clientAdministratorInvitationRequestSchema.safeParse({
        channel: 'sms',
        address: '+40721000002',
        employeeId: 'e1e1e1e1-0000-4000-8000-000000000001',
      }).success
    ).toBe(true);
  });

  it('needs one of the two', () => {
    const parsed = clientAdministratorInvitationRequestSchema.safeParse({
      channel: 'email',
      address: 'hr@client.ro',
    });
    expect(parsed.error?.issues.map((issue) => issue.path)).toEqual([['fullName']]);
  });
});
