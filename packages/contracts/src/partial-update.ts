export const somethingSent = (value: object) => Object.keys(value).length > 0;

// The database checks some fields against each other; sending them as a pair keeps that check on
// the body, never between the body and the saved row.
export const sentTogether =
  <Key extends string>(first: Key, second: Key) =>
  (value: Partial<Record<Key, unknown>>) =>
    (value[first] === undefined) === (value[second] === undefined);
