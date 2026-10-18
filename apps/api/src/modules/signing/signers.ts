import type {
  ParticipantChannel,
  ParticipantKind,
  SignerCandidate,
  SignerKind,
} from '@ssm-usor/contracts';

import type { AdminClient } from '../../lib/admin-db';
import { type DataClient, fromDatabaseError } from '../../lib/db';
import { ApiError } from '../../lib/errors';

export type SignerContact = { channel: ParticipantChannel; address: string };

export type SigningPlace = 'portal' | 'app';

export type Signer = SignerCandidate & { contact: SignerContact | null };

type Reachable = {
  emails: (string | null | undefined)[];
  phones: (string | null | undefined)[];
};

// Email whenever the person has one, so that SMS is spent only on those without (ADR 023).
export function contactOf({ emails, phones }: Reachable): SignerContact | null {
  const email = emails.map((value) => value?.trim().toLowerCase()).find(Boolean);
  if (email) return { channel: 'email', address: email };
  const phone = phones.map((value) => value?.trim()).find(Boolean);
  return phone ? { channel: 'sms', address: phone } : null;
}

const participantColumns =
  'user_id, kind, employee_id, full_name, employees!client_participants_employee_of_client(last_name, first_name, job_title, email, phone), participant_invitations(channel, address, accepted_at)';

type ParticipantRow = {
  user_id: string;
  kind: ParticipantKind;
  employee_id: string | null;
  full_name: string | null;
  employees: {
    last_name: string;
    first_name: string;
    job_title: string;
    email: string | null;
    phone: string | null;
  } | null;
  participant_invitations: { channel: string; address: string; accepted_at: string | null }[];
};

function participantSigner(row: ParticipantRow): Signer {
  const invitation = row.participant_invitations.find((candidate) => candidate.accepted_at);
  const invited = (channel: string) =>
    invitation?.channel === channel ? invitation.address : null;
  return {
    accountId: row.user_id,
    name: row.employees
      ? `${row.employees.last_name} ${row.employees.first_name}`
      : (row.full_name ?? ''),
    jobTitle: row.employees?.job_title ?? null,
    kind: row.kind satisfies SignerKind,
    employeeId: row.employee_id,
    contact: contactOf({
      emails: [row.employees?.email, invited('email')],
      phones: [row.employees?.phone, invited('sms')],
    }),
  };
}

/**
 * Everyone who may sign a client's records, as the member reads them: the organization's members
 * first, then the client's active participants. An account that is both is listed twice.
 */
export async function signersOfClient(db: DataClient, clientId: string): Promise<Signer[]> {
  const [members, participants] = await Promise.all([
    db.rpc('organization_member_list'),
    db
      .from('client_participants')
      .select(participantColumns)
      .eq('client_id', clientId)
      .is('revoked_at', null)
      .order('created_at')
      .limit(1000),
  ]);
  if (members.error) throw fromDatabaseError(members.error, 'signer members');
  if (participants.error) throw fromDatabaseError(participants.error, 'signer participants');
  return [
    ...members.data.map((member): Signer => ({
      accountId: member.user_id,
      name: member.full_name,
      jobTitle: member.professional_title || null,
      kind: 'member',
      employeeId: null,
      contact: contactOf({ emails: [member.email], phones: [] }),
    })),
    ...(participants.data as ParticipantRow[]).map(participantSigner),
  ];
}

/** The employee's own active participant, who alone signs as the trainee. */
export const traineeSignerOf = (signers: Signer[], employeeId: string) =>
  signers.find((signer) => signer.kind === 'employee' && signer.employeeId === employeeId) ??
  signers.find((signer) => signer.kind !== 'member' && signer.employeeId === employeeId);

/** A member signs in the app; anyone else, and every trainee, in the portal. */
export function placeOf(signers: Signer[], accountId: string, trainee: boolean) {
  const as = (place: SigningPlace) =>
    signers.find(
      (signer) => signer.accountId === accountId && (place === 'app') === (signer.kind === 'member')
    );
  const member = trainee ? undefined : as('app');
  if (member) return { place: 'app' as const, signer: member };
  const participant = as('portal');
  return participant ? { place: 'portal' as const, signer: participant } : null;
}

/**
 * Where to send a signer's code, for the signing session, which runs as the signer and may not
 * read the invitation that holds an administrator's address: the secret key reads it instead.
 */
export async function signerContact(
  admin: AdminClient,
  signer: { accountId: string; clientId: string; place: SigningPlace }
): Promise<SignerContact | null> {
  if (signer.place === 'app') {
    const { data, error } = await admin.auth.admin.getUserById(signer.accountId);
    if (error) {
      console.error(`Signer account read failed: ${error.code ?? 'no code'}`);
      throw new ApiError('service_unavailable');
    }
    return contactOf({ emails: [data.user.email], phones: [] });
  }
  const { data, error } = await admin
    .from('client_participants')
    .select(participantColumns)
    .eq('client_id', signer.clientId)
    .eq('user_id', signer.accountId)
    .is('revoked_at', null)
    .order('created_at')
    .limit(1)
    .maybeSingle();
  if (error) throw fromDatabaseError(error, 'signer participant');
  return data ? participantSigner(data as ParticipantRow).contact : null;
}
