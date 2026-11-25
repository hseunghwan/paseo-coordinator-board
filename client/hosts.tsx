import { useBoardLanguage } from "./language";
import { getPaseoClient, useHosts, useSettings } from "@getpaseo/plugin/client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import { boardHosts, hiddenAfter, hostVisibility, type BoardHost } from "../shared/hosts";
import { Button, ProjectText, type Theme } from "./controls";

const statusText = {
  online: ["연결됨", "Online"], connecting: ["연결 중", "Connecting"], idle: ["연결 대기", "Idle"],
  offline: ["연결 끊김", "Offline"], error: ["연결 오류", "Connection error"], unknown: ["연결 미확인", "Connection unknown"],
} as const;
const wrap = { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 6 };
type Open = (serverId: string, agentId: string) => void;

export function BoardHosts({ current, settings, theme, open }: {
  current: { id: string; label: string }; settings: boolean; theme: Theme; open?: Open;
}) {
  const { t } = useBoardLanguage();
  const registered = useHosts();
  const scope = useSettings(hostVisibility);
  const hosts = boardHosts(current, registered);
  const [expanded, setExpanded] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const pending = useRef(false);
  const [conflict, setConflict] = useState(false);
  const c = theme.colors;
  const ready = scope.status === "ready";
  const shown = ready ? hosts.filter(h => !scope.values.hidden.includes(h.serverId)) : [];
  const target = shown.find(h => h.serverId === chosen);
  const error = scope.status === "error" || scope.status === "invalid" || !!scope.saveError || conflict;

  async function change(id: string, show: boolean) {
    if (scope.status !== "ready" || pending.current) return;
    pending.current = true;
    try {
      setConflict(false);
      const saved = await scope.save({ hidden: hiddenAfter(scope.values.hidden, id, show) }, scope.revision);
      if (!saved) {
        await scope.reload();
        setConflict(true);
      }
      if (saved && !show && chosen === id) setChosen(null);
    } finally {
      pending.current = false;
    }
  }

  if (!settings && !expanded) {
    return <View style={wrap}><Button theme={theme} label={t("기기별 세션 찾아보기", "Browse sessions by host")} onPress={() => setExpanded(true)} /></View>;
  }
  return <View style={{ gap: 8, padding: 14, borderRadius: 10, backgroundColor: c.surface1 }}>
    <View style={{ ...wrap, alignItems: "center", justifyContent: "space-between" }}>
      <Text accessibilityRole="header" style={{ fontSize: 17, fontWeight: "600", color: c.foreground }}>
        {settings ? t("Paseo 호스트", "Paseo hosts") : t("기기별 세션", "Sessions by host")}
      </Text>
      {settings
        ? <Text style={{ color: c.foregroundMuted }}>{t(`앱에 등록 ${registered.length}대`, `Registered hosts: ${registered.length}`)}</Text>
        : <Button theme={theme} label={t("기기별 세션 닫기", "Close host sessions")} onPress={() => { setExpanded(false); setChosen(null); }} />}
    </View>
    {settings && <Text style={{ color: c.foregroundMuted }}>{t("등록한 기기는 기본으로 표시됩니다. 표시한 기기의 세션은 여기에서 찾을 수 있고, 같은 프로젝트에서 진행 중인 작업은 홈에서도 볼 수 있습니다.", "Registered hosts are shown by default. Browse their sessions here and see running work from matching projects on the board.")}</Text>}
    {scope.status === "loading" && <Text style={{ color: c.foregroundMuted }}>{t("표시할 호스트를 확인하고 있습니다.", "Loading host visibility…")}</Text>}
    {error && <View style={wrap}>
      <Text accessibilityLiveRegion="polite" style={{ color: c.statusDanger }}>{ready ? t("표시 설정을 저장하지 못했습니다. 최신 설정에서 다시 선택해 주세요.", "Could not save host visibility. Review the latest settings and try again.") : t("호스트 표시 설정을 읽지 못했습니다.", "Could not load host visibility settings.")}</Text>
      <Button theme={theme} label={t("호스트 표시 설정 다시 읽기", "Reload host visibility")} onPress={() => { setConflict(false); void scope.reload(); }} />
    </View>}
    {settings && ready && hosts.map(host => {
      const included = !scope.values.hidden.includes(host.serverId);
      return <View key={host.serverId} style={{ ...wrap, alignItems: "center", justifyContent: "space-between", borderTopWidth: 1, borderColor: c.border, paddingTop: 7 }}>
        <View style={{ flex: 1, minWidth: 120, gap: 3 }}>
          <Text style={{ color: c.foreground }}>{host.label}{host.serverId === current.id ? t(" · 현재 보드", " · Current board") : ""} · {t(statusText[host.status][0], statusText[host.status][1])}</Text>
          <Text accessibilityLiveRegion="polite" style={{ fontSize: 13, color: c.foregroundMuted }}>{included ? t("세션 목록에 표시 중", "Shown in the session list") : t("세션 목록에서 숨김", "Hidden from the session list")}</Text>
        </View>
        <Button theme={theme} disabled={scope.saving}
          label={included ? t("숨기기", "Hide") : t("표시하기", "Show")}
          accessibilityLabel={host.label + (included ? t(" · 기기별 세션에서 숨기기", " · Hide from host sessions") : t(" · 기기별 세션에 표시하기", " · Show in host sessions"))}
          onPress={() => void change(host.serverId, !included)} />
      </View>;
    })}
    {!settings && ready && <>
      <View style={wrap}>
        {shown.map(host => <Button theme={theme} key={host.serverId} selected={host.serverId === target?.serverId}
          label={host.label + " · " + t(statusText[host.status][0], statusText[host.status][1])} disabled={host.status !== "online"}
          onPress={() => setChosen(host.serverId)} />)}
      </View>
      {!shown.length && <Text style={{ color: c.foregroundMuted }}>{t("표시할 호스트가 없습니다. 설정에서 기기별 세션에 표시할 호스트를 고르세요.", "No hosts to show. Choose hosts in settings.")}</Text>}
      {target?.status === "online" && <HostSessions key={target.serverId} host={target} theme={theme} open={open} />}
    </>}
  </View>;
}

