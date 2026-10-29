import { type ComponentProps, useEffect } from 'react';

import type DocumentEditor from '@/features/documents/document-editor';

// The real editor is three megabytes of layout engine, and its first load in a busy worker
// outlasts a findBy's second; the flow tests drive it.
export default function FakeDocumentEditor({
  back,
  actions,
  onReady,
}: ComponentProps<typeof DocumentEditor>) {
  useEffect(() => onReady(), [onReady]);
  return (
    <header data-testid="fake-editor">
      {back}
      {actions}
    </header>
  );
}
