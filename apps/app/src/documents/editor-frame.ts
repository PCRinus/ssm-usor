import { saveFile } from '../lib/save-file';

const docxType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

export const editorFrameClassName =
  'relative min-h-0 flex-1 overflow-hidden rounded-lg border bg-background';

export function saveAs(bytes: Uint8Array, fileName: string) {
  saveFile(new Blob([new Uint8Array(bytes)], { type: docxType }), fileName);
}
