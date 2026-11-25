import { useDecisionInteraction } from "./decision-editing";
import { openExternalUrl, useRpc } from "@getpaseo/plugin/client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Platform, Text, TextInput, View } from "react-native";
import { confirmPullRequestMerge, previewPullRequestMerge, pullUrl, readPullLifecycle, setProjectRepository, type MergeMethod, type MergePreview, type MergeReason, type MergeResult, type PullRequestView } from "../shared/prs";
import { Button, ProjectText, Disclosure, SessionChip, type Theme } from "./controls";
import { mergeNotificationLabel } from "./merge-notification";
import { useBoardLanguage, type Translate } from "./language";

type PullRequest = PullRequestView["items"][number];
const labels = {
  ready: ["병합 검토 가능", "Ready for merge review"], draft: ["초안", "Draft"],
  conflict: ["충돌 해결 필요", "Conflicts to resolve"], "checks-failed": ["검사 실패", "Checks failed"],
  "checks-pending": ["검사 중", "Checks pending"], "changes-requested": ["수정 요청", "Changes requested"],
  blocked: ["병합 조건 대기", "Merge requirements pending"], unknown: ["상태 미확인", "Status unknown"],
  "auto-merge": ["자동 병합 대기", "Auto-merge enabled"],
} as const;

export type MergeNotice = { projectId: string; target: string; status: MergeResult["status"]; reason?: MergeReason; mergeSha?: string | null; notification?: MergeResult["notification"] };
const wrap = { flexDirection: "row" as const, flexWrap: "wrap" as const, gap: 6 };

const resultWords = {
  merged: ["병합을 확인했습니다.", "Merge confirmed."],
  "already-merged": ["이미 병합된 PR입니다.", "This pull request has already merged."],
  changed: ["최신 정보로 병합 미리보기를 다시 여세요.", "Open a new preview to review the latest state."],
  blocked: ["현재 병합할 수 없습니다. GitHub에서 상태를 확인하세요.", "Merge is currently blocked. Check the pull request on GitHub."],
  unconfirmed: ["병합 결과를 확인하지 못했습니다. GitHub에서 현재 상태를 확인하세요.", "Merge result unknown. Check the current state on GitHub."],
} as const;

function reasonText(reason: MergeReason | undefined, t: Translate) {
  if (!reason) return null;
  const reasons: Partial<Record<MergeReason, readonly [string, string]>> = {
    ...labels,
    closed: ["닫힌 PR", "Pull request closed"],
    queue: ["GitHub 병합 대기열 사용", "The repository uses a merge queue"],
    permission: ["GitHub 병합 권한 확인 필요", "Check GitHub merge permissions"],
    "no-method": ["저장소에서 허용한 병합 방식 없음", "No allowed merge method"],
    expired: ["병합 미리보기 만료", "Preview expired"],
    scope: ["관리 프로젝트의 저장소 연결이 변경됨", "The managed project's repository mapping changed"],
    unavailable: ["GitHub 상태 조회 불가", "Could not read GitHub state"],
  };
  const words = reasons[reason];
  if (words && reason !== "ready" && reason !== "blocked") return t(words[0], words[1]);
  return null;
}

export function MergeFeedback({ notice, theme }: { notice: MergeNotice; theme: Theme }) {
  const { t } = useBoardLanguage();
  const words = resultWords[notice.status];
  const reason = reasonText(notice.reason, t);
  const delivery = mergeNotificationLabel(notice.notification, t);
  const deliveryColor = notice.notification?.status === "unavailable" || notice.notification?.status === "unconfirmed"
    ? theme.colors.statusWarning : theme.colors.foregroundMuted;
  return <Text accessibilityLiveRegion="polite" selectable style={{ color: ["merged", "already-merged"].includes(notice.status) ? theme.colors.statusSuccess : theme.colors.statusWarning }}>
    {[notice.target, t(words[0], words[1]), reason, notice.mergeSha?.slice(0, 12)].filter(Boolean).join(" · ")}
    {delivery && <Text style={{ color: deliveryColor }}>{" · "}{delivery}</Text>}
  </Text>;
}

export type WorkSessionLink = { key: string; label: string; open: () => void };

