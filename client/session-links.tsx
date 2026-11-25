import { useRpc } from "@getpaseo/plugin/client";
import { TextInput } from "@getpaseo/plugin/client/ui";
import { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import type { z } from "zod";
import { linkSession, listSessionLinks } from "../shared/session-links";
import { Button, SettingsDisclosure, type Theme } from "./controls";
import { useBoardLanguage } from "./language";
import type { Snapshot } from "./model";

type Projects = Snapshot["projects"];
type Entry = z.output<typeof listSessionLinks.output>["sessions"][number];
type Props = { projects: Projects; theme: Theme; onChange: () => void };

function projectName(project: Projects[number], projects: Projects) {
  return projects.some(other => other.id !== project.id && other.title === project.title)
    ? project.title + " · " + (project.path || project.id) : project.title;
}

function LinkPicker({ projects, theme, onChange }: Props) {
  const { t } = useBoardLanguage();
  const list = useRpc(listSessionLinks);
  const save = useRpc(linkSession);
  const listRef = useRef(list);
  listRef.current = list;
  const generation = useRef(0);
  const sending = useRef(false);
  const [rows, setRows] = useState<Entry[]>([]);
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(12);
  const [chosen, setChosen] = useState<string | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [error, setError] = useState<"lookup" | "save" | null>(null);
  const [saved, setSaved] = useState<{ title: string; target: string | null } | null>(null);
  const [busy, setBusy] = useState(true);
  const c = theme.colors;

  const load = async () => {
    const seq = ++generation.current;
    setBusy(true); setError(null);
    try {
      const result = await listRef.current({});
      if (generation.current === seq) setRows(result.sessions);
    } catch {
      if (generation.current === seq) { setRows([]); setError("lookup"); }
    } finally {
      if (generation.current === seq) setBusy(false);
    }
  };
  useEffect(() => {
    void load();
    return () => { generation.current++; };
  }, []);

  const session = rows.find(row => row.sessionId === chosen);
  const eligible = session ? projects.filter(p => p.selected && p.id !== session.sourceProjectId) : [];
  const destination = eligible.find(p => p.id === target);
  const keyword = query.trim().toLocaleLowerCase();
  const filtered = rows.filter(row => [row.title, row.sessionId, row.workspaceTitle, row.sourceProjectTitle, row.sourceProjectId].some(v => v.toLocaleLowerCase().includes(keyword)));
  function start(row: Entry) {
    setChosen(row.sessionId); setTarget(null); setError(null); setSaved(null);
  }
  async function change(next: Projects[number] | null) {
    if (busy || sending.current || !session || (!session.available && next) || session.targetProjectId === (next?.id ?? null)) return;
    const seq = generation.current;
    sending.current = true; setBusy(true); setError(null); setSaved(null);
    try {
      await save({ sessionId: session.sessionId, sourceProjectId: session.sourceProjectId,
        expectedTargetProjectId: session.targetProjectId, targetProjectId: next?.id ?? null });
      onChange();
      if (seq !== generation.current) return;
      setSaved({ title: session.title, target: next ? projectName(next, projects) : null });
      setTarget(null);
      await load();
    } catch {
      if (seq === generation.current) setError("save");
    } finally {
      sending.current = false;
      if (seq === generation.current) setBusy(false);
    }
  }
  const currentProject = projects.find(p => p.id === session?.targetProjectId);
  const currentLabel = currentProject ? projectName(currentProject, projects) : session?.targetProjectId;
  return <View style={{ gap: 8 }}>
    <Text style={{ color: c.foregroundMuted }}>{t("한 세션의 대화와 결정을 선택한 프로젝트의 다이제스트에 포함합니다. 세션과 파일은 원래 워크스페이스에 남습니다.", "Include one session's conversation and decisions in a managed project's digest. The session and files stay in their original workspace.")}</Text>
    <TextInput accessibilityLabel={t("연결할 세션 검색", "Search sessions to link")} value={query} placeholder={t("세션, 프로젝트 또는 ID 검색", "Search by session, project or ID")}
      onChangeText={value => {
        setQuery(value); setLimit(12); setChosen(null); setTarget(null); setSaved(null);
        if (error === "save") setError(null);
      }} style={{ color: c.foreground, padding: 8, borderColor: c.border, borderWidth: 1, borderRadius: 7 }} />
    {busy && <Text accessibilityLiveRegion="polite" style={{ color: c.foregroundMuted }}>{t("확인 중…", "Loading…")}</Text>}
    {!!error && <View style={{ gap: 5 }}>
      <Text accessibilityLiveRegion="polite" style={{ color: c.statusDanger }}>{error === "lookup"
        ? t("세션 목록을 읽지 못했습니다.", "Could not load sessions.")
        : t("연결 상태를 확인하지 못했습니다. 목록을 새로 고쳐 다시 확인해 주세요.", "The link change was not confirmed. Refresh the list to check its current state.")}</Text>
      <Button theme={theme} label={t("세션 연결 목록 새로 고침", "Refresh session links")} disabled={busy} onPress={() => { setTarget(null); void load(); }} />
    </View>}
    {!!saved && <Text accessibilityLiveRegion="polite" style={{ color: c.statusSuccess }}>{saved.target
      ? t(`${saved.title} → ${saved.target} 연결됨`, `Linked ${saved.title} to ${saved.target}.`)
      : t(`${saved.title} 연결을 해제했습니다.`, `Unlinked ${saved.title}.`)}</Text>}
    {!busy && !error && !filtered.length && <Text style={{ color: c.foregroundMuted }}>{t("일치하는 세션이 없습니다.", "No matching sessions.")}</Text>}
    {filtered.slice(0, limit).map(row => {
      const name = [row.title, row.sourceProjectTitle, row.workspaceTitle, row.sessionId].filter(Boolean).join(" · ");
      return <Button key={row.sessionId} theme={theme} project={row.sourceProjectTitle} selected={chosen === row.sessionId} disabled={busy}
        label={name + (row.available ? "" : t(" · 세션 없음", " · Missing session"))} onPress={() => start(row)} />;
    })}
    {limit < filtered.length && <Button theme={theme} label={t(`세션 더 보기 (${filtered.length - limit})`, `Show more sessions (${filtered.length - limit})`)} onPress={() => setLimit(limit + 12)} />}
    {!!session && <View style={{ gap: 7, padding: 10, borderColor: c.border, borderWidth: 1, borderRadius: 8 }}>
      <Text selectable style={{ color: c.foreground, fontWeight: "600" }}>{session.title}</Text>
      <Text selectable style={{ color: c.foregroundMuted }}>{t("원래 소속", "Source")} · {session.sourceProjectTitle} · {session.workspaceTitle}</Text>
      {!!currentLabel && <Text style={{ color: c.foregroundMuted }}>{t("연결된 프로젝트", "Linked project")} · {currentLabel}</Text>}
      {session.available && <>
        {!eligible.length && <Text style={{ color: c.foregroundMuted }}>{t("원래 소속과 다른 관리 프로젝트를 먼저 선택해 주세요.", "Select a managed project other than the source project first.")}</Text>}
        {!!eligible.length && <Text style={{ color: c.foreground }}>{t("연결 대상 프로젝트", "Destination project")}</Text>}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 5 }}>
          {eligible.map(p => <Button theme={theme} key={p.id} disabled={busy || p.id === session.targetProjectId}
            project={p.title} label={projectName(p, projects)} selected={p.id === target} onPress={() => { setTarget(p.id); setSaved(null); }} />)}
        </View>
        {!!destination && <Button theme={theme} disabled={busy} label={t("이 프로젝트에 연결", "Link to this project")} onPress={() => void change(destination)} />}
      </>}
      {!!session.targetProjectId && <Button theme={theme} disabled={busy} label={t("프로젝트 연결 해제", "Unlink from project")} onPress={() => void change(null)} />}
    </View>}
  </View>;
}

export function SessionLinks(props: Props) {
  const { t } = useBoardLanguage();
  const [opened, setOpened] = useState(false);
  return <SettingsDisclosure theme={props.theme} title={t("다른 프로젝트의 세션 하나 연결", "Link a session from another project")} expanded={opened} onPress={() => setOpened(!opened)}>
    <LinkPicker {...props} />
  </SettingsDisclosure>;
}
