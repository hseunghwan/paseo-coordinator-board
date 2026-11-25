import type { BoardLayoutProps } from "./board-layout";
import { StackedLayout } from "./view-stacked";

// Placeholder until the focus view lands (#5).
export function FocusView(props: BoardLayoutProps) {
  return <StackedLayout {...props} />;
}
