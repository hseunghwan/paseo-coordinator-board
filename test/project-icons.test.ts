import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readProjectIcon } from "../server/project-icons";

test("reads uploaded project icons before discovering monorepo favicons", async () => {
  const home = await mkdtemp(join(tmpdir(), "board-project-icon-"));
  try {
    const root = join(home, "repo");
    const faviconDir = join(root, "apps", "frontend", "static");
    const iconDir = join(home, "projects", "icons");
    await mkdir(faviconDir, { recursive: true });
    await mkdir(iconDir, { recursive: true });
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><path d="M0 0h16v16H0z"/></svg>';
    const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jJ84AAAAASUVORK5CYII=";
    const key = createHash("sha256").update("project").digest("hex");
    await writeFile(join(faviconDir, "favicon.svg"), svg);
    await writeFile(join(faviconDir, "favicon.png"), Buffer.from(png, "base64"));
    await writeFile(join(iconDir, key + ".bin"), Buffer.from(png, "base64"));

    expect(await readProjectIcon(home, "project", "revision", root)).toBe(`data:image/png;base64,${png}`);
    expect(await readProjectIcon(home, "project", null, root)).toBe(`data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`);

    await writeFile(join(faviconDir, "favicon.svg"), '<svg><script>alert(1)</script></svg>');
    expect(await readProjectIcon(home, "project", null, root)).toBe(`data:image/png;base64,${png}`);
  } finally {
    await rm(home, { recursive: true, force: true });
  }
});
