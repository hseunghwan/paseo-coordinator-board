// The strip at the bottom of the focus view counts what is moving without asking for anything:
// running sessions per project here and on other hosts, plus a flag where something waits for review or failed.

type LaneCard = { lane: string };
type ProjectCards = { id: string; cards: readonly LaneCard[] };
type PeerGroup = { rows: readonly { projectId: string }[] };

export type ProjectActivity = { id: string; name: string; running: number; attention: boolean };

export function focusActivity(list: readonly ProjectCards[], peers: readonly PeerGroup[], name: (id: string) => string) {
  const byId = new Map<string, { running: number; attention: boolean; order: number }>();
  const touch = (id: string) => {
    const known = byId.get(id) ?? { running: 0, attention: false, order: byId.size };
    byId.set(id, known);
    return known;
  };
  for (const project of list) {
    for (const card of project.cards) {
      // Discovery puts both review requests and session errors in the review lane.
      if (card.lane === "running") touch(project.id).running++;
      else if (card.lane === "review") touch(project.id).attention = true;
    }
  }
  for (const group of peers) for (const row of group.rows) touch(row.projectId).running++;
  const projects: ProjectActivity[] = [...byId].sort(([, a], [, b]) => a.order - b.order)
    .map(([id, value]) => ({ id, name: name(id), running: value.running, attention: value.attention }));
  return { running: projects.reduce((sum, project) => sum + project.running, 0), projects };
}

export function runningMarks(count: number, max = 5) {
  const marks = Math.max(0, Math.min(count, max));
  return { marks, extra: Math.max(0, count - marks) };
}
