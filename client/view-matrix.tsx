import { useMemo, useState, type ReactNode } from "react";
import { Pressable, ScrollView, Text, View, type StyleProp, type ViewStyle } from "react-native";
import type { BoardLayoutProps, DecisionEntry, ProjectBundle } from "./board-layout";
import { Button, ProjectText, RunningMark, SectionLabel, SessionChip, StatusBadge, StatusDot, fontSize, space, type Theme } from "./controls";
import { decisionGroupLabel } from "./decision-row";
import { useBoardLanguage } from "./language";
import {
  cellPreview, entryDisplay, hostSummary, isNarrow, isSelectedCell, liveCells, matrixColumnLabel, matrixColumns, matrixMark, matrixPermission,
  matrixRows, matrixSummary, matrixTitle, mountedColumns, orphanRemote, rememberCell, ribbonEntries, toggleCell,
  type CellRef, type LaneItem, type MatrixColumn, type MatrixMark, type MatrixRow,
} from "./matrix";
import { CardView } from "./project-kanban";

// Decisions run across the top; below them one table keeps every project's columns in the same place.
export function MatrixView(props: BoardLayoutProps) {
  const { theme, compact, entries, renderReceipt, slots, projects } = props;
  const { t } = useBoardLanguage();
  const [width, setWidth] = useState(0);
  const [operations, setOperations] = useState({ open: false, mounted: false });
  const [progress, setProgress] = useState({ open: false, mounted: false });
  const [cell, setCell] = useState<CellRef | null>(null);
  const [opened, setOpened] = useState<CellRef[]>([]);
  const narrow = isNarrow(compact, width);
  const rows = useMemo(() => matrixRows(projects, t("공통", "Host-wide")), [projects, t]);
  const orphans = useMemo(() => orphanRemote(projects.peers, rows.map(row => row.id)), [projects.peers, rows]);
  const mounted = liveCells(opened, rows);
  const onCell = (next: CellRef) => {
    setCell(current => toggleCell(current, next));
    setOpened(current => rememberCell(current, next, rows));
  };
  const c = theme.colors;
  return <ScrollView style={{ flex: 1, backgroundColor: c.surface0 }} onLayout={event => setWidth(event.nativeEvent.layout.width)}
    contentContainerStyle={{ gap: space[4], padding: narrow ? space[3] : space[6] }}>
    {slots.filters}
    {slots.notices}
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space[2] }}>
      <Button theme={theme} variant="secondary" size="sm" expanded={operations.open}
        label={operations.open ? t("코디네이터 요청 닫기", "Close coordinator request") : t("코디네이터에 요청", "Ask the coordinator")}
        onPress={() => setOperations(state => ({ open: !state.open, mounted: true }))} />
    </View>
    {/* Stays mounted once opened so a half-written request survives closing the panel. */}
    {operations.mounted && <Hideable hidden={!operations.open}>{slots.operations}</Hideable>}
    <DecisionRibbon theme={theme} entries={entries} renderReceipt={renderReceipt} name={projects.name} />
    {narrow
      ? <NarrowMatrix theme={theme} rows={rows} projects={projects} cell={cell} mounted={mounted} onCell={onCell} />
      : <WideMatrix theme={theme} rows={rows} projects={projects} cell={cell} mounted={mounted} wide={width >= 900} onCell={onCell} />}
    <OrphanRemote theme={theme} groups={orphans} projects={projects} />
    {slots.history}
    <View style={{ gap: space[3] }}>
      <View style={{ flexDirection: "row" }}>
        <Button theme={theme} variant="ghost" size="sm" expanded={progress.open}
          label={progress.open ? t("세션 진행 접기", "Hide session progress") : t("세션 진행 전체 보기", "Show all session progress")}
          onPress={() => setProgress(state => ({ open: !state.open, mounted: true }))} />
      </View>
      {progress.mounted && <Hideable hidden={!progress.open}>{slots.progress}</Hideable>}
    </View>
  </ScrollView>;
}

