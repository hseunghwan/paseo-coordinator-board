import { expect, test } from "bun:test";
import { focusActivity, runningMarks } from "../client/focus-status";

const names: Record<string, string> = { p: "Alpha", q: "Beta", r: "Gamma" };
const name = (id: string) => names[id] ?? id;

test("counts running sessions per project, here and on other hosts", () => {
  const activity = focusActivity([
    { id: "p", cards: [{ lane: "running" }, { lane: "running" }, { lane: "human" }] },
    { id: "q", cards: [{ lane: "idle" }, { lane: "done" }] },
  ], [{ rows: [{ projectId: "p" }, { projectId: "r" }] }], name);
  expect(activity.running).toBe(4);
  expect(activity.projects).toEqual([
    { id: "p", name: "Alpha", running: 3, attention: false },
    { id: "r", name: "Gamma", running: 1, attention: false },
  ]);
});

test("flags projects with a session waiting for review or reporting an error", () => {
  const activity = focusActivity([{ id: "q", cards: [{ lane: "review" }] }, { id: "p", cards: [{ lane: "running" }, { lane: "review" }] }], [], name);
  expect(activity.projects).toEqual([
    { id: "q", name: "Beta", running: 0, attention: true },
    { id: "p", name: "Alpha", running: 1, attention: true },
  ]);
});

test("a quiet board shows no projects", () => {
  expect(focusActivity([{ id: "p", cards: [{ lane: "idle" }] }], [{ rows: [] }], name)).toEqual({ running: 0, projects: [] });
});

test("running marks stop at five and count the rest", () => {
  expect(runningMarks(3)).toEqual({ marks: 3, extra: 0 });
  expect(runningMarks(5)).toEqual({ marks: 5, extra: 0 });
  expect(runningMarks(8)).toEqual({ marks: 5, extra: 3 });
  expect(runningMarks(0)).toEqual({ marks: 0, extra: 0 });
});
