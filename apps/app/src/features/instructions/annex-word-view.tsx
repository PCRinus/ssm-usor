import '@docx-editor.dev/core/styles/editor.css';

import { packagedFonts } from '@docx-editor.dev/fonts';
import { DocxEditor } from '@docx-editor.dev/react';

import { replayMask } from '@/app/observability/replay-masking';
import { editorStrings } from '@/features/documents/editor-strings.ro';

const fonts = packagedFonts({ allow: ['Arial'] });

// The default fit stops at half size, which still overflows a phone's width.
const zoomMode = { type: 'fit', fit: 'pageWidth', minZoom: 0.3, maxZoom: 1 } as const;

export default function AnnexWordView({
  bytes,
  onReady,
}: {
  bytes: Uint8Array;
  onReady: () => void;
}) {
  return (
    <div
      className="flex h-full min-h-0 flex-col"
      data-testid="instruction-preview-word"
      {...replayMask}
    >
      <DocxEditor
        document={bytes}
        mode="view"
        className="min-h-0 flex-1"
        chrome={false}
        menu={false}
        rulers={false}
        navigation={false}
        locale="ro-RO"
        i18n={editorStrings}
        fonts={fonts}
        zoomMode={zoomMode}
        onReady={onReady}
      />
    </div>
  );
}