// Keeps children mounted (a draft inside survives) while taking them off screen and out of screen readers.
function Hideable({ hidden, style, children }: { hidden: boolean; style?: StyleProp<ViewStyle>; children: ReactNode }) {
  return <View accessibilityElementsHidden={hidden} importantForAccessibility={hidden ? "no-hide-descendants" : "auto"}
    style={[style, hidden && { display: "none" }]}>{children}</View>;
}

function DecisionRibbon({ theme, entries, renderReceipt, name }: {
  theme: Theme; entries: readonly DecisionEntry[]; renderReceipt: BoardLayoutProps["renderReceipt"]; name: ProjectBundle["name"];
}) {
  const { t } = useBoardLanguage();
  const [selected, setSelected] = useState<string | null>(null);
  const active = ribbonEntries(entries);
  const c = theme.colors;
  return <View style={{ gap: space[2] }}>
    <SectionLabel theme={theme} count={active.length}>{t("내 결정", "My decisions")}</SectionLabel>
    {active.length > 0
      ? <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ gap: space[2], paddingBottom: space[1] }}>
        {active.map(entry => {
          const summary = entry.summary!;
          const chosen = entry.key === selected;
          const project = summary.projectIds.map(name).join(", ");
          return <Pressable key={entry.key} accessibilityRole="button" accessibilityState={{ selected: chosen, expanded: chosen }} aria-expanded={chosen}
            accessibilityLabel={[entry.label ?? decisionGroupLabel(summary.group, t), summary.title, project].join(" · ")}
            onPress={() => setSelected(chosen ? null : entry.key)}
            style={({ pressed }) => ({ width: 210, gap: space[1], padding: space[3], borderRadius: 12, borderWidth: 1,
              borderColor: chosen ? c.foregroundMuted : c.border, backgroundColor: pressed ? c.surface1 : c.surface0 })}>
            <StatusBadge theme={theme} tone={summary.tone} label={entry.label ?? decisionGroupLabel(summary.group, t)} />
            <Text numberOfLines={2} style={{ color: c.foreground, fontSize: fontSize.base }}>{summary.title}</Text>
            <ProjectText theme={theme} projects={summary.projectIds.filter(id => id !== null).map(name)} numberOfLines={1} style={{ color: c.foregroundMuted, fontSize: fontSize.sm }}>
              {summary.permission ? `${project} · ${t("세션에서 승인", "Approve in session")}` : project}
            </ProjectText>
          </Pressable>;
        })}
      </ScrollView>
      : <Text style={{ color: c.foregroundMuted, fontSize: fontSize.sm }}>{t("없음", "None")}</Text>}
    {/* Every card stays mounted, shown or not, so a reply draft outlives a change of selection. */}
    {entries.map(entry => {
      const shown = entryDisplay(entry, selected);
      return <Hideable key={entry.key} hidden={!shown.card && !shown.receipts} style={{ gap: space[2] }}>
        {shown.receipts && entry.receipts.map(renderReceipt)}
        {shown.card && entry.summary?.permission && <Text style={{ color: c.foregroundMuted, fontSize: fontSize.sm }}>
          {t("권한 요청은 세션에서 승인합니다. 보드는 이 세션에 메시지를 보내지 않습니다.", "Approve permission requests in the session. The board does not message this session.")}
        </Text>}
        <Hideable hidden={!shown.card}>{entry.card}</Hideable>
      </Hideable>;
    })}
  </View>;
}

function Mark({ mark, theme }: { mark: MatrixMark; theme: Theme }) {
  return mark === "running" ? <RunningMark theme={theme} /> : <StatusDot theme={theme} tone={mark} />;
}

function itemLabel(item: LaneItem, t: (ko: string, en: string) => string) {
  const title = matrixTitle(item);
  return matrixPermission(item) ? `${title} · ${t("세션에서 승인", "Approve in session")}` : title;
}

