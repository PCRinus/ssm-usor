export function loginErrorMessage(error: unknown): string {
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : null;
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
