const returnKey = 'ssm-usor.google-sign-in';

export type GoogleSignInOrigin = { from: '/login' | '/register'; invitation?: string };

// Kept in the tab rather than in `redirectTo`: Supabase accepts only the redirect URLs listed in
// supabase/config.toml, so the callback's address carries nothing of its own.
export function rememberGoogleSignInOrigin(origin: GoogleSignInOrigin) {
  try {
    sessionStorage.setItem(returnKey, JSON.stringify(origin));
  } catch {
    // Without storage the callback falls back to /login and /dashboard.
  }
}

export function forgetGoogleSignInOrigin() {
  try {
    sessionStorage.removeItem(returnKey);
  } catch {
    // Nothing to forget.
  }
}

export function readGoogleSignInOrigin(): GoogleSignInOrigin {
  try {
    const saved = sessionStorage.getItem(returnKey);
    const parsed: unknown = saved ? JSON.parse(saved) : null;
    if (
      parsed &&
      typeof parsed === 'object' &&
      'from' in parsed &&
      (parsed.from === '/login' || parsed.from === '/register')
    ) {
      const invitation =
        'invitation' in parsed && typeof parsed.invitation === 'string'
          ? parsed.invitation
          : undefined;
      return { from: parsed.from, invitation };
    }
  } catch {
    // Unreadable storage is the same as nothing saved.
  }
  return { from: '/login' };
}
