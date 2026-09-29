import { useEffect, useRef, useState } from 'react';

// The edit button leaves the page while its form is open; closing the form puts focus back on
// it, so a keyboard user does not start again from the top of the page.
export function useInPlaceEdit() {
  const [editing, setEditing] = useState(false);
  const editRef = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);

  useEffect(() => {
    if (editing || !returnFocus.current) return;
    returnFocus.current = false;
    editRef.current?.focus();
  }, [editing]);

  return {
    editing,
    editRef,
    open: () => setEditing(true),
    close: () => {
      returnFocus.current = true;
      setEditing(false);
    },
  };
}
