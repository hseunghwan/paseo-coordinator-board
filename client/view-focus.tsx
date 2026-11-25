import { useEffect, useRef, useState } from "react";
import { Platform, ScrollView, Text, View } from "react-native";
import type { BoardLayoutProps, DecisionEntry } from "./board-layout";
import { Button, RunningMark, SectionLabel, space, fontSize, StatusBadge, StatusDot, type Theme } from "./controls";
import { decisionGroupLabel } from "./decision-row";
import {
  deferFocus, focusKeyAction, focusNeedsEmptyNotice, focusProgress, focusRail, isProcessed, railCell, resolveFocus, stepFocus,
  type FocusKeyAction, type RailCell,
} from "./focus-queue";
import { focusActivity, runningMarks } from "./focus-status";
import { useBoardLanguage, type Translate } from "./language";
import { tint, toneColor } from "./tone";

const web = Platform.OS === "web";

// One decision at a time in a single centered column, with the rest of the queue kept mounted behind it.
export function FocusView(props: BoardLayoutProps) {
  const { theme, compact, entries, renderReceipt, slots, projects } = props;
  const { t } = useBoardLanguage();
  const c = theme.colors;
  const [width, setWidth] = useState<number | null>(null);
  const narrow = compact || (width !== null && width < 600);
  const pad = narrow ? space[3] : space[6];

  // "Later" lasts for this visit only, so it lives in component state and is never saved.
  const [deferred, setDeferred] = useState<string[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);
  const lastQueue = useRef<string[]>([]);
  const rail = focusRail(entries, deferred);
  const queue = rail.filter(entry => entry.row !== null).map(entry => entry.key);
  const current = resolveFocus(chosen, lastQueue.current, queue);
  useEffect(() => {
    lastQueue.current = queue;
    if (current !== chosen) setChosen(current);
  });

  const [operationsOpen, setOperationsOpen] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);

  const index = current === null ? -1 : queue.indexOf(current);
  const act = (action: FocusKeyAction) => {
    if (action === "next") setChosen(stepFocus(queue, current, 1));
    else if (action === "previous") setChosen(stepFocus(queue, current, -1));
    else if (queue.length > 1) {
      const result = deferFocus(entries, deferred, current);
      setDeferred(result.deferred);
      setChosen(result.current);
    }
  };
  const latest = useRef(act);
  latest.current = act;
  useEffect(() => {
    if (!web || typeof document === "undefined") return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target instanceof Element ? event.target as HTMLElement : null;
      const action = focusKeyAction({ key: event.key, ctrlKey: event.ctrlKey, metaKey: event.metaKey, altKey: event.altKey,
        defaultPrevented: event.defaultPrevented, target: target && { tagName: target.tagName, isContentEditable: target.isContentEditable } });
      if (!action) return;
      event.preventDefault();
      latest.current(action);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const byKey = new Map(entries.map(entry => [entry.key, entry]));
  const currentEntry = current === null ? undefined : byKey.get(current);
  const nextEntry = index < 0 ? undefined : byKey.get(queue[index + 1] ?? "");
  const progress = focusProgress(rail, current);
  const processed = entries.filter(isProcessed);
  const projectLine = (entry: DecisionEntry) => [...new Set(entry.summary?.projectIds.map(projects.name) ?? [])].join(", ");
  const approve = t("세션에서 승인", "Approve in session");
  const emptyNotice = focusNeedsEmptyNotice({ queue, total: props.total, filtered: props.filtered, filteredTotal: props.filteredTotal, incomplete: props.incomplete });

  return <View style={{ flex: 1, minHeight: 0, backgroundColor: c.surface0 }} onLayout={event => setWidth(event.nativeEvent.layout.width)}>
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: pad, alignItems: "center" }}>
      <View style={{ width: "100%", maxWidth: 720, gap: space[4] }}>
        <View style={{ gap: space[2] }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "flex-start", gap: space[2] }}>
            <View style={{ flexGrow: 1, flexShrink: 1, flexBasis: 200, minWidth: 0 }}>{slots.filters}</View>
            <Button theme={theme} variant="secondary" size="sm" label={t("코디네이터에 요청", "Ask coordinator")} expanded={operationsOpen}
              onPress={() => setOperationsOpen(open => !open)} />
          </View>
          {operationsOpen && slots.operations}
          {rail.length > 0 && <View style={{ flexDirection: "row", alignItems: "center", gap: space[3] }}>
            <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ flex: 1, flexDirection: "row", gap: space[1] }}>
              {rail.map(entry => <RailMark key={entry.key} cell={railCell(entry, current)} tone={entry.summary?.tone ?? "muted"} theme={theme} />)}
            </View>
            <Text accessibilityLiveRegion="polite" style={{ color: c.foregroundMuted, fontSize: fontSize.sm }}>
              {progress.position === null
                ? t(`처리 ${progress.processed}건`, `${progress.processed} done`)
                : t(`${progress.position} / ${progress.total} · 처리 ${progress.processed}건`, `${progress.position} of ${progress.total} · ${progress.processed} done`)}
            </Text>
          </View>}
        </View>

        {slots.notices}
        {emptyNotice && <Text style={{ color: c.foregroundMuted }}>{t("지금 결정할 일이 없습니다.", "No decisions are waiting for you.")}</Text>}

        <View style={currentEntry ? { gap: space[4], padding: narrow ? space[3] : space[6], backgroundColor: c.surface1, borderWidth: 1, borderColor: c.border, borderRadius: 16 } : undefined}>
          {currentEntry?.summary && <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space[2] }}>
            <StatusBadge theme={theme} tone={currentEntry.summary.tone} label={currentEntry.label ?? decisionGroupLabel(currentEntry.summary.group, t)} />
            {!!projectLine(currentEntry) && <Text numberOfLines={1} style={{ flexShrink: 1, color: c.foregroundMuted, fontSize: fontSize.sm }}>{projectLine(currentEntry)}</Text>}
            {currentEntry.summary.permission && <Text style={{ color: c.statusWarning, fontSize: fontSize.sm }}>{approve}</Text>}
          </View>}
          {currentEntry?.receipts.map(renderReceipt)}
          {/* Every card stays mounted so a half-written reply survives moving to another decision. */}
          {entries.map(entry => entry.card && <View key={entry.key} style={entry.key === current ? undefined : { display: "none" }}>{entry.card}</View>)}
        </View>

        {currentEntry && <View style={{ gap: space[2] }}>
          <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space[2] }}>
            <Button theme={theme} variant="ghost" size="sm" label={t("이전", "Previous")} disabled={index <= 0} onPress={() => act("previous")} />
            <Button theme={theme} variant="ghost" size="sm" label={t("나중에", "Later")} disabled={queue.length < 2} onPress={() => act("defer")} />
            {web && !narrow && <Text style={{ color: c.foregroundMuted, fontSize: fontSize.sm }}>{t("J 다음 · K 이전 · S 나중에", "J next · K previous · S later")}</Text>}
            <View style={{ flex: 1 }} />
            <Button theme={theme} variant="ghost" label={t("다음", "Next")} disabled={index < 0 || index >= queue.length - 1} onPress={() => act("next")} />
          </View>
          {nextEntry?.summary && <View style={{ gap: space[1] }}>
            <SectionLabel theme={theme}>{t("다음 차례", "Up next")}</SectionLabel>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
              <StatusDot theme={theme} tone={nextEntry.summary.tone} />
              <Text numberOfLines={1} style={{ flexShrink: 1, color: c.foregroundMuted, fontSize: fontSize.sm }}>
                {[nextEntry.summary.title, projectLine(nextEntry), nextEntry.summary.permission ? approve : ""].filter(Boolean).join(" · ")}
              </Text>
            </View>
          </View>}
        </View>}

        {processed.length > 0 && <View style={{ gap: space[1] }}>
          <SectionLabel theme={theme} count={processed.length}>{t("처리한 결정", "Handled decisions")}</SectionLabel>
          {processed.flatMap(entry => entry.receipts.map(renderReceipt))}
        </View>}

        {progressOpen && <View style={{ gap: space[4] }}>
          {slots.progress}
          {slots.history}
        </View>}
      </View>
    </ScrollView>
    <ActivityStrip props={props} pad={pad} open={progressOpen} onToggle={() => setProgressOpen(open => !open)} t={t} />
  </View>;
}

