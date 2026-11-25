import type { DecisionEntry } from "./board-layout";
import { priorityLabel } from "./decision-priority";
import type { CompletedAction } from "./decision-receipts";
import { decisionGroupLabel, decisionGroups, type DecisionGroup } from "./decision-row";
import type { Translate } from "./language";
import type { Tone } from "./tone";

export type InboxSectionId = DecisionGroup | "handled";
export type InboxSection = { id: InboxSectionId; entries: readonly DecisionEntry[] };
export type InboxTab = "decisions" | "progress" | "history";

// Below this width the list and the detail cannot sit side by side, so the detail takes the whole screen.
export const inboxNarrowWidth = 600;

export function isNarrowInbox(compact: boolean, width: number | null) {
  return compact || (width !== null && width < inboxNarrowWidth);
}

// Urgency groups in their fixed order, then the places finished decisions held. Empty groups are dropped.
export function inboxSections(entries: readonly DecisionEntry[]): InboxSection[] {
  const byGroup = new Map<InboxSectionId, DecisionEntry[]>();
  for (const entry of entries) {
    const id: InboxSectionId = entry.row && entry.summary ? entry.summary.group : "handled";
    byGroup.set(id, [...(byGroup.get(id) ?? []), entry]);
  }
  return [...decisionGroups, "handled" as const].flatMap(id => {
    const grouped = byGroup.get(id);
    return grouped ? [{ id, entries: grouped }] : [];
  });
}

export function inboxOrder(sections: readonly InboxSection[]) {
  return sections.flatMap(section => section.entries.map(entry => entry.key));
}

export function activeDecisionCount(entries: readonly DecisionEntry[]) {
  return entries.filter(entry => entry.row !== null).length;
}

export function inboxSectionLabel(id: InboxSectionId, t: Translate) {
  return id === "handled" ? t("처리함", "Handled") : decisionGroupLabel(id, t);
}

// Keeps the chosen row while it is listed. A row that left the list hands the selection to the row that
// followed it, or the one before it at the end, so the person keeps reading from the same place.
export function keepSelection(previous: readonly string[], order: readonly string[], chosen: string | null): string | null {
  if (chosen !== null && order.includes(chosen)) return chosen;
  const listed = new Set(order);
  const index = chosen === null ? -1 : previous.indexOf(chosen);
  if (index >= 0) {
    const next = previous.slice(index + 1).find(key => listed.has(key));
    if (next !== undefined) return next;
    const before = previous.slice(0, index).reverse().find(key => listed.has(key));
    if (before !== undefined) return before;
  }
  return order[0] ?? null;
}

export function stepSelection(order: readonly string[], selected: string | null, delta: -1 | 1): string | null {
  if (!order.length) return null;
  const index = selected === null ? -1 : order.indexOf(selected);
  if (index < 0) return order[0];
  return order[Math.min(order.length - 1, Math.max(0, index + delta))];
}

export type KeyLike = { key: string; altKey: boolean; ctrlKey: boolean; metaKey: boolean; defaultPrevented?: boolean; isComposing?: boolean };
export type KeyTarget = { tagName?: string; isContentEditable?: boolean; getAttribute?: (name: string) => string | null } | null;

// J and K move through the list only when nothing is being typed; a reply draft must never lose a letter.
export function inboxKeyStep(event: KeyLike, target: KeyTarget): -1 | 0 | 1 {
  if (event.defaultPrevented || event.isComposing || event.altKey || event.ctrlKey || event.metaKey) return 0;
  const key = event.key.toLowerCase();
  if (key !== "j" && key !== "k") return 0;
  if (target) {
    const tag = (target.tagName ?? "").toUpperCase();
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable) return 0;
    if (target.getAttribute?.("role") === "textbox") return 0;
  }
  return key === "j" ? 1 : -1;
}

export function waitAge(minutes: number, t: Translate) {
  if (minutes < 1) return t("1분 미만", "<1m");
  if (minutes < 60) return t(`${minutes}분`, `${minutes}m`);
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t(`${hours}시간`, `${hours}h`);
  return t(`${Math.floor(hours / 24)}일`, `${Math.floor(hours / 24)}d`);
}

export function handledLabel(status: CompletedAction["status"], t: Translate) {
  if (status === "sent") return t("답장 보냄", "Reply sent");
  if (status === "saved") return t("보드에 저장함", "Saved to board");
  if (status === "reviewed") return t("확인함", "Reviewed");
  if (status === "merged") return t("병합함", "Merged");
  if (status === "already-merged") return t("이미 병합됨", "Already merged");
  return t("이미 닫힘", "Already closed");
}

export type InboxRow = { title: string; tone: Tone; aside: string | null; meta: string; permission: boolean; handled: boolean };

function projectNames(ids: readonly (string | null)[], name: (id: string | null) => string) {
  return [...new Set(ids.map(id => name(id)))].filter(Boolean).join(", ");
}

// One list line: the question, how long it has waited (or the PR number), and where it came from.
// A permission request is approved in its session; the board never sends to a session that waits for one.
export function inboxRow(entry: DecisionEntry, name: (id: string | null) => string, t: Translate, now = Date.now()): InboxRow {
  const { row, summary } = entry;
  if (!row || !summary) {
    const receipt = entry.receipts[entry.receipts.length - 1];
    return {
      title: receipt?.title || t("처리한 결정", "Handled decision"), tone: "success", aside: null, permission: false, handled: true,
      meta: [receipt ? projectNames(receipt.projectIds, name) : "", receipt ? handledLabel(receipt.status, t) : t("처리함", "Handled")].filter(Boolean).join(" · "),
    };
  }
  const aside = row.kind === "pull" ? `#${row.pr.number}`
    : row.waitingSince === null ? null : waitAge(Math.max(0, Math.floor((now - row.waitingSince) / 60_000)), t);
  const reason = summary.permission ? t("세션에서 승인", "Approve in session") : priorityLabel({ ...row, waitingSince: null }, t, now);
  return { title: summary.title, tone: summary.tone, aside, permission: summary.permission, handled: false,
    meta: [projectNames(summary.projectIds, name), reason].filter(Boolean).join(" · ") };
}

export function inboxRowAccessibilityLabel(row: InboxRow) {
  return [row.title, row.aside, row.meta].filter(Boolean).join(", ");
}
