// For a file the page holds itself. The object URL is revoked a minute later, as FileSaver.js
// does, not right after the click: a browser may start reading it only after `click()` returns.
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

export class PreviewBlockedError extends Error {
  constructor() {
    super('The browser blocked the preview tab.');
    this.name = 'PreviewBlockedError';
  }
}

// Call it straight from a click handler: the tab must open before the first await, or pop-up
// blockers refuse it. A blob URL made here is same-origin for the tab, so the browser's own
// viewer shows the PDF inline, iOS Safari included.
export async function openPreview(load: () => Promise<Blob>, title: string) {
  const tab = window.open('', '_blank');
  if (!tab) throw new PreviewBlockedError();
  tab.document.write(
    '<!doctype html><meta charset="utf-8"><meta name="color-scheme" content="light dark">' +
      '<p style="font:16px system-ui,sans-serif;margin:2rem;opacity:.7">Se pregătește fișa…</p>'
  );
  tab.document.close();
  tab.document.title = title;
  try {
    const objectUrl = URL.createObjectURL(await load());
    tab.location.replace(objectUrl);
    // Kept for ten minutes: the viewer may still be reading it, and a reload of the tab needs it.
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 600_000);
  } catch (cause) {
    tab.close();
    throw cause;
  }
}

// For a file in Storage: the API passes it through under its real name, which Storage's own
// header loses. A download needs a full browser: the in-app browser Gmail opens on Android (a
// Firefox custom tab) cannot download at all, so the public contract page shows its PDF
// `inline` instead.
export function openDownload(
  apiBaseUrl: string | undefined,
  link: { url: string; fileName: string }
) {
  const anchor = document.createElement('a');
  anchor.href = fileAddress(apiBaseUrl, link, 'attachment');
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}

export function fileAddress(
  apiBaseUrl: string | undefined,
  link: { url: string; fileName: string },
  disposition: 'attachment' | 'inline'
) {
  if (!apiBaseUrl) throw new Error('The API URL is not configured.');
  const address = new URL('files/download', `${apiBaseUrl.replace(/\/$/, '')}/`);
  address.searchParams.set('source', link.url);
  address.searchParams.set('name', link.fileName);
  address.searchParams.set('disposition', disposition);
  return address.href;
}
