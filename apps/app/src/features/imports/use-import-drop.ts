import { type DragEvent, useRef, useState } from 'react';

import { hasFiles } from '@/features/client-files/use-file-drop';

import { pickedFromDrop } from './picked-files';
import type { PickedFile } from './upload-selection';

export function useImportDrop(onDrop: (picked: Promise<PickedFile[]>) => void) {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  const handlers = {
    onDragEnter: (event: DragEvent<HTMLElement>) => {
      if (!hasFiles(event)) return;
      depth.current += 1;
      setDragging(true);
    },
    onDragLeave: (event: DragEvent<HTMLElement>) => {
      if (!hasFiles(event)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    },
    onDragOver: (event: DragEvent<HTMLElement>) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
    },
    onDrop: (event: DragEvent<HTMLElement>) => {
      if (!hasFiles(event)) return;
      event.preventDefault();
      depth.current = 0;
      setDragging(false);
      onDrop(pickedFromDrop(event.dataTransfer));
    },
  };
  return { dragging, handlers };
}
