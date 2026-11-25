import type { BoardLayoutProps } from "./board-layout";
import { StackedLayout } from "./view-stacked";

// Placeholder until the matrix view lands (#6).
export function MatrixView(props: BoardLayoutProps) {
  return <StackedLayout {...props} />;
}
