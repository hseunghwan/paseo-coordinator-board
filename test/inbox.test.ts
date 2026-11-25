import { expect, test } from "bun:test";
import type { DecisionEntry } from "../client/board-layout";
import { rankDecisionRows, type RankedDecision } from "../client/decision-priority";
import type { InlineReceipt } from "../client/decision-receipts";
import { decisionRowSummary } from "../client/decision-row";
import {
  activeDecisionCount, inboxKeyStep, inboxOrder, inboxRow, inboxSectionLabel, inboxSections, isNarrowInbox, keepSelection,
  stepSelection, waitAge, type KeyLike,
} from "../client/inbox";
import type { Card } from "../client/model";
import type { PullRequestItem } from "../shared/prs";
import { trackedDecisionSchema, type TrackedDecision } from "../shared/tracked-decisions";

const now = new Date(2026, 10, 18, 12).getTime();
const before = (hours: number) => new Date(now - hours * 3_600_000).toISOString();
const korean = (ko: string, _en: string) => ko;
const english = (_ko: string, en: string) => en;
const names = (id: string | null) => id === null ? "공통" : id.toUpperCase();

function record(id: string, fields: Partial<TrackedDecision> = {}): TrackedDecision {
  return trackedDecisionSchema.parse({ id, key:id, fingerprint:"0".repeat(64), source:"board", projectId:"a", title:id,
    matchedSessionId:null, matchedPull:null, ...fields });
}
function session(id: string, fields: Partial<Card["session"]> = {}): Card {
  return { lane:"human", note:undefined, session:{ id, title:id, model:null, projectId:"b", projectTitle:"B",
    workspaceTitle:"Branch", lane:"human", detail:"", ...fields } };
}
const pr: PullRequestItem = { repo:"o/r", number:142, title:"Ready PR", url:"https://github.com/o/r/pull/142",
  projectIds:["p","q"], lane:"review", reason:"ready", updatedAt:before(2) };

function entry(row: RankedDecision): DecisionEntry {
  return { key:row.key, row, summary:decisionRowSummary(row, korean), label:null, card:null, receipts:[] };
}
function handled(key: string, fields: Partial<InlineReceipt> = {}): DecisionEntry {
  const receipt: InlineReceipt = { actionKey:"act-" + key, rowKey:key, projectIds:["a"], status:"sent", title:"Answered " + key, order:[], ...fields };
  return { key, row:null, summary:null, label:null, card:null, receipts:[receipt] };
}

const rows = rankDecisionRows({
  records: [record("overdue", { dueAt: before(1) }), record("later", { urgency:"week" })],
  sessions: [
    session("perm", { nativePending: true, decisionRequestedAt: before(0.2) }),
    session("ask", { status:"idle", decision:{ source:"conversation", question:"Ship it?", version:"v1" }, decisionRequestedAt: before(3) }),
  ],
  prs: [pr],
}, now);
const byTitle = (title: string) => entry(rows.find(row => decisionRowSummary(row, korean).title === title)!);

test("lists urgency groups in order, drops empty ones and puts handled places last", () => {
  const entries = [handled("done"), ...rows.map(entry)];
  const sections = inboxSections(entries);
  expect(sections.map(section => section.id)).toEqual(["now", "waiting", "merge", "later", "handled"]);
  expect(sections.at(-1)!.entries.map(item => item.key)).toEqual(["done"]);
  expect(inboxOrder(sections).at(-1)).toBe("done");
  expect(activeDecisionCount(entries)).toBe(rows.length);

  const onlyWaiting = inboxSections([byTitle("Ship it?")]);
  expect(onlyWaiting.map(section => section.id)).toEqual(["waiting"]);
  expect(inboxSectionLabel("handled", korean)).toBe("처리함");
  expect(inboxSectionLabel("now", english)).toBe("Act now");
});

test("starts on the first row and keeps a chosen row while it is listed", () => {
  expect(keepSelection([], ["a", "b"], null)).toBe("a");
  expect(keepSelection([], [], null)).toBeNull();
  // A handled decision keeps its key, so the selection stays on the receipt.
  expect(keepSelection(["a", "b", "c"], ["a", "c", "b"], "b")).toBe("b");
});

