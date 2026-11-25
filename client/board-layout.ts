import type { ReactNode } from "react";
import type { PullRequestItem } from "../shared/prs";
import type { ReplyEntry } from "../shared/reply-history";
import type { TrackedDecision } from "../shared/tracked-decisions";
import type { Theme } from "./controls";
import type { RankedDecision } from "./decision-priority";
import type { InlineReceipt } from "./decision-receipts";
import type { DecisionRowSummary } from "./decision-row";
import type { HistoryLinks } from "./history-sessions";
import type { Card } from "./model";
import type { RemoteGroup } from "./remote-running";
import type { TrackedSessionLinks } from "./tracked-session-chips";

// One ranked decision, or the place a finished one held. The board renders the card and its callbacks;
// a view only decides where it goes. Keep a card mounted while it may hold a draft.
export type DecisionEntry = {
  key: string;
  row: RankedDecision | null;
  summary: DecisionRowSummary | null;
  label: string | null;
  card: ReactNode;
  receipts: readonly InlineReceipt[];
};

export type ProjectBundle = {
  list: readonly { id: string; title: string; cards: Card[] }[];
  hostWide: boolean;
  counts: ReadonlyMap<string | null, number>;
  name: (id: string | null) => string;
  records: readonly TrackedDecision[];
  pulls: readonly PullRequestItem[];
  history: readonly ReplyEntry[];
  peers: readonly RemoteGroup[];
  peersLoading: boolean;
  hostLabel: string;
  renderRecord: (item: TrackedDecision) => ReactNode;
  renderPull: (pr: PullRequestItem, projectId: string) => ReactNode;
  recordLinks: (item: TrackedDecision) => TrackedSessionLinks;
  historyLinks: HistoryLinks;
  open?: (id: string) => void;
  openRemote?: (host: string, id: string) => void;
  edit: (id: string) => void;
};

export type BoardLayoutProps = {
  theme: Theme;
  compact: boolean;
  entries: readonly DecisionEntry[];
  total: number;
  filteredTotal: number;
  filtered: boolean;
  incomplete: boolean;
  renderReceipt: (receipt: InlineReceipt) => ReactNode;
  // Filters, notices, coordinator requests, history and progress stay reachable in every view.
  slots: { filters: ReactNode; notices: ReactNode; operations: ReactNode; history: ReactNode; progress: ReactNode };
  projects: ProjectBundle;
  open?: (id: string) => void;
};
