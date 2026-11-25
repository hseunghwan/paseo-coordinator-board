import { createHash } from "node:crypto";
import { open, lstat } from "node:fs/promises";
import { join } from "node:path";

const maxIconBytes = 256 * 1024;
const png = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

export async function readProjectIcon(home: string, projectId: string, revision: string | null | undefined) {
  if (!revision) return undefined;
  // Paseo stores the uploaded icon under the hash of its project ID.
  const key = createHash("sha256").update(projectId).digest("hex");
  const path = join(home, "projects", "icons", key + ".bin");
  try {
    const entry = await lstat(path);
    if (!entry.isFile() || entry.size > maxIconBytes) return undefined;
    const file = await open(path, "r");
    try {
      const bytes = Buffer.alloc(maxIconBytes + 1);
      const { bytesRead } = await file.read(bytes, 0, bytes.length);
      if (bytesRead > maxIconBytes) return undefined;
      const image = bytes.subarray(0, bytesRead);
      const mime = image.subarray(0, 8).equals(png) ? "image/png"
        : image.subarray(0, 3).equals(Buffer.from([255, 216, 255])) ? "image/jpeg"
        : image.toString("ascii", 0, 4) === "RIFF" && image.toString("ascii", 8, 12) === "WEBP" ? "image/webp"
        : image.subarray(0, 4).equals(Buffer.from([0, 0, 1, 0])) ? "image/x-icon"
        : undefined;
      return mime && `data:${mime};base64,${image.toString("base64")}`;
    } finally {
      await file.close();
    }
  } catch {
    return undefined;
  }
}
