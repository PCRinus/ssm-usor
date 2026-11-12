const localMemberApp = 'http://localhost:5173';

// Each deployed admin host is the member app's host with `admin` in place of `app`, so the
// origin follows the environment without a setting of its own.
export function memberAppOrigin(
  hostname: string,
  configured: string | undefined = import.meta.env.VITE_APP_URL
) {
  if (hostname.startsWith('admin.')) return `https://app.${hostname.slice('admin.'.length)}`;
  try {
    return configured ? new URL(configured).origin : localMemberApp;
  } catch {
    return localMemberApp;
  }
}

export const memberAppUrl = () => `${memberAppOrigin(window.location.hostname)}/`;