function RailMark({ cell, tone, theme }: { cell: RailCell; tone: "danger" | "warning" | "success" | "muted"; theme: Theme }) {
  const c = theme.colors;
  const status = tone === "danger" || tone === "warning" ? toneColor(c, tone) : c.border;
  const fill = cell === "done" ? c.statusSuccess : cell === "current" ? c.foreground : cell === "waiting" ? tint(status) ?? c.surface2 : c.surface2;
  return <View style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: fill,
    borderWidth: cell === "waiting" ? 1 : 0, borderColor: cell === "waiting" ? status : "transparent" }} />;
}

function ActivityStrip({ props, pad, open, onToggle, t }: { props: BoardLayoutProps; pad: number; open: boolean; onToggle: () => void; t: Translate }) {
  const { theme, projects } = props;
  const c = theme.colors;
  const activity = focusActivity(projects.list, projects.peers, projects.name);
  const runningLabel = t("진행 중", "Running");
  return <View style={{ flexDirection: "row", alignItems: "center", gap: space[3], paddingHorizontal: pad, paddingVertical: space[2],
    borderTopWidth: 1, borderColor: c.border, backgroundColor: c.surface0 }}>
    <View style={{ flex: 1, minWidth: 0, flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: space[4], rowGap: space[1] }}>
      <SectionLabel theme={theme} count={activity.running}>{runningLabel}</SectionLabel>
      {activity.projects.map(project => {
        const { marks, extra } = runningMarks(project.running);
        return <View key={project.id} accessible accessibilityLabel={[project.name, t(`진행 중 ${project.running}`, `${project.running} running`),
          project.attention ? t("확인 대기 또는 오류", "Needs review or failed") : ""].filter(Boolean).join(" · ")}
          style={{ flexDirection: "row", alignItems: "center", gap: space[1] }}>
          <Text numberOfLines={1} style={{ color: c.foreground, fontSize: fontSize.sm, maxWidth: 160 }}>{project.name}</Text>
          {Array.from({ length: marks }, (_, i) => <RunningMark key={i} theme={theme} />)}
          {extra > 0 && <Text style={{ color: c.foregroundMuted, fontSize: fontSize.sm }}>+{extra}</Text>}
          {project.attention && <StatusDot theme={theme} tone="danger" />}
        </View>;
      })}
    </View>
    <Button theme={theme} variant="ghost" size="sm" label={open ? t("진행 닫기", "Hide progress") : t("진행 보기", "Show progress")} expanded={open} onPress={onToggle} />
  </View>;
}
