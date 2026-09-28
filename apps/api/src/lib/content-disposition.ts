// An ASCII name for the plain `filename`, and the real one in `filename*` (RFC 6266 / RFC
// 8187), which every current browser prefers. Storage's own header percent-encodes the plain
// one, and browsers save "Copertă" as "Copert%C4%83".
export function contentDisposition(kind: 'attachment' | 'inline', name: string) {
  const ascii = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7e]|["\\]/g, '_');
  const encoded = encodeURIComponent(name).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  );
  return `${kind}; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
