import '@docx-editor.dev/core/styles/editor.css';
import './editor-theme.css';
import './document-editor.css';

import { packagedFonts } from '@docx-editor.dev/fonts';
import { DocxEditor, type DocxEditorRef, useEditorState } from '@docx-editor.dev/react';
import { useIsPhone } from '@ssm-usor/ui/hooks/use-mobile';
import { type ReactNode, type Ref, useEffect, useImperativeHandle, useRef, useState } from 'react';

import type { PhoneBar } from './editor-bar';
import { editorStrings } from './editor-strings.ro';
import { NavigationButton } from './navigation-button';
import { PhoneEditorBar } from './phone-editor-bar';
import { UnfilledNavigator } from './unfilled-navigator';
import { useDocumentNavigation } from './use-document-navigation';
import { useUnfilledMarks } from './use-unfilled-marks';

// The Word editor itself, in a module of its own so that its three megabytes are only
// fetched when a document is opened. It takes bytes and gives bytes back (ADR 005), so
// replacing it touches this file and nothing that is stored.

// Without font bytes the editor measures text with whatever the machine has, so a Linux
// browser, which has no Arial, breaks lines and pages differently from Windows. Arial cannot
// be shipped, but Liberation Sans can, and it is built to Arial's metrics: with its bytes
// every machine lays a document out the same, and as Word does. The house style sets all
// text in Arial, so that one family is all that is allowed to load, from our own origin,
// about 0.8 MB once per browser. The other packaged families (Carlito as a stand-in for a
// default the templates never use, serif and mono faces that styles merely declare) would
// add 2.6 MB for nothing.
const fonts = packagedFonts({ allow: ['Arial'] });

export interface DocumentEditorHandle {
  /** The document as a `.docx`, or null when the editor has nothing loaded. */
  save: () => Promise<Uint8Array | null>;
  /** The same, without counting as saved. */
  copy: () => Promise<Uint8Array | null>;
}

export default function DocumentEditor({
  bytes,
  title,
  editable,
  back,
  handle,
  actions,
  phoneBar,
  download,
  onReady,
  onChange,
  onSaveShortcut,
}: {
  bytes: Uint8Array;
  title: string;
  editable: boolean;
  back: ReactNode;
  handle: Ref<DocumentEditorHandle>;
  actions: ReactNode;
  phoneBar: PhoneBar;
  /** Offered in the editor's dialog when the document does not open. */
  download: { label: string; onClick: () => void };
  /** The document is laid out, or did not open and the editor says so. */
  onReady: () => void;
  onChange: () => void;
  onSaveShortcut: () => void;
}) {
  const editor = useRef<DocxEditorRef>(null);
  const ready = useRef(false);
  // The revision of the document as loaded or as last saved. Opening a file also reports
  // changes, from laying it out, which are not the person's.
  const cleanRevision = useRef<number | null>(null);
  const [laidOut, setLaidOut] = useState(false);
  const pane = useDocumentNavigation();
  const phone = useIsPhone();

  useImperativeHandle(handle, () => ({
    save: async () => {
      const buffer = await editor.current?.save();
      cleanRevision.current = editor.current?.getDocumentHandle()?.revision ?? null;
      return buffer ? new Uint8Array(buffer) : null;
    },
    copy: async () => {
      const buffer = await editor.current?.save();
      return buffer ? new Uint8Array(buffer) : null;
    },
  }));

  const settle = () => {
    if (ready.current) return;
    ready.current = true;
    setLaidOut(true);
    cleanRevision.current = editor.current?.getDocumentHandle()?.revision ?? null;
    onReady();
  };

  return (
    <DocxEditor
      ref={editor}
      document={bytes}
      title={title}
      mode={editable ? 'edit' : 'view'}
      // Correcting a name or a sentence needs the toolbar and the page, not an office suite.
      menu={false}
      rulers={false}
      navigation={pane.navigation}
      locale="ro-RO"
      // A module constant: a catalogue with a new identity rebuilds the whole interface.
      i18n={editorStrings}
      fonts={fonts}
      // The editor spaces its title row 8 px apart and pads its title 6 px; -2 px leaves the
      // arrow the 12 px it has beside every other title. The row centres both on one line.
      renderTitleBarLeft={() =>
        phone ? null : (
          <span data-editor-title-back className="-mr-0.5 flex">
            {back}
          </span>
        )
      }
      // One element at every width: turning a phone past the breakpoint keeps the marks found,
      // and only the controls around the one editor change.
      renderTitleBarRight={() => (
        <TitleBarControls
          phone={phone}
          ready={laidOut}
          editable={editable}
          pane={pane}
          actions={actions}
          phoneBar={phoneBar}
        />
      )}
      onReady={settle}
      onChange={(change) => {
        if (ready.current && change.revision !== cleanRevision.current) onChange();
      }}
      onSave={onSaveShortcut}
      openFailure={{
        actions: () => (
          <DocxEditor.OpenFailure.Action variant="primary" onClick={download.onClick}>
            {download.label}
          </DocxEditor.OpenFailure.Action>
        ),
      }}
    >
      <OpenFailureWatch onFailed={settle} />
    </DocxEditor>
  );
}

// A large document the editor refuses never reports ready, and the page keeps it covered and
// unreachable until it does: its dialog would show behind the cover.
function OpenFailureWatch({ onFailed }: { onFailed: () => void }) {
  const failed = useEditorState((state) => Boolean(state.openFailure));
  useEffect(() => {
    if (failed) onFailed();
  }, [failed, onFailed]);
  return null;
}

function TitleBarControls({
  phone,
  ready,
  editable,
  pane,
  actions,
  phoneBar,
}: {
  phone: boolean;
  ready: boolean;
  editable: boolean;
  pane: { open: boolean; toggle: () => void };
  actions: ReactNode;
  phoneBar: PhoneBar;
}) {
  const marks = useUnfilledMarks(ready && editable);
  if (phone) {
    return <PhoneEditorBar bar={phoneBar} editable={editable} marks={marks} navigation={pane} />;
  }
  return (
    <div data-editor-title-actions className="flex flex-wrap items-center gap-2">
      <NavigationButton open={pane.open} onToggle={pane.toggle} />
      {editable && <UnfilledNavigator marks={marks} />}
      {actions}
    </div>
  );
}