type Summary = { id: string; title: string; project: string };
function HostSessions({ host, theme, open }: { host: BoardHost; theme: Theme; open?: Open }) {
  const { t } = useBoardLanguage();
  const [rows, setRows] = useState<Summary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const request = useRef(0);
  const seen = useRef(new Set<string>());
  const busy = useRef(false);
  const c = theme.colors;

  const load = useCallback(async (next?: string) => {
    if (busy.current) return;
    busy.current = true;
    const token = ++request.current;
    setLoading(true); setError(false);
    try {
      const client = getPaseoClient(host.serverId);
      const page = await client.agents.list({
        filter: { includeArchived: false, includeBackground: true },
        sort: [{ key: "created_at", direction: "desc" }], page: { limit: 20, cursor: next },
      });
      if (token !== request.current) return;
      const mapped = page.entries.filter(({ agent }) => !agent.archivedAt && !agent.internal)
        .map(({ agent, project }) => ({ id: agent.id, title: agent.title?.trim() || "", project: project.projectName || "" }));
      const visited = next ? new Set(seen.current).add(next) : new Set<string>();
      if (page.pageInfo.hasMore && (!page.pageInfo.nextCursor || visited.has(page.pageInfo.nextCursor))) throw Error();
      seen.current = visited;
      setRows(prior => [...new Map([...(next ? prior : []), ...mapped].map(row => [row.id, row])).values()]);
      setCursor(page.pageInfo.hasMore ? page.pageInfo.nextCursor : null);
    } catch {
      if (token === request.current) setError(true);
    } finally {
      if (token === request.current) { busy.current = false; setLoading(false); }
    }
  }, [host.serverId]);

  useEffect(() => {
    void load();
    return () => { request.current++; busy.current = false; };
  }, [load]);

  return <View style={{ gap: 6 }}>
    <View style={{ ...wrap, alignItems: "center", justifyContent: "space-between" }}>
      <Text style={{ fontWeight: "600", color: c.foreground }}>{t(`${host.label}의 세션`, `Sessions on ${host.label}`)}</Text>
      <Button theme={theme} label={t("호스트 세션 새로 고침", "Refresh host sessions")} disabled={loading} onPress={() => void load()} />
    </View>
    {rows.map(row => {
      const title = row.title || t(`세션 ${row.id.slice(0, 8)}`, `Session ${row.id.slice(0, 8)}`);
      return <View key={row.id} style={{ ...wrap, alignItems: "center", justifyContent: "space-between", borderTopWidth: 1, borderColor: c.border, paddingTop: 6 }}>
        <ProjectText theme={theme} projects={row.project ? [row.project] : []} style={{ flexShrink: 1, color: c.foreground }}>{[row.project, title].filter(Boolean).join(" · ")}</ProjectText>
        {open && <Button theme={theme} label={t("세션 열기", "Open session")} accessibilityLabel={t(`${host.label} · ${title} 열기`, `Open ${title} on ${host.label}`)} onPress={() => open(host.serverId, row.id)} />}
      </View>;
    })}
    {loading && <Text style={{ color: c.foregroundMuted }}>{t("세션을 읽고 있습니다.", "Loading sessions…")}</Text>}
    {!loading && error && <Text accessibilityLiveRegion="polite" style={{ color: c.statusDanger }}>{t("이 호스트에서 세션을 읽지 못했습니다. 연결 상태를 확인해 주세요.", "Could not load sessions on this host. Check its connection.")}</Text>}
    {!loading && !error && !rows.length && !cursor && <Text style={{ color: c.foregroundMuted }}>{t("표시할 세션이 없습니다.", "No sessions to show.")}</Text>}
    {!loading && (cursor || error) && <View style={wrap}>
      <Button theme={theme} label={error ? t("호스트 세션 다시 읽기", "Retry loading host sessions") : t("세션 더 보기", "Show more sessions")} onPress={() => void load(cursor ?? undefined)} />
    </View>}
  </View>;
}
