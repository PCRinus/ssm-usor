import '@docx-editor.dev/core/styles/editor.css';

import { DocxEditor, type DocxEditorRef } from '@docx-editor.dev/react';
import { type ReactNode, type Ref, useEffect, useImperativeHandle, useRef } from 'react';

// The Word editor itself, in a module of its own so that its three megabytes are only
// fetched when a document is opened. It takes bytes and gives bytes back (ADR 005), so
// replacing it touches this file and nothing that is stored.

export interface DocumentEditorHandle {
  /** The document as a `.docx`, or null when the editor has nothing loaded. */
  save: () => Promise<Uint8Array | null>;
}

export default function DocumentEditor({
  bytes,
  title,
  editable,
  handle,
  actions,
  onReady,
  onFailed,
  onChange,
  onSaveShortcut,
}: {
  bytes: Uint8Array;
  title: string;
  editable: boolean;
  handle: Ref<DocumentEditorHandle>;
  /** Our own controls, at the right of the editor's title bar. */
  actions: ReactNode;
  onReady: () => void;
  /** The editor could not lay the document out; it shows nothing in that case. */
  onFailed: () => void;
  onChange: () => void;
  onSaveShortcut: () => void;
}) {
  const editor = useRef<DocxEditorRef>(null);
  const ready = useRef(false);
  // The revision of the document as loaded or as last saved. Opening a file also reports
  // changes, from laying it out, which are not the person's.
  const cleanRevision = useRef<number | null>(null);

  useImperativeHandle(handle, () => ({
    save: async () => {
      const buffer = await editor.current?.save();
      cleanRevision.current = editor.current?.getDocumentHandle()?.revision ?? null;
      return buffer ? new Uint8Array(buffer) : null;
    },
  }));

  // A document the layout engine cannot paginate throws outside React, from its own
  // scheduling, and never reports ready. Until it has, an error on the page is taken as that;
  // so is half a minute of silence.
  useEffect(() => {
    const failed = () => {
      if (!ready.current) onFailed();
    };
    const timeout = window.setTimeout(failed, 30_000);
    window.addEventListener('error', failed);
    window.addEventListener('unhandledrejection', failed);
    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener('error', failed);
      window.removeEventListener('unhandledrejection', failed);
    };
  }, [onFailed]);

  return (
    <DocxEditor
      ref={editor}
      document={bytes}
      title={title}
      mode={editable ? 'edit' : 'view'}
      // Correcting a name or a sentence needs the toolbar and the page, not an office suite.
      menu={false}
      rulers={false}
      navigation={false}
      locale="ro-RO"
      renderTitleBarRight={() => actions}
      onReady={() => {
        ready.current = true;
        cleanRevision.current = editor.current?.getDocumentHandle()?.revision ?? null;
        onReady();
      }}
      onChange={(change) => {
        if (ready.current && change.revision !== cleanRevision.current) onChange();
      }}
      onSave={onSaveShortcut}
    />
  );
}
