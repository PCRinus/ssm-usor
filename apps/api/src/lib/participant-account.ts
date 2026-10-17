// The flag in `app_metadata` of an auth account the API created or reused for a participant
// invitation (ADR 022). Only the secret key writes `app_metadata`, so an account someone made
// for themselves through Supabase's own endpoints never carries it.
export const PARTICIPANT_ACCOUNT_FLAG = 'participant';

export function isParticipantAccount(appMetadata: Record<string, unknown> | null | undefined) {
  return appMetadata?.[PARTICIPANT_ACCOUNT_FLAG] === true;
}
