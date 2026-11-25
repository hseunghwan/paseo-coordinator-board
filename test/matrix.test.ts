import { expect, test } from "bun:test";
import type { DecisionEntry } from "../client/board-layout";
import type { InlineReceipt } from "../client/decision-receipts";
import type { RankedDecision } from "../client/decision-priority";
import {
  cellPreview, classifyProject, entryDisplay, hostSummary, hostWideRowKey, isNarrow, isSelectedCell, liveCells, matrixCells, matrixColumn,
  matrixColumnLabel, matrixColumns, matrixMark, matrixPermission, matrixRows, matrixSummary, matrixTitle, orphanRemote,
  mountedColumns, projectHosts, rememberCell, ribbonEntries, toggleCell, type CellRef, type LaneItem,
} from "../client/matrix";
import type { Card, Lane } from "../client/model";
import type { RemoteGroup } from "../client/remote-running";
import type { PullRequestItem } from "../shared/prs";
import { trackedDecisionSchema, type TrackedDecision } from "../shared/tracked-decisions";

const korean = (ko: string, _en: string) => ko;
const english = (_ko: string, en: string) => en;
const since = "2026-11-18T10:00:00.000Z";
const after = "2026-11-18T11:00:00.000Z";
const earlier = "2026-11-18T09:00:00.000Z";

function record(id: string, fields: Partial<TrackedDecision> = {}): TrackedDecision {
  return trackedDecisionSchema.parse({ id, key: id, fingerprint: "0".repeat(64), source: "board", projectId: "a", title: id,
    matchedSessionId: null, matchedPull: null, since, ...fields });
}
function card(id: string, lane: Lane, fields: Partial<Card["session"]> = {}): Card {
  return { lane, note: undefined, session: { id, title: id, model: null, projectId: "a", projectTitle: "A",
    workspaceTitle: "Branch", lane: lane === "done" ? "idle" : lane, detail: "", ...fields } };
}
function pull(number: number, fields: Partial<PullRequestItem> = {}): PullRequestItem {
  return { repo: "o/r", number, title: `PR ${number}`, url: `https://github.com/o/r/pull/${number}`, projectIds: ["a"],
    lane: "progress", reason: "checks-pending", updatedAt: after, ...fields };
}
function group(label: string, rows: { projectId: string; sessionId: string }[], failed = false): RemoteGroup {
  return { host: { serverId: "srv-" + label, label, status: "online" }, rows: rows.map(row => ({ ...row, title: row.sessionId })), failed };
}
const lanes = (items: readonly LaneItem[]) => items.map(item => [item.key, item.lane]);

test("sorts records, sessions and pull requests into the kanban's lanes in its order", () => {
  const items = classifyProject({
    records: [
      record("unanswered"),
      record("answered", { replyHistory: [{ text: "ok", at: after }] }),
      record("answered-before", { replyHistory: [{ text: "old", at: earlier }] }),
      record("answered-matched", { replyHistory: [{ text: "ok", at: after }], matchedSessionId: "s-matched" }),
      record("merge", { matchedPull: { repo: "o/r", number: 9 } }),
    ],
    cards: [card("s-matched", "human"), card("s-run", "running"), card("s-ask", "human"), card("s-idle", "idle"), card("s-done", "done")],
    pulls: [
      pull(1, { lane: "review", reason: "ready" }),
      pull(2, { reason: "checks-failed" }),
      pull(3, { reason: "conflict" }),
      pull(4, { reason: "unknown" }),
      pull(5, { reason: "draft" }),
      pull(9, { lane: "review", reason: "ready" }),
    ],
  });
  expect(lanes(items)).toEqual([
    ["decision:unanswered", "human"],
    ["decision:answered", "review"],
    ["decision:answered-before", "human"],
    ["decision:answered-matched", "human"],
    ["decision:merge", "human"],
    ["session:s-run", "running"],
    ["session:s-ask", "human"],
    ["session:s-idle", "idle"],
    ["session:s-done", "done"],
    ["https://github.com/o/r/pull/1", "human"],
    ["https://github.com/o/r/pull/2", "review"],
    ["https://github.com/o/r/pull/3", "review"],
    ["https://github.com/o/r/pull/4", "review"],
    ["https://github.com/o/r/pull/5", "running"],
  ]);
});

test("keeps a matched session that no longer waits on me", () => {
  const items = classifyProject({ records: [record("r", { matchedSessionId: "s" })], cards: [card("s", "running")], pulls: [] });
  expect(lanes(items)).toEqual([["decision:r", "human"], ["session:s", "running"]]);
});

