// The shadcn provider keeps this in a cookie for a server to read back; the SPA has no server.
const storageKey = 'ssm-usor:sidebar-open';

export function readSidebarOpen() {
  try {
    return localStorage.getItem(storageKey) !== 'false';
  } catch {
    return true;
  }
}

export function saveSidebarOpen(open: boolean) {
  try {
    localStorage.setItem(storageKey, String(open));
  } catch {
    // Without storage the sidebar opens expanded on the next load.
  }
}
