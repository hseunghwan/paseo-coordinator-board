export type Tone = "danger" | "warning" | "success" | "muted";

type StatusColors = { statusDanger: string; statusWarning: string; statusSuccess: string; foregroundMuted: string };

export function toneColor(colors: StatusColors, tone: Tone) {
  if (tone === "danger") return colors.statusDanger;
  if (tone === "warning") return colors.statusWarning;
  if (tone === "success") return colors.statusSuccess;
  return colors.foregroundMuted;
}

// Paseo derives badge fills from the status color itself, so a tint never drifts from its text.
export function tint(color: string, alpha = 0.16): string | null {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(color.trim());
  if (!match) return null;
  const digits = match[1].length === 3 ? [...match[1]].map(digit => digit + digit).join("") : match[1].slice(0, 6);
  const value = parseInt(digits, 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${alpha})`;
}
