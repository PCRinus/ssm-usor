const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');

// The tests mock Supabase Auth's check of the signature, so only the claims matter.
export const accessTokenAt = (aal: 'aal1' | 'aal2', sub = '0f7c8d96-479c-47b3-b49e-01f4555a0221') =>
  `${encode({ alg: 'ES256', typ: 'JWT' })}.${encode({ sub, aal })}.c2lnbmF0dXJl`;
