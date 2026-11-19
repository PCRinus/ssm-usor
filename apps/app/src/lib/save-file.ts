import { openPreview as openPreviewTab } from '@ssm-usor/ui/lib/save-file';

export { PreviewBlockedError, saveFile } from '@ssm-usor/ui/lib/save-file';

export const openPreview = (load: () => Promise<Blob>, title: string) =>
  openPreviewTab(load, { title, pending: 'Se pregătește fișa…' });
