// Saved from a blob rather than by opening the signed Storage URL: a browser ignores
// `download` on a link to another origin, and Storage's own header percent-encodes the name,
// which loses its diacritics.
//
// The object URL is revoked a minute later, not right after the click: Chrome on Android
// hands the download to its download manager after `click()` returns, and an already revoked
// URL leaves it a blank tab.
export function saveFile(file: Blob, fileName: string) {
  const objectUrl = URL.createObjectURL(file);
  const anchor = document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}
