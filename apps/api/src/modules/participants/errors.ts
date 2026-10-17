import { type ParticipantErrorReason, participantErrorReasons } from '@ssm-usor/contracts';

import { fromDatabaseError } from '../../lib/db';
import { ApiError } from '../../lib/errors';

interface PostgrestError {
  code?: string | null;
  message?: string;
}

const conflict = (message: string, reason: ParticipantErrorReason) =>
  new ApiError('conflict', message, undefined, reason);

const notFound: Record<string, string> = {
  client_not_found: 'This client does not exist in your organization.',
  employee_not_found: 'This employee does not exist under this client.',
  invitation_not_found: 'The invitation does not exist.',
};

const unclear: Record<string, [string, ParticipantErrorReason]> = {
  employee_required: ['An employee invitation needs the employee.', 'employee_required'],
  full_name_required: [
    'A name is needed for a person who is not an employee.',
    'full_name_required',
  ],
  invalid_address: ['The address cannot be invited.', 'invalid_address'],
  address_not_of_employee: [
    "The address is not the employee's email or phone as their record holds it.",
    'address_not_of_employee',
  ],
};

// The participant functions raise their own SQLSTATEs; see the migration that defines them.
export function fromParticipantError(error: PostgrestError, context: string): ApiError {
  const message = error.message ?? '';
  switch (error.code) {
    case 'P0002':
      return new ApiError('not_found', notFound[message]);
    case 'PRT01':
      return conflict(
        'The employee is already a participant.',
        participantErrorReasons.employeeHasParticipant
      );
    case 'PRT02':
      return conflict(
        'The employee has an open invitation at another address.',
        participantErrorReasons.employeeAlreadyInvited
      );
    case 'PRT03':
      return message === 'address_has_participant'
        ? conflict(
            'This address belongs to a participant of the client.',
            participantErrorReasons.addressHasParticipant
          )
        : conflict(
            'This address has an open invitation for another person.',
            participantErrorReasons.addressInvitedForAnotherPerson
          );
    case 'PRT04': {
      const [text, reason] = unclear[message] ?? unclear.invalid_address!;
      return conflict(text, reason);
    }
    case 'PRT05':
      return conflict(
        'A message was sent to this address in the last 10 minutes.',
        participantErrorReasons.sentRecently
      );
    case 'PRT06':
      return message === 'accepted'
        ? conflict('The invitation was accepted.', participantErrorReasons.invitationAccepted)
        : conflict('The invitation was revoked.', participantErrorReasons.invitationRevoked);
  }
  return fromDatabaseError(error, context);
}
