const docxType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export const editorFrameClassName =
  'relative min-h-0 flex-1 overflow-hidden rounded-lg border bg-background';

export function saveAs(bytes: Uint8Array, fileName: string) {
  const objectUrl = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: docxType }));
  const anchor = window.document.createElement('a');
  anchor.href = objectUrl;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(objectUrl);
}
