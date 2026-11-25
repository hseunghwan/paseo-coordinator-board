import { expect, test } from "bun:test";
import {
  deferFocus, focusKeyAction, focusNeedsEmptyNotice, focusProgress, focusQueue, focusRail, railCell, resolveFocus, stepFocus,
  type FocusEntry,
} from "../client/focus-queue";

type Entry = FocusEntry & { summary: { tone: string } | null };
const active = (key: string, tone = "muted"): Entry => ({ key, row: { key }, receipts: [], summary: { tone } });
const processed = (key: string): Entry => ({ key, row: null, receipts: [{ rowKey: key }], summary: null });
const gone = (key: string): Entry => ({ key, row: null, receipts: [], summary: null });

test("the queue follows the ranked order and skips finished places", () => {
  const entries = [active("a"), processed("b"), active("c"), gone("d")];
  expect(focusQueue(entries, [])).toEqual(["a", "c"]);
  expect(focusRail(entries, []).map(entry => entry.key)).toEqual(["a", "b", "c"]);
});

test("deferred decisions move to the back in the order they were deferred", () => {
  const entries = [active("a"), active("b"), active("c"), active("d")];
  expect(focusQueue(entries, ["b", "a"])).toEqual(["c", "d", "b", "a"]);
  // A deferred key that is no longer active does not hold a place.
  expect(focusQueue([active("a"), processed("b")], ["b"])).toEqual(["a"]);
});

test("a refresh keeps the chosen decision while it is still active", () => {
  expect(resolveFocus("c", ["a", "b", "c"], ["c", "a", "b", "e"])).toBe("c");
});

test("a finished decision hands over to the next active one", () => {
  const before = focusQueue([active("a"), active("b"), active("c")], []);
  const after = focusQueue([active("a"), processed("b"), active("c")], []);
  expect(resolveFocus("b", before, after)).toBe("c");
});

test("a vanished decision falls back to the previous active one when it was last", () => {
  expect(resolveFocus("c", ["a", "b", "c"], ["a", "b"])).toBe("b");
  expect(resolveFocus("a", ["a", "b"], ["b"])).toBe("b");
  expect(resolveFocus("a", ["a"], [])).toBeNull();
});

test("the replacement sits where the old decision was, even when its neighbors also left", () => {
  expect(resolveFocus("c", ["a", "b", "c", "d", "e"], ["a", "e"])).toBe("e");
  expect(resolveFocus("c", ["a", "b", "c", "d"], ["a", "x"])).toBe("x");
});

test("without a choice the first decision is shown", () => {
  expect(resolveFocus(null, [], ["a", "b"])).toBe("a");
  expect(resolveFocus("z", ["y"], ["a", "b"])).toBe("a");
});

test("stepping stops at both ends", () => {
  expect(stepFocus(["a", "b", "c"], "b", 1)).toBe("c");
  expect(stepFocus(["a", "b", "c"], "c", 1)).toBe("c");
  expect(stepFocus(["a", "b", "c"], "a", -1)).toBe("a");
  expect(stepFocus(["a", "b"], null, 1)).toBe("a");
});

test("later sends the current decision to the back and shows the one after it", () => {
  const entries = [active("a"), active("b"), active("c")];
  const first = deferFocus(entries, [], "a");
  expect(first).toEqual({ deferred: ["a"], current: "b" });
  expect(focusQueue(entries, first.deferred)).toEqual(["b", "c", "a"]);
  const again = deferFocus(entries, first.deferred, "b");
  expect(again).toEqual({ deferred: ["a", "b"], current: "c" });
  // Deferring a decision already at the back keeps it on screen.
  expect(deferFocus(entries, ["a", "b"], "b")).toEqual({ deferred: ["a", "b"], current: "b" });
  expect(deferFocus([active("a")], [], "a")).toEqual({ deferred: ["a"], current: "a" });
});

test("the rail marks finished, current, waiting and other places", () => {
  expect(railCell(processed("a"), "b")).toBe("done");
  expect(railCell(active("b", "danger"), "b")).toBe("current");
  expect(railCell(active("c", "warning"), "b")).toBe("waiting");
  expect(railCell(active("d", "danger"), "b")).toBe("waiting");
  expect(railCell(active("e", "success"), "b")).toBe("idle");
});

test("progress counts the current place against every place on the rail", () => {
  const rail = focusRail([active("a"), processed("b"), active("c")], []);
  expect(focusProgress(rail, "c")).toEqual({ position: 3, total: 3, processed: 1 });
  expect(focusProgress(rail, null)).toEqual({ position: null, total: 3, processed: 1 });
});

test("the empty notice fills only the gap the board leaves", () => {
  const base = { queue: [], total: 2, filtered: false, filteredTotal: 2, incomplete: false };
  expect(focusNeedsEmptyNotice(base)).toBe(true);
  expect(focusNeedsEmptyNotice({ ...base, queue: ["a"] })).toBe(false);
  expect(focusNeedsEmptyNotice({ ...base, total: 0 })).toBe(false);
  expect(focusNeedsEmptyNotice({ ...base, filtered: true, filteredTotal: 0 })).toBe(false);
  expect(focusNeedsEmptyNotice({ ...base, incomplete: true })).toBe(false);
});

test("J, K and S move through the queue but never while typing", () => {
  expect(focusKeyAction({ key: "j" })).toBe("next");
  expect(focusKeyAction({ key: "K" })).toBe("previous");
  expect(focusKeyAction({ key: "s", target: { tagName: "DIV" } })).toBe("defer");
  expect(focusKeyAction({ key: "x" })).toBeNull();
  expect(focusKeyAction({ key: "j", target: { tagName: "textarea" } })).toBeNull();
  expect(focusKeyAction({ key: "j", target: { tagName: "INPUT" } })).toBeNull();
  expect(focusKeyAction({ key: "j", target: { tagName: "DIV", isContentEditable: true } })).toBeNull();
  expect(focusKeyAction({ key: "j", metaKey: true })).toBeNull();
  expect(focusKeyAction({ key: "s", ctrlKey: true })).toBeNull();
  expect(focusKeyAction({ key: "j", defaultPrevented: true })).toBeNull();
});
