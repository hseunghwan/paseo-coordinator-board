import { defineSettings } from "@getpaseo/plugin";
import { useSettings } from "@getpaseo/plugin/client";
import { useState, type ReactNode } from "react";
import { Text, View } from "react-native";
import { z } from "zod";
import { Button, ProjectText, RunningMark, SessionChip, type Theme } from "./controls";
import { useBoardLanguage } from "./language";
import type { Card } from "./model";
import type { RemoteGroup } from "./remote-running";

const mode = z.enum(["projects", "running"]);
type Mode = z.infer<typeof mode>;
const preference = defineSettings({
  id: "session-progress-view", scope: "device", version: 1,
  schema: z.object({ mode: mode.default("projects") }),
});

type Props = {
  cards: Card[]; peers: RemoteGroup[]; peersLoading: boolean; hostLabel: string;
  projectName: (id: string) => string; open?: (id: string) => void; openRemote?: (host: string, id: string) => void;
  theme: Theme; children: ReactNode;
};

export function SessionProgress({ cards, peers, peersLoading, hostLabel, projectName, open, openRemote, theme, children }: Props) {
  const { t } = useBoardLanguage();
  const saved = useSettings(preference);
  const [temporary, setTemporary] = useState<Mode | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const current = temporary ?? (saved.status === "ready" ? saved.values.mode : "projects");
  async function select(next: Mode) {
    if (saved.saving || next === current) return;
    setTemporary(next);
    setSaveFailed(false);
    if (saved.status === "ready" && await saved.save({ mode: next }, saved.revision)) {
      setTemporary(null);
    } else {
      setSaveFailed(true);
      await saved.reload();
    }
  }

  const c = theme.colors;
  const local = cards.filter(card => card.lane === "running");
  const count = local.length + peers.reduce((sum, group) => sum + group.rows.length, 0);
  const failed = peers.filter(group => group.failed);
  const rows = current === "running" ? [
    ...local.map(({ session }) => ({
      id: session.id, host: null, hostLabel, title: session.title, projectId: session.projectId, at: session.activityAt,
    })),
    ...peers.flatMap(({ host, rows }) => rows.map(row => ({
      id: row.sessionId, host: host.serverId, hostLabel: host.label, title: row.title, projectId: row.projectId, at: row.activityAt,
    }))),
  ].sort((a, b) => (Date.parse(b.at ?? "") || 0) - (Date.parse(a.at ?? "") || 0)
    || a.title.localeCompare(b.title) || (a.host ?? "").localeCompare(b.host ?? "") || a.id.localeCompare(b.id)) : [];

  return <View style={{ gap: 12 }}>
    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
      <Text accessibilityRole="header" style={{ fontSize: 14, fontWeight: "500", color: c.foreground }}>{t("세션 진행", "Session progress")}</Text>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 5 }}>
        <Button theme={theme} label={t("프로젝트별", "By project")} selected={current === "projects"} disabled={saved.saving} onPress={() => void select("projects")} />
        <Button theme={theme} label={t(`진행 중 모아보기 · ${count}`, `All running · ${count}`)} selected={current === "running"} disabled={saved.saving} onPress={() => void select("running")} />
      </View>
    </View>
    {saveFailed && <Text style={{ color: c.statusWarning }}>{t("현재 보기를 이 기기에 저장하지 못했습니다.", "Could not save this view on this device.")}</Text>}
    {current === "projects" ? children : <>
      {rows.length > 0 && <View style={{ backgroundColor: c.surface1, borderColor: c.border, borderWidth: 1, borderRadius: 8, paddingHorizontal: 12 }}>
        {rows.map((row, index) => {
          const title = row.title || t(`세션 ${row.id.slice(0, 8)}`, `Session ${row.id.slice(0, 8)}`);
          const project = projectName(row.projectId);
          const target = row.host;
          const visit = target === null ? open && (() => open(row.id)) : openRemote && (() => openRemote(target, row.id));
          return <View key={JSON.stringify([target, row.id])} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 9, borderTopWidth: index ? 1 : 0, borderColor: c.border }}>
            <RunningMark theme={theme} />
            <View style={{ flex: 1, gap: 3 }}>
              <Text selectable style={{ fontSize: 14, fontWeight: "600", color: c.foreground }}>{title}</Text>
              <ProjectText theme={theme} projectId={row.projectId} projects={[project]} selectable style={{ fontSize: 12, color: c.foregroundMuted }}>{project} · {row.hostLabel}</ProjectText>
            </View>
            {visit && <SessionChip theme={theme} label={t("세션 열기", "Open session")}
              accessibilityLabel={t(`세션 열기 · ${title}`, `Open session · ${title}`) + " · " + project + " · " + row.hostLabel} onPress={visit} />}
          </View>;
        })}
      </View>}
      {peersLoading && <Text style={{ color: c.foregroundMuted }}>{t("다른 호스트의 세션을 확인하고 있습니다.", "Checking sessions on other hosts.")}</Text>}
      {!count && !peersLoading && !failed.length && <Text style={{ color: c.foregroundMuted }}>{t("선택한 프로젝트에 진행 중인 세션이 없습니다.", "No running sessions in the selected projects.")}</Text>}
      {failed.map(({ host }) => <Text key={host.serverId} style={{ color: c.statusWarning }}>{t(`${host.label} · 진행 중인 세션 조회 실패`, `${host.label} · Could not load running sessions`)}</Text>)}
    </>}
  </View>;
}
