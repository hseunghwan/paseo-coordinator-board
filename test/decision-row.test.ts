import { expect, test } from "bun:test";
import { rankDecisionRows } from "../client/decision-priority";
import { decisionGroupLabel, decisionRowSummary } from "../client/decision-row";
import type { Card } from "../client/model";
import type { PullRequestItem } from "../shared/prs";
import { trackedDecisionSchema, type TrackedDecision } from "../shared/tracked-decisions";

const now = new Date(2026, 10, 18, 12).getTime();
const before = (hours: number) => new Date(now - hours * 3_600_000).toISOString();
const korean = (ko: string, _en: string) => ko;
function record(id: string, fields: Partial<TrackedDecision> = {}): TrackedDecision {
  return trackedDecisionSchema.parse({ id, key:id, fingerprint:"0".repeat(64), source:"board", projectId:"a", title:id,
    matchedSessionId:null, matchedPull:null, ...fields });
}
function session(id: string, fields: Partial<Card["session"]> = {}): Card {
  return { lane:"human", note:undefined, session:{ id, title:id, model:null, projectId:"b", projectTitle:"B",
    workspaceTitle:"Branch", lane:"human", detail:"", ...fields } };
}
const pr: PullRequestItem = { repo:"o/r", number:1, title:"Ready PR", url:"https://github.com/o/r/pull/1",
  projectIds:["p","q"], lane:"review", reason:"ready", updatedAt:before(2) };

test("groups ranked rows by what they ask of the person", () => {
  const rows = rankDecisionRows({
    records: [record("**Overdue** item", { dueAt: before(1) }), record("deploy", { kind:"merge" }), record("later", { urgency:"week" })],
    sessions: [
      session("perm", { nativePending: true }),
      session("ask", { status:"idle", decision:{ source:"conversation", question:"Ship it?", version:"v1" }, decisionRequestedAt: before(3) }),
    ],
    prs: [pr],
  }, now);
  const byTitle = new Map(rows.map(row => { const s = decisionRowSummary(row, korean); return [s.title, s]; }));
  expect(byTitle.get("Overdue item")).toMatchObject({ group:"now", tone:"danger", permission:false, projectIds:["a"] });
  expect(byTitle.get("Ship it?")).toMatchObject({ group:"waiting", tone:"warning", projectIds:["b"] });
  expect([...byTitle.values()].find(s => s.permission)).toMatchObject({ group:"waiting", tone:"warning" });
  expect(byTitle.get("deploy")).toMatchObject({ group:"merge", tone:"success" });
  expect(byTitle.get("Ready PR")).toMatchObject({ group:"merge", projectIds:["p","q"] });
  expect(byTitle.get("later")).toMatchObject({ group:"later", tone:"muted" });
});

test("labels every group in both languages", () => {
  expect(decisionGroupLabel("now", korean)).toBe("지금 처리");
  expect(decisionGroupLabel("later", (_ko, en) => en)).toBe("Later");
});
