import { type ParticipantErrorReason, participantErrorReasons } from '@ssm-usor/contracts';

import { fromDatabaseError } from '../../lib/db';
import { ApiError } from '../../lib/errors';
import { clientNotFound } from '../clients/lookup';

interface PostgrestError {
  code?: string | null;
  message?: string;
}

const notFound: Record<string, string> = {
  client_not_found: clientNotFound().message,
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
      return ApiError.conflict(
        participantErrorReasons.employeeHasParticipant,
        'The employee is already a participant.'
      );
    case 'PRT02':
      return ApiError.conflict(
        participantErrorReasons.employeeAlreadyInvited,
        'The employee has an open invitation at another address.'
      );
    case 'PRT03':
      return message === 'address_has_participant'
        ? ApiError.conflict(
            participantErrorReasons.addressHasParticipant,
            'This address belongs to a participant of the client.'
          )
        : ApiError.conflict(
            participantErrorReasons.addressInvitedForAnotherPerson,
            'This address has an open invitation for another person.'
          );
    case 'PRT04': {
      const [text, reason] = unclear[message] ?? unclear.invalid_address!;
      return ApiError.conflict(reason, text);
    }
    case 'PRT05':
      return ApiError.conflict(
        participantErrorReasons.sentRecently,
        'A message was sent to this address in the last 10 minutes.'
      );
    case 'PRT06':
      return message === 'accepted'
        ? ApiError.conflict(
            participantErrorReasons.invitationAccepted,
            'The invitation was accepted.'
          )
        : ApiError.conflict(
            participantErrorReasons.invitationRevoked,
            'The invitation was revoked.'
          );
  }
  return fromDatabaseError(error, context);
}