test("places every lane in a fixed column, with idle and unknown after live work", () => {
  expect(matrixColumns).toEqual(["human", "running", "review", "done"]);
  expect(matrixColumn("idle")).toBe("running");
  expect(matrixColumn("unknown")).toBe("running");
  const cells = matrixCells(classifyProject({
    records: [], pulls: [],
    cards: [card("idle", "idle"), card("run", "running"), card("lost", "unknown"), card("ask", "human"), card("check", "review"), card("ok", "done")],
  }));
  expect(cells.running.map(item => item.key)).toEqual(["session:run", "session:idle", "session:lost"]);
  expect(cells.human.map(item => item.key)).toEqual(["session:ask"]);
  expect(cells.review.map(item => item.key)).toEqual(["session:check"]);
  expect(cells.done.map(item => item.key)).toEqual(["session:ok"]);
});

test("marks waiting, mergeable, failed, running and idle items with distinct states", () => {
  const items = classifyProject({
    records: [record("ask")],
    cards: [card("run", "running"), card("idle", "idle"), card("check", "review"), card("ok", "done")],
    pulls: [pull(1, { lane: "review", reason: "ready" }), pull(2, { reason: "checks-failed" }), pull(3, { reason: "unknown" })],
  });
  const marks = Object.fromEntries(items.map(item => [item.key, matrixMark(item)]));
  expect(marks).toEqual({
    "decision:ask": "warning", "session:run": "running", "session:idle": "idle", "session:check": "warning", "session:ok": "success",
    "https://github.com/o/r/pull/1": "success", "https://github.com/o/r/pull/2": "danger", "https://github.com/o/r/pull/3": "warning",
  });
});

test("titles items as plain text and flags sessions that only accept approval in Paseo", () => {
  const [decision, waiting, permission, native, pr] = classifyProject({
    records: [record("**Ship** it?")],
    cards: [card("ask", "human"), card("perm", "human", { decision: { source: "permission", question: "Run?", version: "v1" } }), card("native", "human", { nativePending: true })],
    pulls: [pull(7)],
  });
  expect(matrixTitle(decision)).toBe("Ship it?");
  expect(matrixTitle(pr)).toBe("#7 PR 7");
  expect(matrixTitle(waiting)).toBe("ask");
  expect([decision, waiting, permission, native, pr].map(matrixPermission)).toEqual([false, false, true, true, false]);
});

test("previews three items and counts the rest", () => {
  expect(cellPreview([1, 2, 3, 4, 5])).toEqual({ shown: [1, 2, 3], more: 2 });
  expect(cellPreview([1, 2])).toEqual({ shown: [1, 2], more: 0 });
  expect(cellPreview([1, 2, 3, 4], Infinity)).toEqual({ shown: [1, 2, 3, 4], more: 0 });
});

test("counts sessions per host, local first and failed peers left out", () => {
  const peers = [group("laptop", [{ projectId: "a", sessionId: "1" }, { projectId: "b", sessionId: "2" }, { projectId: "a", sessionId: "3" }]),
    group("down", [], true), group("idle", [{ projectId: "b", sessionId: "4" }])];
  const hosts = projectHosts("a", [card("x", "running"), card("y", "done")], peers, "studio");
  expect(hosts).toEqual([{ label: "studio", count: 2 }, { label: "laptop", count: 2 }]);
  expect(hostSummary(hosts)).toBe("studio 2 · laptop 2");
  expect(projectHosts("c", [], peers, "studio")).toEqual([]);
  expect(projectHosts(null, [], peers, "studio")).toEqual([]);
});

test("builds one row per project and a host-wide row last with only its records", () => {
  const rows = matrixRows({
    list: [{ id: "a", title: "A", cards: [card("s", "running")] }, { id: "b", title: "B", cards: [] }],
    hostWide: true,
    records: [record("in-a"), record("in-b", { projectId: "b" }), record("shared", { projectId: null })],
    pulls: [pull(1, { projectIds: ["a", "b"] }), pull(2, { projectIds: ["b"] })],
    peers: [group("laptop", [{ projectId: "b", sessionId: "r" }])],
    hostLabel: "studio",
  }, "공통");
  expect(rows.map(row => [row.key, row.id, row.title])).toEqual([["a", "a", "A"], ["b", "b", "B"], [hostWideRowKey, null, "공통"]]);
  expect(rows[0].cells.human.map(item => item.key)).toEqual(["decision:in-a"]);
  expect(rows[0].cells.running.map(item => item.key)).toEqual(["session:s", "https://github.com/o/r/pull/1"]);
  expect(rows[1].cells.running.map(item => item.key)).toEqual(["https://github.com/o/r/pull/1", "https://github.com/o/r/pull/2"]);
  expect(rows[1].hosts).toEqual([{ label: "laptop", count: 1 }]);
  expect(rows[2].cells.human.map(item => item.key)).toEqual(["decision:shared"]);
  expect(rows[2].hosts).toEqual([]);
  expect(matrixRows({ list: [], hostWide: false, records: [record("shared", { projectId: null })], pulls: [], peers: [], hostLabel: "h" }, "x")).toEqual([]);
});

