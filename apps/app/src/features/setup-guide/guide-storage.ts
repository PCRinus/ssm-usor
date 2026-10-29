export type GuideView = 'expanded' | 'collapsed';

const viewKey = (userId: string) => `ssm-usor:setup-guide-view:${userId}`;
const openedKey = (userId: string) => `ssm-usor:setup-guide-opened:${userId}`;

// Storage throws in some private windows; the guide then opens collapsed and forgets its size.
export function readGuideView(userId: string): GuideView | null {
  try {
    const stored = sessionStorage.getItem(viewKey(userId));
    return stored === 'expanded' || stored === 'collapsed' ? stored : null;
  } catch {
    return null;
  }
}

export function saveGuideView(userId: string, view: GuideView) {
  try {
    sessionStorage.setItem(viewKey(userId), view);
  } catch {
    return;
  }
}

export function wasOpenedHere(userId: string) {
  try {
    return localStorage.getItem(openedKey(userId)) !== null;
  } catch {
    return true;
  }
}

export function markOpenedHere(userId: string) {
  try {
    localStorage.setItem(openedKey(userId), new Date().toISOString());
  } catch {
    return;
  }
}