function GitHubPullLink({repo, number, theme}: {repo:string; number:number; theme:Theme}) {
  const {t} = useBoardLanguage();
  const [failed, setFailed] = useState(false);
  const url = pullUrl(repo, number);
  const label = repo + " #" + number;
  return <>
    <Text accessibilityRole="link" accessibilityLabel={label + " · " + t("GitHub에서 보기", "View on GitHub")}
      {...(Platform.OS === "web" && { href:url, hrefAttrs:{target:"_blank", rel:"noopener noreferrer"} })}
      onPress={event => { event.preventDefault(); void openExternalUrl(url).then(() => setFailed(false), () => setFailed(true)); }}
      style={{ maxWidth:"100%", color:theme.colors.foreground, textDecorationLine:"underline", fontSize:13 }}>{label}</Text>
    {failed && <Text selectable style={{color:theme.colors.foregroundMuted}}>{url}</Text>}
  </>;
}

type Lifecycle = ReturnType<typeof readPullLifecycle.output.parse>["state"];
export function TrackedPullStatus({repo, number, projectId, theme, securityGate}: {repo:string; number:number; projectId:string|null; theme:Theme; securityGate:boolean}) {
  const {t} = useBoardLanguage();
  const lookup = useRpc(readPullLifecycle);
  const [state, setState] = useState<Lifecycle | null>(null);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    setState(null);
    async function refresh() {
      let current: Lifecycle = "UNKNOWN";
      if (projectId) {
        try { current = (await lookup({repo, number, projectId})).state; } catch { /* Show the link when GitHub is unavailable. */ }
      }
      if (!active) return;
      setState(current);
      if (projectId && current !== "MERGED") timer = setTimeout(() => void refresh(), 60_000);
    }
    void refresh();
    return () => { active = false; clearTimeout(timer); };
  }, [repo, number, projectId, lookup]);
  const message = state === "MERGED" ? t("병합 완료", "Merged")
    : state === "CLOSED" ? t("병합 없이 닫힘", "Closed without merging")
    : state === "OPEN" && securityGate ? t("열린 PR · 보안 게이트 통과 여부 확인 필요", "Open · Security gate unverified")
    : state === "OPEN" ? t("열린 PR · 병합 조건 미확인", "Open · Merge requirements unverified")
    : state === "UNKNOWN" ? t("PR 상태 미확인", "Pull request status unavailable")
    : t("GitHub 상태 확인 중…", "Checking GitHub status…");
  return <View style={{...wrap, alignItems:"baseline"}}>
    <GitHubPullLink repo={repo} number={number} theme={theme} />
    <Text selectable accessibilityLiveRegion="polite" style={{color:state === "MERGED" ? theme.colors.statusSuccess : theme.colors.foregroundMuted}}>{message}</Text>
  </View>;
}

