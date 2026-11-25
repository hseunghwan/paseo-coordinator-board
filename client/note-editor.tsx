import { useBoardLanguage } from "./language";
import { Modal, TextInput } from "@getpaseo/plugin/client/ui";
import { useRef, useState } from "react";
import { Text, View } from "react-native";
import { Button, ProjectText, type Theme } from "./controls";
import { noteLabel, noteLabels, type Note, type NoteInput, type Session } from "./model";

type Props = {
  session: Session; note?: Note; theme: Theme; onClose: () => void;
  onSetReporting: (enabled: boolean) => Promise<boolean>;
  onSave: (input: NoteInput) => Promise<{ ok: boolean; conflict: boolean }>;
};

export function NoteEditor({ session, note, theme, onClose, onSave, onSetReporting }: Props) {
  const { t } = useBoardLanguage();
  const notices = {
    reporting: t("보고 설정을 저장하지 못했습니다.", "Could not save reporting settings."),
    connection: t("호스트에 연결할 수 없어 보고 설정을 저장하지 못했습니다.", "Could not connect to the host to save reporting settings."),
    conflict: t("다른 곳에서 기록을 수정했습니다. 최신 기록을 확인해 주세요.", "This note changed elsewhere. Review the latest version."),
    save: t("기록을 저장하지 못했습니다. 다시 시도해 주세요.", "Could not save the note. Try again."),
    host: t("호스트에 저장하지 못했습니다. 연결을 확인하고 다시 시도해 주세요.", "Could not save to the host. Check the connection and try again."),
  };
  const c = theme.colors;
  const [kind, setKind] = useState<keyof typeof noteLabels>(note && note.kind !== "clear" ? note.kind : "question");
  const [text, setText] = useState(note?.text ?? "");
  const [evidenceId] = useState(session.evidenceId);
  const [revision, setRevision] = useState(note?.revision ?? 0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<keyof typeof notices | null>(null);
  const submitting = useRef(false);
  async function toggleReporting() {
    if (submitting.current) return;
    submitting.current = true;
    setBusy(true);
    setMessage(null);
    try {
      const ok = await onSetReporting(!session.reporting);
      if (!ok) setMessage("reporting");
    } catch {
      setMessage("connection");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  const conflict = revision !== (note?.revision ?? 0);
  async function submit(as: NoteInput["kind"]) {
    if (submitting.current || conflict || (as !== "clear" && !text.trim())) return;
    submitting.current = true;
    setBusy(true);
    setMessage(null);
    try {
      const result = await onSave({ sessionId: session.id, expectedRevision: revision, evidenceId, kind: as, text: as === "clear" ? "" : text.trim() });
      if (result.ok) onClose();
      else setMessage(result.conflict ? "conflict" : "save");
    } catch {
      setMessage("host");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  return (
    <Modal title={t("세션 기록", "Session note")} open onOpenChange={(open) => { if (!open && !submitting.current) onClose(); }}>
      <Modal.Content>
        <Text style={{ fontSize: 17, fontWeight: "600", color: c.foreground }}>{session.title}</Text>
        <ProjectText theme={theme} projectId={session.projectId} projects={[session.projectTitle]} style={{ fontSize: 13, color: c.foregroundMuted }}>{session.projectTitle} · {session.workspaceTitle}</ProjectText>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6 }}>
          {(["question", "review", "done"] as const).map((type) => (
            <Button key={type} label={noteLabel(type, t)} theme={theme} selected={kind === type} disabled={busy} onPress={() => setKind(type)} />
          ))}
        </View>
        {note?.origin === "agent" && note.kind !== "clear" &&
          <Text style={{ color: c.foregroundMuted }}>{t("세션이 남긴 보고입니다. 원문에서 결과를 확인하고 기록을 저장하세요.", "The session submitted this report. Verify the result in the original conversation before saving.")}</Text>}
        <TextInput accessibilityLabel={noteLabel(kind, t)} multiline maxLength={2000} editable={!busy} value={text} onChangeText={setText}
          placeholder={{ question: t("어떤 결정을 내려야 하나요?", "What decision is needed?"), review: t("무엇을 확인하면 될까요?", "What needs review?"), done: t("완료를 확인한 결과나 링크를 적어 주세요.", "Add a result or link that confirms completion.") }[kind]}
          placeholderTextColor={c.foregroundMuted}
          style={{ minHeight: 100, textAlignVertical: "top", padding: 12, color: c.foreground, borderRadius: 7, borderWidth: 1, borderColor: c.border, backgroundColor: c.surface0 }} />
        {conflict && <View style={{ gap: 7 }}>
          <Text style={{ color: c.statusWarning }}>{t("편집 중에 기록이 바뀌었습니다. 내 초안은 여기에 남아 있습니다.", "The note changed while you were editing. Your draft is still here.")}</Text>
          <Text style={{ color: c.foreground }}>{note && note.kind !== "clear" ? [t("최신 기록", "Latest note"), noteLabel(note.kind, t), note.text].join(" · ") : t("최신 기록이 해제되었습니다.", "The latest note has been cleared.")}</Text>
          <Button theme={theme} label={t("최신 기록 확인 · 내 초안 계속 편집", "Acknowledge latest note and keep editing")} onPress={() => { setRevision(note?.revision ?? 0); setMessage(null); }} />
        </View>}
        {!!message && <Text accessibilityLiveRegion="polite" style={{ color: c.statusWarning }}>{notices[message]}</Text>}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          <Button theme={theme} label={busy ? t("저장 중…", "Saving…") : t("저장", "Save")} selected disabled={busy || conflict || !text.trim()} onPress={() => void submit(kind)} />
          {note && note.kind !== "clear" &&
            <Button theme={theme} label={t("기록 해제", "Clear note")} disabled={busy || conflict} onPress={() => void submit("clear")} />}
          <Button theme={theme} label={t("취소", "Cancel")} disabled={busy} onPress={onClose} />
        </View>
        <View style={{ gap: 7, borderTopWidth: 1, borderColor: c.border, paddingTop: 10 }}>
          <Text style={{ color: c.foreground, fontWeight: "600" }}>{t("이 세션의 보드 보고 받기", "Board reports from this session")} · {session.reporting ? t("켬", "On") : t("끔", "Off")}</Text>
          <Text style={{ color: c.foregroundMuted, fontSize: 13 }}>{t("Paseo 도구 연결(MCP)을 허용한 호스트에서 쓸 수 있습니다. 켠 세션은 다음에 대화용으로 열릴 때부터 질문과 확인할 결과를 자기 카드에 올릴 수 있습니다.", "Available on hosts that allow Paseo tools (MCP). The next time you open this session for a conversation, it can add questions and results to its card.")}</Text>
          <Button theme={theme} label={session.reporting ? t("보드 보고 끄기", "Turn off board reports") : t("보드 보고 켜기", "Turn on board reports")} disabled={busy} onPress={() => void toggleReporting()} />
        </View>
      </Modal.Content>
    </Modal>
  );
}
