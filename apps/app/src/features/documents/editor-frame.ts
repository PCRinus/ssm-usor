import { saveFile } from '@ssm-usor/ui/lib/save-file';

const docxType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

// On a phone the editor reaches the screen's edges over the page's padding, which everything
// else on an editor page keeps: an error from a route above has no frame to take it away.
export const editorFrameClassName =
  '@container relative min-h-0 flex-1 overflow-hidden rounded-lg border bg-background max-sm:-m-3 max-sm:rounded-none max-sm:border-0';

export function saveAs(bytes: Uint8Array, fileName: string) {
  saveFile(new Blob([new Uint8Array(bytes)], { type: docxType }), fileName);
}
