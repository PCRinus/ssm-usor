import { createContext, use, useLayoutEffect } from 'react';

type CountEditorViews = (change: 1 | -1) => void;

export const EditorLayoutContext = createContext<CountEditorViews | null>(null);

// For a view whose route cannot say so in `staticData.editorPage`: an instruction's route shows
// the form, or the document for an annexed version or an archived instruction.
export function useEditorLayout() {
  const count = use(EditorLayoutContext);
  useLayoutEffect(() => {
    if (!count) return;
    count(1);
    return () => count(-1);
  }, [count]);
}
