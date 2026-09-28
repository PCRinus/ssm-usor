// For a file the page holds itself. The object URL is revoked a minute later, not right after
// the click: Chrome on Android hands the download to its download manager after `click()`
// returns, and an already revoked URL leaves it a blank tab.
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

// For a file in Storage: the API passes it through under a header with its real name, and
// the browser opens that address. Not fetched into the page and saved from a blob: Firefox on
// Android cannot save an object URL at all and shows a blank tab, while its download manager
// fetches a real address like any other file. Same tab, so no empty tab is left behind.
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
