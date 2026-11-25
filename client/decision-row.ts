import type { RankedDecision } from "./decision-priority";
import { decisionSummary, plainDecisionTitle } from "./decision-summary";
import type { Translate } from "./language";
import type { Tone } from "./tone";

export type DecisionGroup = "now" | "waiting" | "merge" | "later";
export const decisionGroups: readonly DecisionGroup[] = ["now", "waiting", "merge", "later"];

export type DecisionRowSummary = {
  title: string;
  projectIds: readonly (string | null)[];
  tone: Tone;
  group: DecisionGroup;
  // Paseo clears a pending permission when the session receives a message, so these rows only open the session.
  permission: boolean;
};

export function decisionRowSummary(row: RankedDecision, t: Translate): DecisionRowSummary {
  const permission = row.reason === "permission";
  const merge = row.kind === "pull" || (row.kind === "record" && row.item.kind === "merge");
  const group: DecisionGroup = row.reason === "overdue" || row.reason === "now" ? "now"
    : permission || row.reason === "reply" || row.reason === "blocker" ? "waiting"
    : merge ? "merge" : "later";
  const tone: Tone = group === "now" ? "danger" : group === "waiting" ? "warning" : group === "merge" ? "success" : "muted";
  const title = row.kind === "pull" ? row.pr.title
    : row.kind === "record" ? plainDecisionTitle(row.item.title)
    : plainDecisionTitle(decisionSummary(row.card, t).headline);
  const projectIds = row.kind === "pull" ? row.pr.projectIds : row.kind === "record" ? [row.item.projectId] : [row.card.session.projectId];
  return { title, projectIds, tone, group, permission };
}

export function decisionGroupLabel(group: DecisionGroup, t: Translate) {
  if (group === "now") return t("지금 처리", "Act now");
  if (group === "waiting") return t("답을 기다리는 중", "Waiting on you");
  if (group === "merge") return t("병합 확인", "Ready to merge");
  return t("예정", "Later");
}