test("summarizes a collapsed row by its non-empty columns in both languages", () => {
  const cells = matrixCells(classifyProject({ records: [record("r1"), record("r2")], cards: [card("a", "running"), card("b", "idle"), card("c", "running")], pulls: [pull(1, { reason: "conflict" })] }));
  expect(matrixSummary(cells, korean)).toBe("결정 2 · 진행 3 · 확인 1");
  expect(matrixSummary(cells, english)).toBe("Decide 2 · Running 3 · Review 1");
  expect(matrixSummary(matrixCells([]), korean)).toBe("항목 없음");
  for (const column of matrixColumns) expect(matrixColumnLabel(column, korean)).not.toBe(matrixColumnLabel(column, english));
});

test("opens one cell at a time and closes it on a second press", () => {
  const first = toggleCell(null, { row: "a", column: "human" });
  expect(first).toEqual({ row: "a", column: "human" });
  expect(toggleCell(first, { row: "a", column: "human" })).toBeNull();
  expect(toggleCell(first, { row: "a", column: "done" })).toEqual({ row: "a", column: "done" });
  expect(isSelectedCell(first, "a", "human")).toBe(true);
  expect(isSelectedCell(first, "b", "human")).toBe(false);
  expect(isSelectedCell(null, "a", "human")).toBe(false);
});

test("switches to the narrow layout below 600 points or when the host says compact", () => {
  expect(isNarrow(false, 0)).toBe(false);
  expect(isNarrow(true, 0)).toBe(true);
  expect(isNarrow(false, 599)).toBe(true);
  expect(isNarrow(false, 600)).toBe(false);
  expect(isNarrow(true, 1200)).toBe(true);
});

function entry(key: string, active: boolean, receipts = 0, card: unknown = "card"): DecisionEntry {
  return {
    key, row: active ? ({ key } as unknown as RankedDecision) : null,
    summary: active ? { title: key, projectIds: ["a"], tone: "warning", group: "waiting", permission: false } : null,
    label: null, card: card as DecisionEntry["card"],
    receipts: Array.from({ length: receipts }, (_, index) => ({ actionKey: key + index }) as unknown as InlineReceipt),
  };
}

test("keeps finished decisions off the ribbon but shows their receipts", () => {
  const entries = [entry("open", true, 1), entry("done", false, 1), entry("gone", false, 0, null), entry("other", true)];
  expect(ribbonEntries(entries).map(item => item.key)).toEqual(["open", "other"]);
  expect(entryDisplay(entries[0], null)).toEqual({ card: false, receipts: false });
  expect(entryDisplay(entries[0], "open")).toEqual({ card: true, receipts: true });
  expect(entryDisplay(entries[1], null)).toEqual({ card: false, receipts: true });
  expect(entryDisplay(entries[2], "gone")).toEqual({ card: false, receipts: false });
  expect(entryDisplay(entries[3], "open")).toEqual({ card: false, receipts: false });
});

test("lists remote work only for projects missing from the table, and failed hosts", () => {
  const peers = [group("laptop", [{ projectId: "a", sessionId: "1" }, { projectId: "z", sessionId: "2" }]), group("down", [], true), group("quiet", [{ projectId: "a", sessionId: "3" }])];
  const orphans = orphanRemote(peers, ["a", null]);
  expect(orphans.map(item => [item.host.label, item.failed, item.rows.map(row => row.sessionId)])).toEqual([["laptop", false, ["2"]], ["down", true, []]]);
});

test("keeps every opened cell mounted after closing it or opening another, until its items are gone", () => {
  const busy = { key: "a", cells: matrixCells(classifyProject({ records: [record("ask")], cards: [card("run", "running"), card("ok", "done")], pulls: [] })) };
  const other = { key: "b", cells: matrixCells(classifyProject({ records: [record("b-ask", { projectId: "b" })], cards: [], pulls: [] })) };
  let rows = [busy, other];
  let open: CellRef | null = null;
  let mounted: CellRef[] = [];
  const press = (next: CellRef) => { open = toggleCell(open, next); mounted = rememberCell(mounted, next, rows); };

  press({ row: "a", column: "human" });
  press({ row: "a", column: "human" });
  expect(open).toBeNull();
  expect(mounted).toEqual([{ row: "a", column: "human" }]);

  press({ row: "a", column: "running" });
  press({ row: "b", column: "human" });
  press({ row: "a", column: "human" });
  expect(open).toEqual({ row: "a", column: "human" });
  expect(mounted).toEqual([{ row: "a", column: "human" }, { row: "a", column: "running" }, { row: "b", column: "human" }]);
  expect(mountedColumns(mounted, "a")).toEqual(["human", "running"]);
  expect(mountedColumns(mounted, "b")).toEqual(["human"]);

  // The running session finished and project b left the board: those cells have nothing left to keep.
  rows = [{ key: "a", cells: matrixCells(classifyProject({ records: [record("ask")], cards: [card("run", "done"), card("ok", "done")], pulls: [] })) }];
  expect(liveCells(mounted, rows)).toEqual([{ row: "a", column: "human" }]);
  press({ row: "a", column: "done" });
  expect(mounted).toEqual([{ row: "a", column: "human" }, { row: "a", column: "done" }]);
});
