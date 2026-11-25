import { defineSettings } from "@getpaseo/plugin";
import { z } from "zod";
import type { Translate } from "./language";

export const boardViewModes = ["inbox", "focus", "matrix", "classic"] as const;
export type BoardViewMode = (typeof boardViewModes)[number];
export const defaultBoardViewMode: BoardViewMode = "inbox";

export const boardViewSetting = defineSettings({
  id: "board-view", scope: "device", version: 1,
  schema: z.object({ mode: z.enum(boardViewModes).default(defaultBoardViewMode) }),
});

export function boardViewLabel(mode: BoardViewMode, t: Translate) {
  if (mode === "inbox") return t("인박스", "Inbox");
  if (mode === "focus") return t("집중", "Focus");
  if (mode === "matrix") return t("매트릭스", "Matrix");
  return t("기존", "Classic");
}

export function boardViewDescription(mode: BoardViewMode, t: Translate) {
  if (mode === "inbox") return t("왼쪽 목록에서 결정을 고르고 오른쪽에서 한 건씩 읽고 답합니다.", "Pick a decision from the list and answer it in the detail pane.");
  if (mode === "focus") return t("가장 급한 결정 한 건만 크게 띄우고, 처리하면 다음 결정으로 넘어갑니다.", "Shows the most urgent decision on its own and moves to the next one when you finish.");
  if (mode === "matrix") return t("프로젝트와 상태를 한 표로 봅니다. 위의 띠에는 결정이 급한 순서로 놓입니다.", "Shows projects by state in one table, with decisions ranked in a strip above.");
  return t("결정, 기록, 세션 진행을 한 화면에 차례로 쌓습니다.", "Stacks decisions, history and session progress on one page.");
}
