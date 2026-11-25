import { useSettings } from "@getpaseo/plugin/client";
import { useState } from "react";
import { Text, View } from "react-native";
import { SectionLabel, SegmentedControl, fontSize, space, type Theme } from "./controls";
import { useBoardLanguage } from "./language";
import { boardViewDescription, boardViewLabel, boardViewModes, boardViewSetting, defaultBoardViewMode, type BoardViewMode } from "./view-mode";

export function useBoardViewMode() {
  const saved = useSettings(boardViewSetting);
  const [temporary, setTemporary] = useState<BoardViewMode | null>(null);
  const [saveFailed, setSaveFailed] = useState(false);
  const mode = temporary ?? (saved.status === "ready" ? saved.values.mode : defaultBoardViewMode);
  async function select(next: BoardViewMode) {
    if (saved.saving || next === mode) return;
    setTemporary(next);
    setSaveFailed(false);
    if (saved.status === "ready" && await saved.save({ mode: next }, saved.revision)) {
      setTemporary(null);
    } else {
      setSaveFailed(true);
      await saved.reload();
    }
  }
  return { mode, select, saving: saved.saving, saveFailed };
}
export type BoardViewState = ReturnType<typeof useBoardViewMode>;

export function BoardViewSwitch({ view, theme }: { view: BoardViewState; theme: Theme }) {
  const { t } = useBoardLanguage();
  return <SegmentedControl theme={theme} accessibilityLabel={t("보드 보기", "Board view")} value={view.mode} disabled={view.saving}
    options={boardViewModes.map(id => ({ id, label: boardViewLabel(id, t) }))} onChange={id => void view.select(id)} />;
}

export function BoardViewSetting({ view, theme }: { view: BoardViewState; theme: Theme }) {
  const { t } = useBoardLanguage();
  const c = theme.colors;
  return <View style={{ gap: space[2] }}>
    <SectionLabel theme={theme}>{t("보드 보기", "Board view")}</SectionLabel>
    <BoardViewSwitch view={view} theme={theme} />
    <Text style={{ color: c.foregroundMuted, fontSize: fontSize.sm }}>{boardViewDescription(view.mode, t)}</Text>
    {view.saveFailed && <Text accessibilityLiveRegion="polite" style={{ color: c.statusWarning, fontSize: fontSize.sm }}>{t("보기 설정을 이 기기에 저장하지 못했습니다.", "Could not save the view on this device.")}</Text>}
  </View>;
}
