import type { BoardLayoutProps } from "./board-layout";
import { StackedLayout } from "./view-stacked";

// Placeholder until the inbox view lands (#4).
export function InboxView(props: BoardLayoutProps) {
  return <StackedLayout {...props} />;
}
