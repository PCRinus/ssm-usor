import { describe, expect, it } from 'vitest';

import {
  bulkEmployeeInvitationRequestSchema,
  clientAdministratorInvitationRequestSchema,
  participantInvitationRequestSchema,
  typedInvitationAddress,
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

describe('typedInvitationAddress', () => {
  it('goes by email when an email is typed', () => {
    expect(typedInvitationAddress(' Daniela.Coman@Yahoo.com ')).toEqual({
      channel: 'email',
      address: 'daniela.coman@yahoo.com',
    });
  });

  it('goes by SMS when a phone is typed, in E.164', () => {
    expect(typedInvitationAddress('0742 115 980')).toEqual({
      channel: 'sms',
      address: '+40742115980',
    });
  });

  it.each(['ion@', '0742', 'tel 0742 115 980', ''])('takes neither from %j', (text) => {
    expect(typedInvitationAddress(text)).toBeNull();
  });
});

describe('bulkEmployeeInvitationRequestSchema', () => {
  const employeeId = 'e1e1e1e1-0000-4000-8000-000000000001';

  it('keeps an address that is neither email nor phone for its own row', () => {
    expect(
      bulkEmployeeInvitationRequestSchema.safeParse({
        invitations: [{ employeeId, address: 'nu știu' }],
      }).success
    ).toBe(true);
  });

  it('invites an employee once per request', () => {
    const parsed = bulkEmployeeInvitationRequestSchema.safeParse({
      invitations: [
        { employeeId, address: 'ion@example.ro' },
        { employeeId, address: '0721000002' },
      ],
    });
    expect(parsed.error?.issues.map((issue) => issue.path)).toEqual([
      ['invitations', 1, 'employeeId'],
    ]);
  });
});
