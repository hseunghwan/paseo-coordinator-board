import { getPaseoClient, useHosts, useSettings } from "@getpaseo/plugin/client";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { boardHosts, hostVisibility, type BoardHost } from "../shared/hosts";
import { readRemoteSessions, remoteScope, type LocalProject, type RemoteSession, type Repository } from "./remote-sessions";
import { ProjectText, RunningMark, SessionChip, type Theme } from "./controls";
import { useBoardLanguage } from "./language";

type Open = (serverId: string, sessionId: string) => void;
export type RemoteGroup = { host: BoardHost; rows: RemoteSession[]; failed: boolean };

export function useRemoteRunning(current: {id:string;label:string}, projects:LocalProject[], repositories:Repository[], enabled:boolean) {
  const hosts = useHosts();
  const visibility = useSettings(hostVisibility);
  const scope = remoteScope(projects, repositories);
  const registered = enabled && scope.selected.length && visibility.status === "ready"
    ? boardHosts(current, hosts).filter(host => host.serverId !== current.id && host.status === "online" && !visibility.values.hidden.includes(host.serverId))
    : [];
  const key = JSON.stringify([current.id, scope, registered.map(h => [h.serverId,h.label])]);
  const [cache, setCache] = useState<{key:string; groups:RemoteGroup[]}>({key:"", groups:[]});
  useEffect(() => {
    let active = true;
    const timers = registered.map(host => {
      let pending = false;
      async function refresh() {
        if (pending) return;
        pending = true;
        let group:RemoteGroup;
        try {
          group = {host, rows:await readRemoteSessions(getPaseoClient(host.serverId),scope,()=>active), failed:false};
        } catch {
          group = {host, rows:[], failed:true};
        } finally { pending = false; }
        if (active) setCache(previous => ({ key, groups: [
          ...(previous.key === key ? previous.groups.filter(g => g.host.serverId !== host.serverId) : []), group,
        ] }));
      }
      void refresh();
      return setInterval(() => void refresh(), 30_000);
    });
    return () => { active = false; timers.forEach(clearInterval); };
  }, [key]);
  const groups = cache.key === key ? cache.groups : [];
  return { groups, loading: enabled && (visibility.status === "loading" || groups.length < registered.length) };
}

export function RemoteRunning({groups, projects, theme, open}: {groups:RemoteGroup[];projects:LocalProject[];theme:Theme;open?:Open}) {
  return <>{groups.map(group => <HostRunning key={group.host.serverId} {...group} projects={projects} theme={theme} open={open} />)}</>;
}

function HostRunning({ host, rows, failed, projects, theme, open }: RemoteGroup & {projects:LocalProject[];theme:Theme;open?:Open}) {
  const {t} = useBoardLanguage();
  const c = theme.colors;
  if (failed) return <Text style={{color:c.foregroundMuted}}>{t(`${host.label} · 진행 중인 세션 조회 실패`,`${host.label} · Could not load running sessions`)}</Text>;
  if (!rows.length) return null;
  return <View style={{gap:6,borderWidth:1,borderColor:c.border,borderRadius:10,padding:12}}>
    <Text accessibilityRole="header" style={{color:c.foreground,fontWeight:"600"}}>{t(`${host.label} · 진행 중인 세션`,`${host.label} · Running sessions`)}</Text>
    {rows.map(row => {
      const project = projects.find(p => p.id===row.projectId);
      if (!project?.selected) return null;
      const title = row.title || t(`세션 ${row.sessionId.slice(0,8)}`,`Session ${row.sessionId.slice(0,8)}`);
      return <View key={row.sessionId} style={{flexDirection:"row",flexWrap:"wrap",alignItems:"center",gap:6}}>
        <RunningMark theme={theme} />
        <View style={{flex:1}}>
          <ProjectText theme={theme} projects={[project.title]} selectable style={{color:c.foreground}}>{project.title} · {title}</ProjectText>
        </View>
        {open && <SessionChip theme={theme} label={t("담당 세션","Task session")}
          accessibilityLabel={t(`${host.label} · ${title} 열기`,`Open ${title} on ${host.label}`)} onPress={() => open(host.serverId,row.sessionId)} />}
      </View>;
    })}
  </View>;
}
