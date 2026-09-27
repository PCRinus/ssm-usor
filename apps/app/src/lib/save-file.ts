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

// For a file in Storage, through a link signed with its name, which Storage answers as an
// attachment under that name. Not fetched into the page and saved from a blob: Firefox on
// Android cannot save an object URL at all and shows a blank tab, while its download manager
// fetches a real address like any other file. Same tab, so no empty tab is left behind.
export function openDownload(url: string) {
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.hidden = true;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
}
