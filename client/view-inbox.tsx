import { useEffect, useRef, useState } from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";
import type { BoardLayoutProps, DecisionEntry } from "./board-layout";
import { Button, SectionLabel, SegmentedControl, StatusDot, fontSize, space, type Theme } from "./controls";
import {
  activeDecisionCount, inboxKeyStep, inboxOrder, inboxRow, inboxRowAccessibilityLabel, inboxSectionLabel, inboxSections,
  isNarrowInbox, keepSelection, stepSelection, type InboxRow, type InboxTab, type KeyTarget,
} from "./inbox";
import { useBoardLanguage } from "./language";

const listWidth = 352;
const keyboard = Platform.OS === "web" && typeof document !== "undefined";

function InboxListRow({ row, selected, theme, onPress }: { row: InboxRow; selected: boolean; theme: Theme; onPress: () => void }) {
  const c = theme.colors;
  return <Pressable accessibilityRole="button" accessibilityState={{ selected }} aria-selected={selected} accessibilityLabel={inboxRowAccessibilityLabel(row)} onPress={onPress}
    style={({ pressed }) => ({ flexDirection: "row", gap: space[2], paddingHorizontal: space[2], paddingVertical: space[2], borderRadius: 8,
      backgroundColor: selected ? c.surface2 : pressed ? c.surface1 : "transparent" })}>
    <View style={{ marginTop: space[1.5] }}><StatusDot tone={row.tone} theme={theme} /></View>
    <View style={{ flex: 1, minWidth: 0, gap: space[0.5] }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space[2] }}>
        <Text numberOfLines={1} style={{ flex: 1, color: c.foreground, fontSize: fontSize.base }}>{row.title}</Text>
        {row.aside && <Text numberOfLines={1} style={{ color: c.foregroundMuted, fontSize: fontSize.sm }}>{row.aside}</Text>}
      </View>
      <Text numberOfLines={1} style={{ color: c.foregroundMuted, fontSize: fontSize.sm }}>{row.meta}</Text>
    </View>
  </Pressable>;
}