function CellItems({ items, theme, limit }: { items: readonly LaneItem[]; theme: Theme; limit: number }) {
  const { t } = useBoardLanguage();
  const c = theme.colors;
  if (!items.length) return <Text style={{ color: c.foregroundMuted, fontSize: fontSize.sm }}>{t("없음", "None")}</Text>;
  const { shown, more } = cellPreview(items, limit);
  return <>
    {shown.map(item => {
      const mark = matrixMark(item);
      return <View key={item.key} style={{ flexDirection: "row", alignItems: "center", gap: space[1.5] }}>
        <Mark mark={mark} theme={theme} />
        <Text numberOfLines={1} style={{ flex: 1, fontSize: fontSize.sm, color: mark === "idle" ? c.foregroundMuted : c.foreground }}>{itemLabel(item, t)}</Text>
      </View>;
    })}
    {more > 0 && <Text style={{ color: c.foregroundMuted, fontSize: fontSize.sm }}>+{more}</Text>}
  </>;
}

function CellButton({ row, column, theme, cell, onCell, limit, style }: {
  row: MatrixRow; column: MatrixColumn; theme: Theme; cell: CellRef | null; onCell: (next: CellRef) => void; limit: number; style?: object;
}) {
  const { t } = useBoardLanguage();
  const items = row.cells[column];
  const selected = isSelectedCell(cell, row.key, column);
  const c = theme.colors;
  const label = `${row.title} · ${matrixColumnLabel(column, t)} ${items.length}`;
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ expanded: selected, disabled: !items.length }}
    aria-expanded={selected} disabled={!items.length} onPress={() => onCell({ row: row.key, column })}
    style={({ pressed }) => ({ gap: space[1], padding: space[3], minWidth: 0, backgroundColor: selected ? c.surface2 : pressed ? c.surface1 : "transparent", ...style })}>
    <CellItems items={items} theme={theme} limit={limit} />
  </Pressable>;
}

function ItemCard({ item, projectId, theme, projects }: { item: LaneItem; projectId: string | null; theme: Theme; projects: ProjectBundle }) {
  if (item.kind === "record") return <>{projects.renderRecord(item.item)}</>;
  if (item.kind === "pull") return <>{projects.renderPull(item.pr, projectId ?? "")}</>;
  return <CardView card={item.card} theme={theme} onOpen={projects.open} onEdit={projects.edit} sessionHostLabel={projects.hostLabel} />;
}

function CellDrawer({ row, column, theme, projects, wide }: { row: MatrixRow; column: MatrixColumn; theme: Theme; projects: ProjectBundle; wide: boolean }) {
  const { t } = useBoardLanguage();
  const items = row.cells[column];
  return <View style={{ gap: space[3], padding: space[4], backgroundColor: theme.colors.surface1 }}>
    <SectionLabel theme={theme} count={items.length}>{`${row.title} · ${matrixColumnLabel(column, t)}`}</SectionLabel>
    <View style={{ flexDirection: wide ? "row" : "column", flexWrap: "wrap", gap: space[3] }}>
      {items.map(item => <View key={item.key} style={wide ? { flexGrow: 1, flexBasis: 320, minWidth: 0 } : undefined}>
        <ItemCard item={item} projectId={row.id} theme={theme} projects={projects} />
      </View>)}
    </View>
  </View>;
}

const projectColumn = 180;
const hostColumn = 96;

function HeaderMark({ column, theme }: { column: MatrixColumn; theme: Theme }) {
  return <StatusDot theme={theme} tone={column === "human" ? "warning" : column === "done" ? "success" : column === "idle" ? "idle" : "muted"} />;
}