export function PullRequestCard({ pr, projectId, theme, decision = false, showDivider = true, securityGate = false, openCoordinator, workSessions, onResult, clarification, priorityLabel }: {
  pr: PullRequest; projectId: string; theme: Theme; workSessions: WorkSessionLink[]; decision?: boolean; showDivider?: boolean; securityGate?: boolean; openCoordinator?: () => void; onResult: (notice: MergeNotice) => void; clarification?: ReactNode; priorityLabel?: string;
}) {
  const { t } = useBoardLanguage();
  const c = theme.colors;
  const read = useRpc(previewPullRequestMerge);
  const merge = useRpc(confirmPullRequestMerge);
  const [preview, setPreview] = useState<MergePreview | null>(null);
  const [method, setMethod] = useState<MergeMethod | null>(null);
  const [notice, setNotice] = useState<MergeNotice | null>(null);
  const [lookupError, setLookupError] = useState(false);
  const [busy, setBusy] = useState<"read" | "merge" | null>(null);
  const locked = useRef(false);
  const target = pr.repo + " #" + pr.number;
  const named = (label: string) => ({label, accessibilityLabel: target + " · " + label});
  const ready = !securityGate && !!projectId && pr.lane === "review" && pr.reason === "ready" && notice?.status !== "merged" && notice?.status !== "already-merged";
  useDecisionInteraction(!!busy || (ready && !!preview));
  const status = securityGate && pr.reason === "ready" ? t("열린 PR · 보안 게이트 통과 여부 확인 필요", "Open · Security gate unverified") : t(labels[pr.reason][0], labels[pr.reason][1]);
  const args = { projectId, repo: pr.repo, number: pr.number };

  async function inspect() {
    if (locked.current || !ready) return;
    locked.current = true; setBusy("read"); setNotice(null); setLookupError(false);
    try {
      const next = await read(args);
      if (next.status === "ready" && next.token && next.methods.length) {
        setPreview(next); setMethod(next.defaultMethod && next.methods.includes(next.defaultMethod) ? next.defaultMethod : null);
      } else {
        const feedback: MergeNotice = { projectId, target, status: next.status === "merged" ? "already-merged" : "blocked", reason: next.reason };
        setNotice(feedback); onResult(feedback);
      }
    } catch { setLookupError(true); }
    finally { locked.current = false; setBusy(null); }
  }
  async function confirm() {
    if (locked.current || !ready || !preview?.token || !method || !preview.methods.includes(method)) return;
    locked.current = true; setBusy("merge");
    let feedback: MergeNotice;
    try {
      const result = await merge({ ...args, token: preview.token, method });
      feedback = { projectId, target, ...result };
    } catch { feedback = { projectId, target, status: "unconfirmed" }; }
    finally { locked.current = false; setBusy(null); setPreview(null); setMethod(null); }
    setNotice(feedback); onResult(feedback);
  }
  return <View style={[{gap: 6}, showDivider && {borderTopColor: c.border, borderTopWidth: 1, paddingVertical: 8}]}>
    <View style={{ ...wrap, alignItems: "baseline" }}>
      <GitHubPullLink repo={pr.repo} number={pr.number} theme={theme} />
      <Text selectable style={{ color: c.foregroundMuted, fontSize: 12 }}>· {[status, priorityLabel].filter(Boolean).join(" · ")}</Text>
      {workSessions.map(link => <SessionChip key={link.key} label={link.label} theme={theme}
        accessibilityLabel={target + " · " + link.label} onPress={link.open} />)}
      {!workSessions.length && <Text style={{color:c.foregroundMuted,fontSize:12}}>{t("작업 세션 미확인", "No verified work session")}</Text>}
      {decision && openCoordinator && <SessionChip theme={theme} label={t("코디네이터 세션", "Coordinator session")} accessibilityLabel={named(t("코디네이터 세션 열기", "Open coordinator session")).accessibilityLabel} onPress={openCoordinator} />}
    </View>
    <Text selectable style={{color: c.foreground, fontSize: 15, fontWeight: "600"}}>{preview?.title || pr.title}</Text>
    {preview && ready && <View style={{gap: 7, padding: 10, borderWidth: 1, borderRadius: 7, borderColor: c.border, backgroundColor: c.surface0}}>
      <Text selectable style={{color: c.foreground, fontWeight: "600"}}>{preview.baseRef} ← {preview.headRef}</Text>
      <Text selectable style={{color: c.foregroundMuted, fontSize: 12}}>{t("검토한 HEAD", "Reviewed HEAD")} · {preview.headSha}</Text>
      <Text selectable style={{color: c.foregroundMuted, fontSize: 12}}>{t("대상 브랜치 SHA", "Base SHA")} · {preview.baseSha}</Text>
      <Text selectable style={{color: c.foreground}}>{t("검사 상태", "Checks")} · {preview.checks ? t(`${preview.checks}건 완료`, `${preview.checks} completed`) : t("보고된 검사 없음", "No reported checks")}</Text>
      {openCoordinator && <Text style={{ color: c.foregroundMuted, fontSize: 13 }}>
        {t("병합되면 코디네이터에 후속 작업을 요청합니다.", "After the merge, the board asks the coordinator to follow up.")}
      </Text>}
      <Text style={{color: c.foreground, fontWeight: "600"}}>{t("병합 방식", "Merge method")}</Text>
      <View style={wrap}>{preview.methods.map(option => <Button key={option} theme={theme} {...named(option)} selected={method === option} disabled={!!busy} onPress={() => setMethod(option)} />)}</View>
      <View style={wrap}>
        <Button theme={theme} {...named(busy === "merge" ? t("병합 확인 중…", "Confirming merge…") : t("병합 확정", "Confirm merge"))} selected disabled={!method || !!busy} onPress={() => void confirm()} />
        <Button theme={theme} {...named(t("취소", "Cancel"))} disabled={!!busy} onPress={() => { setPreview(null); setMethod(null); }} />
      </View>
    </View>}
    {((ready && !preview) || clarification) && <View style={wrap}>
      {ready && !preview && <Button theme={theme} {...named(busy === "read" ? t("병합 정보 조회 중…", "Loading merge details…") : t("보드에서 병합", "Merge on board"))} selected={decision} disabled={!!busy} onPress={() => void inspect()} />}
      {clarification}
    </View>}
    {lookupError && <Text accessibilityLiveRegion="polite" style={{color:c.statusWarning}}>{t("병합 정보를 불러오지 못했습니다. 다시 조회하거나 GitHub에서 확인하세요.", "Could not load merge details. Try again or open GitHub.")}</Text>}
    {notice && notice.status !== "merged" && notice.status !== "already-merged" && <MergeFeedback notice={notice} theme={theme} />}
  </View>;
}

