const byName = new Intl.Collator('ro', { numeric: true });

// Folder by folder: compared whole, the slash would sort "Fișe/…" after "Fișe 2/…".
export function comparePaths(a: string, b: string) {
  const left = a.split('/');
  const right = b.split('/');
  for (let at = 0; at < Math.min(left.length, right.length); at += 1) {
    const order = byName.compare(left[at]!, right[at]!);
    if (order !== 0) return order;
  }
  return left.length - right.length;
}

export const inPathOrder = <File extends { uploadPath: string }>(files: readonly File[]) =>
  [...files].sort((a, b) => comparePaths(a.uploadPath, b.uploadPath));
