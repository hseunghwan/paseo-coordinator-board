import { createHash } from "node:crypto";
import { open, lstat, readdir } from "node:fs/promises";
import { isAbsolute, join } from "node:path";
import { findSvgIconProblem } from "@getpaseo/plugin";

const maxIconBytes = 256 * 1024;
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const priority = ["public", "static", "priv/static", "assets", "images", "img"];
const ignored = new Set([".git", "node_modules", "dist", "build", ".next", ".nuxt", ".output", "coverage", ".cache", "vendor", "src", "lib", "test", "tests", "__tests__"]);
const names = [
  /^favicon\.svg$/, /^favicon\.png$/, /^favicon-.*\.svg$/, /^favicon-.*\.png$/,
  /^favico\.svg$/, /^favico\.png$/, /^icon\.svg$/, /^icon\.png$/, /^app-icon\.svg$/, /^app-icon\.png$/,
  /^apple-touch-icon\.png$/, /^apple-touch-icon-.*\.png$/, /^icon-.*\.png$/, /^android-chrome-.*\.png$/,
  /^safari-pinned-tab\.svg$/, /^mstile-.*\.png$/, /^logo\.svg$/, /^logo\.png$/, /^favicon\.ico$/, /^favico\.ico$/,
];

async function readIcon(path: string, limit: number) {
  try {
    const entry = await lstat(path);
    if (!entry.isFile() || entry.size > limit) return undefined;
    const file = await open(path, "r");
    try {
      const bytes = Buffer.alloc(limit + 1);
      const { bytesRead } = await file.read(bytes, 0, bytes.length);
      if (bytesRead > limit) return undefined;
      const image = bytes.subarray(0, bytesRead);
      const mime = image.subarray(0, 8).equals(png) ? "image/png"
        : image.subarray(0, 3).equals(Buffer.from([255, 216, 255])) ? "image/jpeg"
        : image.toString("ascii", 0, 4) === "RIFF" && image.toString("ascii", 8, 12) === "WEBP" ? "image/webp"
        : image.subarray(0, 4).equals(Buffer.from([0, 0, 1, 0])) ? "image/x-icon"
        : path.endsWith(".svg") && !findSvgIconProblem(image.toString("utf8")) ? "image/svg+xml"
        : undefined;
      return mime && `data:${mime};base64,${image.toString("base64")}`;
    } finally {
      await file.close();
    }
  } catch {
    return undefined;
  }
}

async function entries(dir: string) {
  return readdir(dir, { withFileTypes: true }).catch(() => []);
}

async function scan(dir: string, depth: number): Promise<string | undefined> {
  const children = await entries(dir);
  const files = children.filter(entry => entry.isFile());
  for (const pattern of names) {
    for (const file of files) {
      if (!pattern.test(file.name)) continue;
      const icon = await readIcon(join(dir, file.name), 32 * 1024);
      if (icon) return icon;
    }
  }
  if (!depth) return undefined;
  for (const child of children) {
    if (!child.isDirectory() || ignored.has(child.name)) continue;
    const icon = await scan(join(dir, child.name), depth - 1);
    if (icon) return icon;
  }
}

async function scanPriority(root: string) {
  for (const folder of priority) {
    const icon = await scan(join(root, folder), 2);
    if (icon) return icon;
  }
}

async function discoverIcon(root: string) {
  if (!isAbsolute(root)) return undefined;
  const rootIcon = await scanPriority(root);
  if (rootIcon) return rootIcon;
  for (const folder of ["packages", "apps"]) {
    const directory = join(root, folder);
    for (const child of await entries(directory)) {
      if (!child.isDirectory()) continue;
      const project = join(directory, child.name);
      const icon = await scanPriority(project) ?? await scan(project, 0);
      if (icon) return icon;
    }
  }
  return scan(root, 0);
}

export async function readProjectIcon(home: string, projectId: string, revision: string | null | undefined, root: string) {
  if (revision) {
    const key = createHash("sha256").update(projectId).digest("hex");
    const uploaded = await readIcon(join(home, "projects", "icons", key + ".bin"), maxIconBytes);
    if (uploaded) return uploaded;
  }
  return discoverIcon(root);
}
