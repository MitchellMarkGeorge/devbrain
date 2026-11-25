// The HTML entities markdown text is read and written with: `marked` leaves `&amp;` and the rest in
// a text token's text, and text is written with `&`, `<` and `>` as entities (which
// `relaxEntities` then takes back where they can't be read as markup).

const NAMED_ENTITIES: Record<string, string> = { lt: '<', gt: '>', quot: '"', amp: '&' };

// numeric references in 128–159 name Windows-1252's characters, as browsers read them
const WINDOWS_1252 = new Map([
  [128, 8364],
  [130, 8218],
  [131, 402],
  [132, 8222],
  [133, 8230],
  [134, 8224],
  [135, 8225],
  [136, 710],
  [137, 8240],
  [138, 352],
  [139, 8249],
  [140, 338],
  [142, 381],
  [145, 8216],
  [146, 8217],
  [147, 8220],
  [148, 8221],
  [149, 8226],
  [150, 8211],
  [151, 8212],
  [152, 732],
  [153, 8482],
  [154, 353],
  [155, 8250],
  [156, 339],
  [158, 382],
  [159, 376],
]);

function decodeCodePoint(codePoint: number): string {
  if (codePoint === 0 || codePoint > 0x10ffff || (codePoint >= 0xd800 && codePoint <= 0xdfff)) {
    return '\uFFFD';
  }
  return String.fromCodePoint(WINDOWS_1252.get(codePoint) ?? codePoint);
}

/** `&lt;`, `&gt;`, `&quot;`, `&amp;` and numeric references, in one pass (`&#38;lt;` is `&lt;`). */
export function decodeEntities(text: string): string {
  return text.replace(
    /&(?:#(\d{1,7})|#[xX]([0-9a-fA-F]{1,6})|(lt|gt|quot|amp));/g,
    (_match, dec?: string, hex?: string, name?: string) => {
      if (dec !== undefined) return decodeCodePoint(Number(dec));
      if (hex !== undefined) return decodeCodePoint(parseInt(hex, 16));
      return NAMED_ENTITIES[name!];
    },
  );
}

export function encodeEntities(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