function WideMatrix({ rows, theme, projects, cell, mounted, onCell, wide }: {
  rows: readonly MatrixRow[]; theme: Theme; projects: ProjectBundle; cell: CellRef | null; mounted: readonly CellRef[]; onCell: (next: CellRef) => void; wide: boolean;
}) {
  const { t } = useBoardLanguage();
  const c = theme.colors;
  const head = { fontSize: fontSize.sm, fontWeight: "500" as const, color: c.foregroundMuted };
  const headCell = { flexDirection: "row" as const, alignItems: "center" as const, gap: space[1.5], paddingHorizontal: space[3], paddingVertical: space[2] };
  return <View style={{ borderWidth: 1, borderColor: c.border, borderRadius: 12, overflow: "hidden" }}>
    <View style={{ flexDirection: "row", backgroundColor: c.surface1 }}>
      <View style={{ ...headCell, width: projectColumn }}><Text style={head}>{t("프로젝트", "Project")}</Text></View>
      {matrixColumns.map(column => <View key={column} style={{ ...headCell, flex: 1, minWidth: 0 }}>
        <HeaderMark column={column} theme={theme} /><Text numberOfLines={1} style={head}>{matrixColumnLabel(column, t)}</Text>
      </View>)}
      <View style={{ ...headCell, width: hostColumn }}><Text style={head}>{t("호스트", "Host")}</Text></View>
    </View>
    {!rows.length && <View style={{ padding: space[3], borderTopWidth: 1, borderColor: c.border }}>
      <Text style={{ color: c.foregroundMuted, fontSize: fontSize.sm }}>{t("표시할 프로젝트가 없습니다.", "No projects to show.")}</Text>
    </View>}
    {rows.map(row => <View key={row.key} style={{ borderTopWidth: 1, borderColor: c.border }}>
      <View style={{ flexDirection: "row" }}>
        <View style={{ width: projectColumn, padding: space[3] }}>
          <ProjectText theme={theme} projects={row.id === null ? [] : [row.title]} accessibilityRole="header" numberOfLines={2} style={{ color: row.id === null ? c.foregroundMuted : c.foreground, fontSize: fontSize.base }}>{row.title}</ProjectText>
        </View>
        {matrixColumns.map(column => <CellButton key={column} row={row} column={column} theme={theme} cell={cell} onCell={onCell} limit={3} style={{ flex: 1 }} />)}
        <View style={{ width: hostColumn, padding: space[3] }}>
          <Text style={{ color: c.foregroundMuted, fontSize: fontSize.sm }}>{hostSummary(row.hosts)}</Text>
        </View>
      </View>
      {/* A cell opened once keeps its cards mounted, hidden while closed, so a reply draft survives. */}
      {mountedColumns(mounted, row.key).map(column => <Hideable key={column} hidden={!isSelectedCell(cell, row.key, column)}>
        <CellDrawer row={row} column={column} theme={theme} projects={projects} wide={wide} />
      </Hideable>)}
    </View>)}
  </View>;
}

