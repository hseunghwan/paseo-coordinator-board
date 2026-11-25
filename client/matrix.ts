import type { PullRequestItem } from "../shared/prs";
import type { TrackedDecision } from "../shared/tracked-decisions";
import type { DecisionEntry } from "./board-layout";
import { plainDecisionTitle } from "./decision-summary";
import type { Translate } from "./language";
import type { Card, Lane } from "./model";
import type { RemoteGroup } from "./remote-running";
import type { Tone } from "./tone";

// One thing a project shows in a lane. The kanban and the matrix share this sorting so a session never
// lands in different columns depending on the view.
export type LaneItem =
  | { kind: "record"; key: string; lane: Lane; item: TrackedDecision }
  | { kind: "session"; key: string; lane: Lane; card: Card }
  | { kind: "pull"; key: string; lane: Lane; pr: PullRequestItem };

export type ProjectSources = { records: readonly TrackedDecision[]; cards: readonly Card[]; pulls: readonly PullRequestItem[] };

const reviewPullReasons: readonly string[] = ["conflict", "checks-failed", "changes-requested", "blocked", "unknown"];

// Records first, then session cards, then pull requests: the order the kanban has always listed them in.
export function classifyProject({ records, cards, pulls }: ProjectSources): LaneItem[] {
  const items: LaneItem[] = [];
  for (const item of records) {
    const since = Date.parse(item.since ?? "");
    const answered = item.replyHistory.some(reply => Date.parse(reply.at ?? "") >= since);
    items.push({ kind: "record", key: "decision:" + item.key, lane: answered && !item.matchedSessionId ? "review" : "human", item });
  }
  for (const card of cards) {
    if (card.lane === "human" && records.some(item => item.matchedSessionId === card.session.id)) continue;
    items.push({ kind: "session", key: "session:" + card.session.id, lane: card.lane, card });
  }
  for (const pr of pulls) {
    if (records.some(item => item.matchedPull?.repo === pr.repo && item.matchedPull.number === pr.number)) continue;
    const lane: Lane = pr.lane === "review" ? "human" : reviewPullReasons.includes(pr.reason) ? "review" : "running";
    items.push({ kind: "pull", key: pr.url, lane, pr });
  }
  return items;
}

export type MatrixColumn = "human" | "running" | "review" | "idle" | "done";
// The kanban's lane order. A session whose result was seen is waiting for its next request, not working,
// so it gets its own column instead of reading as live work.
export const matrixColumns: readonly MatrixColumn[] = ["human", "running", "review", "idle", "done"];

export function matrixColumn(lane: Lane): MatrixColumn {
  return lane === "unknown" ? "idle" : lane;
}

export function matrixColumnLabel(column: MatrixColumn, t: Translate) {
  if (column === "human") return t("내 결정", "My decisions");
  if (column === "running") return t("진행 중", "In progress");
  if (column === "review") return t("확인 대기", "Awaiting review");
  if (column === "idle") return t("대기 중", "Idle");
  return t("완료", "Done");
}

function matrixColumnShort(column: MatrixColumn, t: Translate) {
  if (column === "human") return t("결정", "Decide");
  if (column === "running") return t("진행", "Running");
  if (column === "review") return t("확인", "Review");
  if (column === "idle") return t("대기", "Idle");
  return t("완료", "Done");
}

export type MatrixCells = Record<MatrixColumn, LaneItem[]>;

export function matrixCells(items: readonly LaneItem[]): MatrixCells {
  const cells: MatrixCells = { human: [], running: [], review: [], idle: [], done: [] };
  for (const item of items) cells[matrixColumn(item.lane)].push(item);
  return cells;
}

export type MatrixMark = Tone | "idle" | "running";

// warning waits on me, success can merge or is done, danger is a failed pull, running stays neutral.
export function matrixMark(item: LaneItem): MatrixMark {
  const column = matrixColumn(item.lane);
  if (column === "human") return item.kind === "pull" ? "success" : "warning";
  if (column === "running") return "running";
  if (column === "idle") return "idle";
  if (column === "review") return item.kind === "pull" && item.pr.reason !== "unknown" ? "danger" : "warning";
  return "success";
}

export function matrixTitle(item: LaneItem): string {
  if (item.kind === "record") return plainDecisionTitle(item.item.title);
  if (item.kind === "pull") return `#${item.pr.number} ${item.pr.title}`;
  return item.card.session.title;
}

// The board never writes to a session that waits on a permission, so such a row only points to the session.
export function matrixPermission(item: LaneItem): boolean {
  if (item.kind !== "session" || item.lane !== "human") return false;
  return !!item.card.session.nativePending || item.card.session.decision?.source === "permission";
}

export function cellPreview<T>(items: readonly T[], limit = 3): { shown: readonly T[]; more: number } {
  return { shown: items.slice(0, limit), more: Math.max(0, items.length - limit) };
}

export type HostCount = { label: string; count: number };

