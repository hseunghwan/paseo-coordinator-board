import { ScrollView, View } from "react-native";
import type { BoardLayoutProps } from "./board-layout";
import { space } from "./controls";

// A plain stack that every view can fall back to while its own layout is unavailable.
export function StackedLayout({ compact, entries, renderReceipt, slots }: BoardLayoutProps) {
  return <ScrollView contentContainerStyle={{ gap: space[4], padding: compact ? space[3] : space[6] }}>
    {slots.operations}
    {slots.filters}
    {slots.notices}
    {entries.map(entry => <View key={entry.key} style={{ gap: space[2] }}>{entry.receipts.map(renderReceipt)}{entry.card}</View>)}
    {slots.history}
    {slots.progress}
  </ScrollView>;
}
