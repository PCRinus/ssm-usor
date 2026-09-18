const codeOf = (error: unknown) =>
  typeof error === 'object' && error !== null && 'code' in error ? error.code : null;

export function loginErrorMessage(error: unknown): string {
  const code = codeOf(error);
  switch (code) {
    case 'invalid_credentials':
      return 'Adresa de email sau parola este incorectă.';
    case 'email_not_confirmed':
      return 'Confirmă adresa de email înainte de autentificare.';
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return 'Prea multe încercări. Așteaptă puțin și încearcă din nou.';
    default:
      return 'Nu te-am putut autentifica. Verifică conexiunea și încearcă din nou.';
  }
}

const rateLimited = 'Prea multe încercări. Așteaptă puțin și încearcă din nou.';

// A recovery link that expired, was already used, or was replaced by a newer one.
export const isSpentRecoveryLink = (error: unknown) =>
  ['otp_expired', 'otp_disabled', 'validation_failed', 'bad_jwt'].includes(String(codeOf(error)));

export function newPasswordErrorMessage(error: unknown): string {
  switch (codeOf(error)) {
    case 'same_password':
      return 'Parola nouă trebuie să fie diferită de cea veche.';
    case 'weak_password':
      return 'Parola este prea slabă. Alege una mai greu de ghicit.';
    case 'over_request_rate_limit':
      return rateLimited;
    default:
      return 'Nu am putut schimba parola. Verifică conexiunea și încearcă din nou.';
  }
}

export function forgotPasswordErrorMessage(error: unknown): string {
  switch (codeOf(error)) {
    case 'over_request_rate_limit':
    case 'over_email_send_rate_limit':
      return 'Ai cerut deja un email de resetare. Așteaptă un minut și încearcă din nou.';
    default:
      return 'Nu am putut trimite emailul. Verifică conexiunea și încearcă din nou.';
  }
}
