const dismissedKey = 'ssm-usor:update-dismissed';

// Storage throws in some private windows; the dialog then simply shows again on reload.
export function readDismissedTag() {
  try {
    return sessionStorage.getItem(dismissedKey);
  } catch {
    return null;
  }
}

export function saveDismissedTag(tag: string) {
  try {
    sessionStorage.setItem(dismissedKey, tag);
  } catch {
    return;
  }
}
