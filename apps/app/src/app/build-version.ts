export const commitSha = import.meta.env.VITE_COMMIT_SHA ?? 'local';

// Set on production builds only (ADR 025).
export const releaseTag = () => import.meta.env.VITE_RELEASE_TAG || undefined;
