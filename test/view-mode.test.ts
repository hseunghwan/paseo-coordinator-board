import { expect, test } from "bun:test";
import { boardViewDescription, boardViewLabel, boardViewModes, defaultBoardViewMode } from "../client/view-mode";

test("offers the new views with the classic stack kept as a choice", () => {
  expect(boardViewModes).toEqual(["inbox", "focus", "matrix", "classic"]);
  expect(defaultBoardViewMode).toBe("inbox");
});

test("names and explains every view in both languages", () => {
  for (const mode of boardViewModes) {
    expect(boardViewLabel(mode, ko => ko)).not.toBe(boardViewLabel(mode, (_ko, en) => en));
    expect(boardViewDescription(mode, ko => ko).length).toBeGreaterThan(0);
  }
});
