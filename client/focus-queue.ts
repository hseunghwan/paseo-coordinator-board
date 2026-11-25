// The focus view shows one decision at a time. These rules decide which one, so a refresh never yanks the
// person away from the card they are reading and a finished card hands over to its neighbor.

export type FocusEntry = { key: string; row: unknown | null; receipts: readonly unknown[] };

export const isActive = (entry: FocusEntry) => entry.row !== null;
// A finished decision keeps its place only while its receipt is still shown.
export const isProcessed = (entry: FocusEntry) => entry.row === null && entry.receipts.length > 0;

// Every visible place in ranked order, with deferred decisions moved to the end in the order they were deferred.
export function focusRail<T extends FocusEntry>(entries: readonly T[], deferred: readonly string[]): T[] {
  const shown = entries.filter(entry => isActive(entry) || isProcessed(entry));
  const later = new Set(deferred.filter(key => shown.some(entry => entry.key === key && isActive(entry))));
  const byKey = new Map(shown.map(entry => [entry.key, entry]));
  return [...shown.filter(entry => !later.has(entry.key)), ...[...later].map(key => byKey.get(key)!)];
}

// The keys a person can step through: the active places of the rail.
export function focusQueue(entries: readonly FocusEntry[], deferred: readonly string[]): string[] {
  return focusRail(entries, deferred).filter(isActive).map(entry => entry.key);
}

// Keep the chosen decision while it is active. When it is finished or gone, take whatever now sits where it was:
// the next active decision, or the previous one when it was last.
export function resolveFocus(chosen: string | null, previousQueue: readonly string[], queue: readonly string[]): string | null {
  if (chosen !== null && queue.includes(chosen)) return chosen;
  if (!queue.length) return null;
  const index = chosen === null ? -1 : previousQueue.indexOf(chosen);
  if (index < 0) return queue[0];
  const anchor = previousQueue.slice(0, index).reverse().find(key => queue.includes(key));
  const position = anchor === undefined ? 0 : queue.indexOf(anchor) + 1;
  return queue[position] ?? queue[position - 1] ?? null;
}

export function stepFocus(queue: readonly string[], current: string | null, direction: 1 | -1): string | null {
  if (current === null) return queue[0] ?? null;
  const index = queue.indexOf(current);
  if (index < 0) return queue[0] ?? null;
  return queue[index + direction] ?? current;
}

// "Later" sends the current decision to the back for this visit only and shows the one that followed it.
export function deferFocus(entries: readonly FocusEntry[], deferred: readonly string[], current: string | null) {
  if (current === null) return { deferred: [...deferred], current };
  const before = focusQueue(entries, deferred);
  const next = [...deferred.filter(key => key !== current), current];
  const after = focusQueue(entries, next);
  const index = before.indexOf(current);
  return { deferred: next, current: index < 0 ? after[0] ?? null : after[index] ?? current };
}

export type RailCell = "done" | "current" | "waiting" | "idle";

export function railCell(entry: FocusEntry & { summary: { tone: string } | null }, current: string | null): RailCell {
  if (isProcessed(entry)) return "done";
  if (entry.key === current) return "current";
  return entry.summary?.tone === "warning" || entry.summary?.tone === "danger" ? "waiting" : "idle";
}

export function focusProgress(rail: readonly FocusEntry[], current: string | null) {
  const index = current === null ? -1 : rail.findIndex(entry => entry.key === current);
  return { position: index < 0 ? null : index + 1, total: rail.length, processed: rail.filter(isProcessed).length };
}

// The board already says so when nothing is pending at all or nothing matches the filter; this covers the rest,
// where every place left on screen is a receipt.
export function focusNeedsEmptyNotice({ queue, total, filtered, filteredTotal, incomplete }: {
  queue: readonly string[]; total: number; filtered: boolean; filteredTotal: number; incomplete: boolean;
}) {
  if (queue.length || incomplete || total === 0) return false;
  return !(filtered && filteredTotal === 0);
}

export type FocusKeyAction = "next" | "previous" | "defer";
export type FocusKeyEvent = {
  key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; defaultPrevented?: boolean;
  target?: { tagName?: string; isContentEditable?: boolean } | null;
};

// J, K and S move through the queue on the web, but never while the person is typing a reply.
export function focusKeyAction(event: FocusKeyEvent): FocusKeyAction | null {
  if (event.ctrlKey || event.metaKey || event.altKey || event.defaultPrevented) return null;
  const tag = event.target?.tagName?.toUpperCase();
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || event.target?.isContentEditable) return null;
  const key = event.key.toLowerCase();
  return key === "j" ? "next" : key === "k" ? "previous" : key === "s" ? "defer" : null;
}