function NarrowMatrix({ rows, theme, projects, cell, mounted, onCell }: {
  rows: readonly MatrixRow[]; theme: Theme; projects: ProjectBundle; cell: CellRef | null; mounted: readonly CellRef[]; onCell: (next: CellRef) => void;
}) {
  const { t } = useBoardLanguage();
  const [open, setOpen] = useState<ReadonlySet<string>>(new Set());
  const c = theme.colors;
  const toggle = (key: string) => setOpen(current => {
    const next = new Set(current);
    if (!next.delete(key)) next.add(key);
    return next;
  });
  if (!rows.length) return <Text style={{ color: c.foregroundMuted, fontSize: fontSize.sm }}>{t("표시할 프로젝트가 없습니다.", "No projects to show.")}</Text>;
  return <View style={{ borderWidth: 1, borderColor: c.border, borderRadius: 12, overflow: "hidden" }}>
    {rows.map((row, index) => {
      const expanded = open.has(row.key);
      const summary = matrixSummary(row.cells, t);
      const filled = matrixColumns.filter(column => row.cells[column].length);
      const kept = mountedColumns(mounted, row.key);
      return <View key={row.key} style={index ? { borderTopWidth: 1, borderColor: c.border } : undefined}>
        <Pressable accessibilityRole="button" accessibilityState={{ expanded }} aria-expanded={expanded}
          accessibilityLabel={`${row.title} · ${summary}`} onPress={() => toggle(row.key)}
          style={({ pressed }) => ({ flexDirection: "row", alignItems: "center", gap: space[2], padding: space[3], backgroundColor: pressed ? c.surface1 : "transparent" })}>
          <View style={{ flex: 1, gap: space[0.5] }}>
            <ProjectText theme={theme} projects={row.id === null ? [] : [row.title]} numberOfLines={1} style={{ color: row.id === null ? c.foregroundMuted : c.foreground, fontSize: fontSize.base }}>{row.title}</ProjectText>
            <Text numberOfLines={1} style={{ color: c.foregroundMuted, fontSize: fontSize.sm }}>{summary}</Text>
          </View>
          <Text accessible={false} style={{ color: c.foregroundMuted }}>{expanded ? "▴" : "▾"}</Text>
        </Pressable>
        {(expanded || kept.length > 0) && <Hideable hidden={!expanded} style={{ gap: space[3], paddingHorizontal: space[3], paddingBottom: space[3] }}>
          {row.hosts.length > 0 && <Text style={{ color: c.foregroundMuted, fontSize: fontSize.sm }}>{t("호스트", "Host")} · {hostSummary(row.hosts)}</Text>}
          {!filled.length && <Text style={{ color: c.foregroundMuted, fontSize: fontSize.sm }}>{t("없음", "None")}</Text>}
          {filled.map(column => <View key={column} style={{ gap: space[1] }}>
            <SectionLabel theme={theme} count={row.cells[column].length}>{matrixColumnLabel(column, t)}</SectionLabel>
            <CellButton row={row} column={column} theme={theme} cell={cell} onCell={onCell} limit={Infinity} style={{ borderRadius: 12 }} />
            {kept.includes(column) && <Hideable hidden={!isSelectedCell(cell, row.key, column)} style={{ gap: space[3] }}>
              {row.cells[column].map(item => <ItemCard key={item.key} item={item} projectId={row.id} theme={theme} projects={projects} />)}
            </Hideable>}
          </View>)}
        </Hideable>}
      </View>;
    })}
  </View>;
}

function OrphanRemote({ groups, theme, projects }: { groups: ReturnType<typeof orphanRemote>; theme: Theme; projects: ProjectBundle }) {
  const { t } = useBoardLanguage();
  const c = theme.colors;
  if (!groups.length && !projects.peersLoading) return null;
  return <View style={{ gap: space[2] }}>
    <SectionLabel theme={theme}>{t("다른 호스트에서 진행 중", "Running on other hosts")}</SectionLabel>
    {projects.peersLoading && <Text style={{ color: c.foregroundMuted, fontSize: fontSize.sm }}>{t("원격 호스트 조회 중…", "Loading remote hosts…")}</Text>}
    {groups.map(group => group.failed
      ? <Text key={group.host.serverId} style={{ color: c.foregroundMuted, fontSize: fontSize.sm }}>
        {t(`${group.host.label} · 진행 중인 세션 조회 실패`, `${group.host.label} · Could not load running sessions`)}
      </Text>
      : group.rows.map(row => {
        const title = row.title || t(`세션 ${row.sessionId.slice(0, 8)}`, `Session ${row.sessionId.slice(0, 8)}`);
        const openRemote = projects.openRemote;
        return <View key={group.host.serverId + ":" + row.sessionId} style={{ flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space[2] }}>
          <RunningMark theme={theme} />
          <ProjectText theme={theme} projects={[projects.name(row.projectId)]} numberOfLines={1} style={{ color: c.foreground, fontSize: fontSize.sm }}>
            {[group.host.label, projects.name(row.projectId), title].join(" · ")}
          </ProjectText>
          {openRemote && <SessionChip theme={theme} label={t("세션", "Session")}
            accessibilityLabel={t(`${group.host.label} · ${title} 열기`, `Open ${title} on ${group.host.label}`)} onPress={() => openRemote(group.host.serverId, row.sessionId)} />}
        </View>;
      }))}
  </View>;
}