// Local sessions count under this host; remote ones under the peer that reported them.
export function projectHosts(projectId: string | null, cards: readonly Card[], peers: readonly RemoteGroup[], hostLabel: string): HostCount[] {
  const hosts: HostCount[] = [];
  if (cards.length) hosts.push({ label: hostLabel, count: cards.length });
  if (projectId === null) return hosts;
  for (const group of peers) {
    if (group.failed) continue;
    const count = group.rows.filter(row => row.projectId === projectId).length;
    if (count) hosts.push({ label: group.host.label, count });
  }
  return hosts;
}

export function hostSummary(hosts: readonly HostCount[]) {
  return hosts.map(host => `${host.label} ${host.count}`).join(" · ");
}

export type MatrixRow = { key: string; id: string | null; title: string; cells: MatrixCells; hosts: HostCount[] };

export type MatrixSources = {
  list: readonly { id: string; title: string; cards: Card[] }[];
  hostWide: boolean;
  records: readonly TrackedDecision[];
  pulls: readonly PullRequestItem[];
  peers: readonly RemoteGroup[];
  hostLabel: string;
};

export const hostWideRowKey = "\u0000host-wide";

// One row per listed project, then the host-wide row last. Host-wide carries only its records, as in the kanban.
export function matrixRows(sources: MatrixSources, hostWideTitle: string): MatrixRow[] {
  const rows: MatrixRow[] = sources.list.map(project => ({
    key: project.id, id: project.id, title: project.title,
    cells: matrixCells(classifyProject({
      records: sources.records.filter(item => item.projectId === project.id),
      cards: project.cards,
      pulls: sources.pulls.filter(pr => pr.projectIds.includes(project.id)),
    })),
    hosts: projectHosts(project.id, project.cards, sources.peers, sources.hostLabel),
  }));
  if (sources.hostWide) rows.push({
    key: hostWideRowKey, id: null, title: hostWideTitle,
    cells: matrixCells(classifyProject({ records: sources.records.filter(item => item.projectId === null), cards: [], pulls: [] })),
    hosts: [],
  });
  return rows;
}

// "결정 2 · 진행 3 · 확인 1" for the collapsed narrow row. Empty columns stay out of the summary.
export function matrixSummary(cells: MatrixCells, t: Translate) {
  const parts = matrixColumns.filter(column => cells[column].length).map(column => `${matrixColumnShort(column, t)} ${cells[column].length}`);
  return parts.length ? parts.join(" · ") : t("항목 없음", "Nothing here");
}

export type CellRef = { row: string; column: MatrixColumn };

// Pressing the open cell closes it; any other cell replaces it.
export function toggleCell(current: CellRef | null, next: CellRef): CellRef | null {
  return current && current.row === next.row && current.column === next.column ? null : next;
}

export function isSelectedCell(current: CellRef | null, row: string, column: MatrixColumn) {
  return !!current && current.row === row && current.column === column;
}

// Cells whose cards stay mounted after their first opening, so a reply draft survives closing the cell.
// A cell drops out once its row is gone or it has nothing left to show.
export function liveCells(mounted: readonly CellRef[], rows: readonly Pick<MatrixRow, "key" | "cells">[]): CellRef[] {
  return mounted.filter(ref => rows.some(row => row.key === ref.row && row.cells[ref.column].length > 0));
}

export function rememberCell(mounted: readonly CellRef[], next: CellRef, rows: readonly Pick<MatrixRow, "key" | "cells">[]): CellRef[] {
  const live = liveCells(mounted, rows);
  return live.some(ref => ref.row === next.row && ref.column === next.column) ? live : [...live, next];
}

export function mountedColumns(mounted: readonly CellRef[], row: string): MatrixColumn[] {
  return matrixColumns.filter(column => mounted.some(ref => ref.row === row && ref.column === column));
}

export const narrowWidth = 600;

// Until the first layout pass reports a width, trust the host's compact flag.
export function isNarrow(compact: boolean, width: number) {
  return compact || (width > 0 && width < narrowWidth);
}

// Finished decisions leave the ribbon; their receipts still show under it.
export function ribbonEntries(entries: readonly DecisionEntry[]) {
  return entries.filter(entry => entry.row !== null && entry.summary !== null);
}

// Every card stays mounted so a reply draft survives a change of selection; this only decides what is shown.
export function entryDisplay(entry: DecisionEntry, selected: string | null) {
  const chosen = entry.key === selected;
  return { card: chosen && entry.card !== null, receipts: (chosen || entry.row === null) && entry.receipts.length > 0 };
}

export type OrphanGroup = { host: RemoteGroup["host"]; rows: RemoteGroup["rows"]; failed: boolean };

// Remote work in projects this host lists nowhere in the table, plus hosts that failed to answer.
export function orphanRemote(peers: readonly RemoteGroup[], listed: readonly (string | null)[]): OrphanGroup[] {
  const ids = new Set(listed);
  return peers.flatMap((group): OrphanGroup[] => {
    if (group.failed) return [{ host: group.host, rows: [], failed: true }];
    const rows = group.rows.filter(row => !ids.has(row.projectId));
    return rows.length ? [{ host: group.host, rows, failed: false }] : [];
  });
}
