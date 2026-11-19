import type { InvitationErrorReason } from '@ssm-usor/contracts';

import { fromDatabaseError } from '../../lib/db';
import { ApiError } from '../../lib/errors';

interface PostgrestError {
  code?: string | null;
  message?: string;
}

export const invitationNotOpen = (status: string) =>
  ApiError.conflict(
    `invitation_${status}` as InvitationErrorReason,
    `The invitation is ${status}.`
  );

export const accountExists = () =>
  ApiError.conflict(
    'account_exists',
    'An account already exists for this address. Sign in to accept.'
  );

// The invitation functions raise their own SQLSTATEs; see the migration that defines them.
export function fromInvitationError(error: PostgrestError, context: string): ApiError {
  switch (error.code) {
    case 'INV01':
      return ApiError.conflict('already_member', 'This address already belongs to a member.');
    case 'INV02':
      return ApiError.conflict(
        'too_many_open_invitations',
        'The organization has too many open invitations.'
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
      return ApiError.conflict(
        'already_in_organization',
        'This account already belongs to an organization.'
      );
  }
  return fromDatabaseError(error, context);
}
