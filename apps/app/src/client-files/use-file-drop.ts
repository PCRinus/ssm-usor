import { type DragEvent, useRef, useState } from 'react';

export const hasFiles = (event: { dataTransfer: DataTransfer | null }) =>
  Boolean(event.dataTransfer?.types.includes('Files'));

export function useFileDrop(onDrop: (files: File[]) => void) {
  const [dragging, setDragging] = useState(false);
  // Entering a child fires dragleave on the parent, so only the last leave ends the drag.
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
      onDrop(Array.from(event.dataTransfer.files));
    },
  };

  return { dragging, handlers };
}
