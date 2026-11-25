import { expect, test } from "bun:test";
import { tint, toneColor } from "../client/tone";

test("derives a status tint from the status color itself", () => {
  expect(tint("#c09664")).toBe("rgba(192, 150, 100, 0.16)");
  expect(tint("#abc", 0.5)).toBe("rgba(170, 187, 204, 0.5)");
  expect(tint("#c0966480")).toBe("rgba(192, 150, 100, 0.16)");
});

test("leaves colors it cannot read to the neutral fallback", () => {
  expect(tint("rgb(1,2,3)")).toBeNull();
  expect(tint("orange")).toBeNull();
});

test("maps tones onto the plugin theme's status tokens", () => {
  const colors = { statusDanger: "d", statusWarning: "w", statusSuccess: "s", foregroundMuted: "m" };
  expect(["danger", "warning", "success", "muted"].map(tone => toneColor(colors, tone as never))).toEqual(["d", "w", "s", "m"]);
});