// Mail-style inbox: urgency-grouped list on the left, the chosen decision on the right (#4).
// Every card stays mounted and hidden while unselected, so a reply draft survives moving around the list.
export function InboxView({ theme, compact, entries, renderReceipt, slots, projects }: BoardLayoutProps) {
  const { t } = useBoardLanguage();
  const c = theme.colors;
  const [tab, setTab] = useState<InboxTab>("decisions");
  const [width, setWidth] = useState<number | null>(null);
  const [requesting, setRequesting] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);

  const sections = inboxSections(entries);
  const order = inboxOrder(sections);
  const lastOrder = useRef<readonly string[]>(order);
  const selected = keepSelection(lastOrder.current, order, chosen);
  useEffect(() => {
    lastOrder.current = order;
    if (selected !== chosen) setChosen(selected);
  });
  const selectedEntry: DecisionEntry | undefined = entries.find(entry => entry.key === selected);
  const narrow = isNarrowInbox(compact, width);
  const showDetail = narrow && detailOpen && !!selectedEntry;
  const pad = compact ? space[3] : space[6];
  const now = Date.now();

  const detail = useRef<ScrollView>(null);
  useEffect(() => { detail.current?.scrollTo({ y: 0, animated: false }); }, [selected]);

  const step = useRef((_delta: -1 | 1) => {});
  step.current = delta => {
    const next = stepSelection(order, selected, delta);
    if (next !== null) setChosen(next);
  };
  const listening = keyboard && tab === "decisions";
  useEffect(() => {
    if (!listening) return;
    const onKey = (event: KeyboardEvent) => {
      const delta = inboxKeyStep(event, event.target as KeyTarget);
      if (!delta) return;
      event.preventDefault();
      step.current(delta);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [listening]);

  const muted = { color: c.foregroundMuted, fontSize: fontSize.sm };
  const empty = entries.length === 0;
  const permission = !!selectedEntry?.summary?.permission;

  return <View style={{ flex: 1, minHeight: 0 }} onLayout={event => setWidth(event.nativeEvent.layout.width)}>
    <View style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space[2], paddingHorizontal: pad, paddingVertical: space[2], borderBottomWidth: 1, borderColor: c.border }}>
      <SegmentedControl theme={theme} value={tab} onChange={setTab} accessibilityLabel={t("보드 구역", "Board sections")} options={[
        { id: "decisions", label: t(`결정 ${activeDecisionCount(entries)}`, `Decisions ${activeDecisionCount(entries)}`) },
        { id: "progress", label: t("진행", "Progress") },
        { id: "history", label: t("기록", "History") },
      ]} />
      <View style={{ flex: 1 }} />
      {tab === "decisions" && <Button theme={theme} variant="secondary" size="sm" expanded={requesting}
        label={t("코디네이터에 요청", "Ask the coordinator")} onPress={() => setRequesting(open => !open)} />}
    </View>

    {/* Hidden instead of unmounted: the request panel holds its own draft and photos. */}
    <View style={{ display: tab === "decisions" && requesting ? "flex" : "none", maxHeight: "50%", borderBottomWidth: 1, borderColor: c.border }}>
      <ScrollView contentContainerStyle={{ padding: pad, gap: space[4] }}>{slots.operations}</ScrollView>
    </View>

    <View style={{ flex: 1, minHeight: 0, display: tab === "decisions" ? "flex" : "none", flexDirection: narrow ? "column" : "row" }}>
      {empty ? <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: pad, gap: space[4] }}>
        {slots.filters}
        {slots.notices}
        {slots.history}
      </ScrollView> : <>
        <ScrollView accessibilityLabel={t("결정 목록", "Decision list")}
          style={narrow ? { flex: 1, display: showDetail ? "none" : "flex" } : { width: listWidth, flexGrow: 0, flexShrink: 0, borderRightWidth: 1, borderColor: c.border }}
          contentContainerStyle={{ padding: space[2], gap: space[2] }}>
          {(slots.filters || slots.notices) && <View style={{ padding: space[1], gap: space[2] }}>
            {slots.filters}
            {slots.notices}
          </View>}
          {sections.map(section => <View key={section.id} style={{ gap: space[0.5] }}>
            <View style={{ paddingHorizontal: space[2], paddingTop: space[3], paddingBottom: space[1] }}>
              <SectionLabel theme={theme} count={section.entries.length}>{inboxSectionLabel(section.id, t)}</SectionLabel>
            </View>
            {section.entries.map(entry => <InboxListRow key={entry.key} theme={theme} selected={entry.key === selected}
              row={inboxRow(entry, projects.name, t, now)} onPress={() => { setChosen(entry.key); setDetailOpen(true); }} />)}
          </View>)}
          {keyboard && !narrow && <Text style={{ ...muted, paddingHorizontal: space[2], paddingVertical: space[2] }}>{t("J · K 키로 이전·다음 결정", "J · K for next and previous")}</Text>}
        </ScrollView>

        <ScrollView ref={detail} accessibilityLabel={t("결정 상세", "Decision detail")}
          style={narrow ? { flex: 1, display: showDetail ? "flex" : "none" } : { flex: 1, minWidth: 0 }}
          contentContainerStyle={{ padding: pad, gap: space[4] }}>
          {narrow && <View style={{ alignSelf: "flex-start" }}>
            <Button theme={theme} variant="ghost" size="sm" label={t("목록으로", "Back to list")} onPress={() => setDetailOpen(false)} />
          </View>}
          {permission && <Text style={muted}>{t("세션에서 승인: 이 세션은 권한 승인을 기다립니다. 보드는 권한을 기다리는 세션에 답장을 보내지 않으니 세션을 열어 승인하세요.",
            "Approve in session: this session is waiting for permission. The board does not send to a session that waits for permission, so open the session to approve.")}</Text>}
          {selectedEntry && selectedEntry.receipts.length > 0 && <View style={{ gap: space[2] }}>{selectedEntry.receipts.map(renderReceipt)}</View>}
          {entries.map(entry => entry.card === null ? null : <View key={entry.key} role="article"
            style={{ display: entry.key === selected ? "flex" : "none", gap: space[2], padding: compact ? space[3] : space[4], backgroundColor: c.surface1, borderWidth: 1, borderColor: c.border, borderRadius: 12 }}>
            {entry.card}
          </View>)}
          {!selectedEntry && <Text style={muted}>{t("목록에서 결정을 고르세요.", "Pick a decision from the list.")}</Text>}
        </ScrollView>
      </>}
    </View>

    <ScrollView style={{ flex: 1, display: tab === "progress" ? "flex" : "none" }} contentContainerStyle={{ padding: pad, gap: space[4] }}>
      {slots.progress ?? <Text style={muted}>{t("표시할 세션이 없습니다.", "No sessions to show.")}</Text>}
    </ScrollView>
    <ScrollView style={{ flex: 1, display: tab === "history" ? "flex" : "none" }} contentContainerStyle={{ padding: pad, gap: space[4] }}>
      {slots.history ?? <Text style={muted}>{t("아직 결정 기록이 없습니다.", "No decision activity yet.")}</Text>}
    </ScrollView>
  </View>;
}
