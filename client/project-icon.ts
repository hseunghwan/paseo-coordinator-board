export function projectInitial(name: string): string {
  return Array.from(name.trim())[0]?.toUpperCase() || "?";
}

export function projectColorIndex(name: string, paletteSize: number): number {
  let hash = 0;
  for (const letter of name.trim().toLowerCase()) {
    hash = (Math.imul(hash, 31) + (letter.codePointAt(0) ?? 0)) >>> 0;
  }
  return hash % paletteSize;
}
