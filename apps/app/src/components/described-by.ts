// The ids `Field` gives its error and hint.
export const describedBy = (id: string, error: unknown, hint = false) =>
  error ? `${id}-error` : hint ? `${id}-hint` : undefined;
