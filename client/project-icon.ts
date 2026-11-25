import { projectFilterNames, type Snapshot } from "./model";

export function projectInitial(name: string): string {
  return Array.from(name.trim())[0]?.toUpperCase() || "?";
}

export function projectColorIndex(name: string, paletteSize: number): number {
  let hash = 0;
  for (const letter of name.trim().toLowerCase()) {
    hash = (Math.imul(hash, 31) + (letter.codePointAt(0) ?? 0)) >>> 0;
  }
  return hash % paletteSize;
}
export function projectIconSources(projects: Snapshot["projects"]) {
  const names = projectFilterNames(projects);
  const ambiguous = new Set(projects.filter(project => names.get(project.id) !== project.title).map(project => project.title));
  const sources = new Map<string, string>();
  for (const project of projects) {
    if (!project.icon) continue;
    sources.set("id:" + project.id, project.icon);
    const label = names.get(project.id);
    if (label && !ambiguous.has(label)) sources.set("name:" + label, project.icon);
  }
  return sources;
}