test("a row that leaves the list hands the selection to the next row, then the previous one", () => {
  expect(keepSelection(["a", "b", "c"], ["a", "c"], "b")).toBe("c");
  // The following row also left: skip to the next one still listed.
  expect(keepSelection(["a", "b", "c", "d"], ["a", "d"], "b")).toBe("d");
  expect(keepSelection(["a", "b", "c"], ["a", "b"], "c")).toBe("b");
  expect(keepSelection(["a", "b"], ["x"], "b")).toBe("x");
  expect(keepSelection(["a"], [], "a")).toBeNull();
  // Unknown to the previous list as well: fall back to the first row.
  expect(keepSelection(["a"], ["y", "z"], "gone")).toBe("y");
});

test("J and K step through the list and stop at either end", () => {
  const order = ["a", "b", "c"];
  expect(stepSelection(order, "a", 1)).toBe("b");
  expect(stepSelection(order, "c", 1)).toBe("c");
  expect(stepSelection(order, "a", -1)).toBe("a");
  expect(stepSelection(order, null, 1)).toBe("a");
  expect(stepSelection([], "a", 1)).toBeNull();
});

test("J and K are ignored while typing, composing or with a modifier", () => {
  const key = (value: string, fields: Partial<KeyLike> = {}): KeyLike => ({ key:value, altKey:false, ctrlKey:false, metaKey:false, ...fields });
  expect(inboxKeyStep(key("j"), { tagName:"DIV" })).toBe(1);
  expect(inboxKeyStep(key("K"), null)).toBe(-1);
  expect(inboxKeyStep(key("x"), null)).toBe(0);
  expect(inboxKeyStep(key("j"), { tagName:"textarea" })).toBe(0);
  expect(inboxKeyStep(key("j"), { tagName:"INPUT" })).toBe(0);
  expect(inboxKeyStep(key("j"), { tagName:"DIV", isContentEditable:true })).toBe(0);
  expect(inboxKeyStep(key("j"), { tagName:"DIV", getAttribute: name => name === "role" ? "textbox" : null })).toBe(0);
  expect(inboxKeyStep(key("j", { ctrlKey:true }), null)).toBe(0);
  expect(inboxKeyStep(key("j", { metaKey:true }), null)).toBe(0);
  expect(inboxKeyStep(key("j", { isComposing:true }), null)).toBe(0);
  expect(inboxKeyStep(key("j", { defaultPrevented:true }), null)).toBe(0);
});

test("the list collapses to one pane on compact or narrow screens", () => {
  expect(isNarrowInbox(true, 1200)).toBe(true);
  expect(isNarrowInbox(false, 599)).toBe(true);
  expect(isNarrowInbox(false, 600)).toBe(false);
  expect(isNarrowInbox(false, null)).toBe(false);
});

test("a row shows its wait or PR number beside the title and the project with its reason below", () => {
  const ask = inboxRow(byTitle("Ship it?"), names, korean, now);
  expect(ask).toMatchObject({ title:"Ship it?", tone:"warning", aside:"3시간", meta:"B · 답변 대기", handled:false });
  const pull = inboxRow(byTitle("Ready PR"), names, english, now);
  expect(pull).toMatchObject({ tone:"success", aside:"#142", meta:"P, Q · No deadline" });
  const overdue = inboxRow(byTitle("overdue"), names, korean, now);
  expect(overdue.tone).toBe("danger");
  expect(overdue.meta).toBe("A · 기한 지남");
});

test("a permission request points to the session instead of inviting a reply", () => {
  const perm = rows.find(row => decisionRowSummary(row, korean).permission)!;
  const row = inboxRow(entry(perm), names, korean, now);
  expect(row).toMatchObject({ permission:true, aside:"12분", meta:"B · 세션에서 승인" });
  expect(inboxRow(entry(perm), names, english, now).meta).toBe("B · Approve in session");
});

test("a handled place reads from its latest receipt", () => {
  const row = inboxRow(handled("done", { status:"merged", projectIds:[null], title:"Deploy docs" }), names, korean, now);
  expect(row).toMatchObject({ title:"Deploy docs", tone:"success", aside:null, meta:"공통 · 병합함", handled:true });
});

test("wait ages read in both languages", () => {
  expect(waitAge(0, korean)).toBe("1분 미만");
  expect(waitAge(59, english)).toBe("59m");
  expect(waitAge(120, korean)).toBe("2시간");
  expect(waitAge(60 * 49, english)).toBe("2d");
});