export function PullRequestSettings({view, names, theme, refresh}: {view: PullRequestView; names: Map<string,string>; theme: Theme; refresh: () => void}) {
  const {t} = useBoardLanguage();
  const [expanded, setExpanded] = useState(false);
  return <Disclosure theme={theme} title={t("프로젝트별 GitHub 저장소", "GitHub repositories by project")} expanded={expanded} onPress={() => setExpanded(!expanded)}>
    {view.projects.map(project => <RepositorySetting key={JSON.stringify([project.projectId, project.mode, project.repo])} project={project} title={names.get(project.projectId) ?? project.projectId} theme={theme} refresh={refresh}/>)}
  </Disclosure>;
}

function RepositorySetting({project, title, theme, refresh}: {project: PullRequestView["projects"][number]; title:string; theme:Theme; refresh:()=>void}) {
  const {t} = useBoardLanguage();
  const setRepo = useRpc(setProjectRepository);
  const [repo, setText] = useState(project.repo ?? "");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const c = theme.colors;
  async function change(mode: "auto"|"off"|"manual") {
    if (pending) return;
    setPending(true);
    try {
      await setRepo({projectId:project.projectId, mode, ...(mode === "manual" ? {repo:repo.trim()} : {}), expectedMode:project.mode, expectedRepo:project.repo});
      setError(false); refresh();
    } catch { setError(true); } finally { setPending(false); }
  }
  const states = {ok:t("조회됨","Connected"), unmapped:t("저장소 연결 필요","Link a repository"), unavailable:t("조회 실패 · 호스트의 gh 연결 확인","Lookup failed · Check gh on the host"), off:t("꺼짐","Off"), truncated:t("일부 PR만 표시","Showing a partial PR list")};
  return <View style={{gap:6,padding:10,backgroundColor:c.surface1,borderRadius:8}}>
    <ProjectText theme={theme} projectId={project.projectId} projects={[title]} selectable style={{color:c.foreground,fontWeight:"600"}}>{title}</ProjectText>
    <Text selectable style={{color:c.foregroundMuted}}>{project.repo ? project.repo + " · " : ""}{states[project.status]}</Text>
    <TextInput accessibilityLabel={t(title+" GitHub 저장소",title+" GitHub repository")} placeholder="owner/repository" autoCapitalize="none" autoCorrect={false}
      value={repo} onChangeText={setText} placeholderTextColor={c.foregroundMuted} style={{color:c.foreground,borderColor:c.border,borderWidth:1,borderRadius:6,padding:7}}/>
    <View style={{flexDirection:"row",flexWrap:"wrap",gap:5}}>
      <Button theme={theme} label={t("저장소 연결", "Link repository")} disabled={pending || !repo.trim()} onPress={() => void change("manual")} />
      <Button theme={theme} selected={project.mode==="auto"} disabled={pending || project.mode==="auto"} label={t("자동 감지","Auto-detect")} onPress={() => void change("auto")}/>
      <Button theme={theme} selected={project.mode==="off"} disabled={pending || project.mode==="off"} label={t("PR 조회 끄기","Turn off PR lookup")} onPress={() => void change("off")}/>
    </View>
    {error && <Text accessibilityLiveRegion="polite" style={{color:c.statusDanger}}>{t("저장소 이름과 최신 프로젝트 설정을 확인해 주세요.","Check the repository name and refresh this project's settings.")}</Text>}
  </View>;
}
