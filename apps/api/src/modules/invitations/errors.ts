import type { InvitationErrorReason } from '@ssm-usor/contracts';

import { fromDatabaseError } from '../../lib/db';
import { ApiError } from '../../lib/errors';

interface PostgrestError {
  code?: string | null;
  message?: string;
}

const conflict = (message: string, reason: InvitationErrorReason) =>
  new ApiError('conflict', message, undefined, reason);

export const invitationNotOpen = (status: string) =>
  conflict(`The invitation is ${status}.`, `invitation_${status}` as InvitationErrorReason);

export const accountExists = () =>
  conflict('An account already exists for this address. Sign in to accept.', 'account_exists');

// The invitation functions raise their own SQLSTATEs; see the migration that defines them.
export function fromInvitationError(error: PostgrestError, context: string): ApiError {
  switch (error.code) {
    case 'INV01':
      return conflict('This address already belongs to a member.', 'already_member');
    case 'INV02':
      return conflict(
        'The organization has too many open invitations.',
        'too_many_open_invitations'
      );
    case 'INV03':
      return error.message === 'not_found'
        ? new ApiError('not_found', 'The invitation does not exist.')
        : invitationNotOpen(error.message ?? 'closed');
    case 'INV04':
      return new ApiError(
        'forbidden',
        'The invitation was sent to a different address.',
        undefined,
        'email_mismatch' satisfies InvitationErrorReason
      );
    case 'INV05':
      return conflict(
        'This account already belongs to an organization.',
        'already_in_organization'
      );
  }
  return fromDatabaseError(error, context);
}
