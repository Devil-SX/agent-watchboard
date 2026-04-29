import type {
  AnalysisContentEntry,
  AnalysisMetricDatum,
  AnalysisSessionDetail,
  AnalysisSessionSectionSummary,
  AnalysisSessionStatistics
} from "@shared/ipc";

const metricFormatter = new Intl.NumberFormat();
const browserLabelCollator = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

export type SessionBrowserMetricMode = "messages" | "hours";
export type SessionBrowserSortKey = "alphabetic" | "messages" | "hours";
export type SessionBrowserSortDirection = "asc" | "desc";
export type SessionBrowserSortMetric = "user" | "assistant" | "tool" | "model";
export type SessionBrowserBreakdownSegment = {
  label: "User" | "Assistant" | "Tool";
  value: number;
  tone: "user" | "assistant" | "tool";
};

export function formatMetric(value: number | null): string {
  if (value === null) {
    return "N/A";
  }
  return metricFormatter.format(Math.round(value * 100) / 100);
}

export function formatCompactMetric(value: number | null): string {
  if (value === null) {
    return "N/A";
  }
  const normalized = Math.abs(value);
  if (normalized >= 1_000_000_000) {
    return trimCompactValue(value / 1_000_000_000, "B");
  }
  if (normalized >= 1_000_000) {
    return trimCompactValue(value / 1_000_000, "M");
  }
  if (normalized >= 1_000) {
    return trimCompactValue(value / 1_000, "K");
  }
  return formatMetric(value);
}

export function formatDuration(value: number | null): string {
  if (value === null || value <= 0) {
    return "N/A";
  }
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const seconds = Math.floor(value % 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
}

export function formatBrowserBreakdownValue(value: number, mode: SessionBrowserMetricMode): string {
  return mode === "hours" ? formatDuration(value) : formatMetric(value);
}

export function getSessionBrowserSortMetricOptions(
  sortKey: SessionBrowserSortKey
): Array<{ value: SessionBrowserSortMetric; label: string }> {
  if (sortKey === "messages") {
    return [
      { value: "user", label: "User" },
      { value: "assistant", label: "Assistant" },
      { value: "tool", label: "Tool" }
    ];
  }
  if (sortKey === "hours") {
    return [
      { value: "user", label: "User" },
      { value: "model", label: "Model" },
      { value: "tool", label: "Tool" }
    ];
  }
  return [];
}

export function normalizeSessionBrowserSortMetric(
  sortKey: SessionBrowserSortKey,
  metric: SessionBrowserSortMetric
): SessionBrowserSortMetric {
  const options = getSessionBrowserSortMetricOptions(sortKey);
  if (options.length === 0) {
    return metric;
  }
  return options.some((option) => option.value === metric) ? metric : options[0]!.value;
}

export function sortSessionBrowserItems<Item>(
  items: Item[],
  sortKey: SessionBrowserSortKey,
  sortDirection: SessionBrowserSortDirection,
  sortMetric: SessionBrowserSortMetric,
  getAlphabeticLabel: (item: Item) => string,
  getSegments: (item: Item) => SessionBrowserBreakdownSegment[]
): Item[] {
  const normalizedMetric = normalizeSessionBrowserSortMetric(sortKey, sortMetric);

  return [...items]
    .map((item, index) => ({
      item,
      index,
      label: getAlphabeticLabel(item),
      metricValue:
        sortKey === "alphabetic" ? null : getSessionBrowserSortMetricValue(getSegments(item), normalizedMetric)
    }))
    .sort((left, right) => {
      if (sortKey !== "alphabetic") {
        const leftKnown = left.metricValue != null;
        const rightKnown = right.metricValue != null;
        if (leftKnown && rightKnown && left.metricValue !== right.metricValue) {
          return sortDirection === "asc"
            ? (left.metricValue ?? 0) - (right.metricValue ?? 0)
            : (right.metricValue ?? 0) - (left.metricValue ?? 0);
        }
        if (leftKnown !== rightKnown) {
          return leftKnown ? -1 : 1;
        }
      }

      const labelCompare = browserLabelCollator.compare(left.label, right.label);
      if (labelCompare !== 0) {
        return sortDirection === "asc" ? labelCompare : -labelCompare;
      }
      return left.index - right.index;
    })
    .map((entry) => entry.item);
}

export function buildSectionBrowserBreakdown(
  section: AnalysisSessionSectionSummary,
  mode: SessionBrowserMetricMode,
  entries: AnalysisContentEntry[] = []
): SessionBrowserBreakdownSegment[] {
  if (mode === "messages") {
    const segments: SessionBrowserBreakdownSegment[] = [
      { label: "User", value: section.userMessageCount, tone: "user" },
      { label: "Assistant", value: section.assistantMessageCount, tone: "assistant" },
      { label: "Tool", value: section.toolCallCount, tone: "tool" }
    ];
    return segments.filter((segment) => segment.value > 0);
  }

  return buildSectionTimeBreakdownFromEntries(section, entries);
}

export function buildSessionBrowserBreakdown(
  detail: AnalysisSessionDetail | null,
  sections: AnalysisSessionSectionSummary[],
  statistics: AnalysisSessionStatistics | null,
  mode: SessionBrowserMetricMode
): SessionBrowserBreakdownSegment[] {
  if (mode === "hours") {
    const statisticsSegments = buildSessionTimeBreakdownFromStatistics(statistics);
    if (statisticsSegments.length > 0) {
      return statisticsSegments;
    }
  }

  const sectionSource = detail?.sections.length ? detail.sections : sections;
  if (sectionSource.length > 0) {
    const totals = {
      User: 0,
      Assistant: 0,
      Tool: 0
    };
    for (const section of sectionSource) {
      for (const segment of buildSectionBrowserBreakdown(section, mode, detail?.entries ?? [])) {
        totals[segment.label] += segment.value;
      }
    }
    const segments: SessionBrowserBreakdownSegment[] = [
      { label: "User", value: totals.User, tone: "user" },
      { label: "Assistant", value: totals.Assistant, tone: "assistant" },
      { label: "Tool", value: totals.Tool, tone: "tool" }
    ];
    return segments.filter((segment) => segment.value > 0);
  }

  if (!statistics) {
    return [];
  }
  const normalizedBreakdown = normalizeAnalysisMessageBreakdown(statistics.messageBreakdown, statistics.summary.totalToolCalls);
  const userMessages = normalizedBreakdown.find((entry) => entry.label === "User")?.value ?? 0;
  const assistantMessages = normalizedBreakdown.find((entry) => entry.label === "Assistant")?.value ?? 0;
  const toolMessages = normalizedBreakdown.find((entry) => entry.label === "Tool")?.value ?? 0;

  if (mode === "messages") {
    const segments: SessionBrowserBreakdownSegment[] = [
      { label: "User", value: userMessages, tone: "user" },
      { label: "Assistant", value: assistantMessages, tone: "assistant" },
      { label: "Tool", value: toolMessages, tone: "tool" }
    ];
    return segments.filter((segment) => segment.value > 0);
  }

  return [];
}

function trimCompactValue(value: number, suffix: "K" | "M" | "B"): string {
  const rounded = Math.round(value * 10) / 10;
  return `${Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1)}${suffix}`;
}

function getSessionBrowserSortMetricValue(
  segments: SessionBrowserBreakdownSegment[],
  metric: SessionBrowserSortMetric
): number | null {
  const segmentLabel =
    metric === "tool" ? "Tool" : metric === "user" ? "User" : metric === "assistant" || metric === "model" ? "Assistant" : null;
  if (!segmentLabel) {
    return null;
  }
  const value = segments.find((segment) => segment.label === segmentLabel)?.value;
  return typeof value === "number" && value > 0 ? value : null;
}

function normalizeAnalysisMessageBreakdown(
  breakdown: AnalysisMetricDatum[],
  fallbackToolCount: number
): AnalysisMetricDatum[] {
  const totals = {
    User: 0,
    Assistant: 0,
    Tool: 0
  };

  for (const entry of breakdown) {
    const normalizedLabel = normalizeAnalysisMessageLabel(entry.label);
    if (normalizedLabel === "User" || normalizedLabel === "Assistant" || normalizedLabel === "Tool") {
      totals[normalizedLabel] += entry.value;
    }
  }

  if (totals.Tool <= 0 && fallbackToolCount > 0) {
    totals.Tool = fallbackToolCount;
  }

  return [
    { label: "User", value: totals.User, hint: null },
    { label: "Assistant", value: totals.Assistant, hint: null },
    { label: "Tool", value: totals.Tool, hint: null }
  ].filter((entry) => entry.value > 0);
}

function normalizeAnalysisMessageLabel(label: string): "User" | "Assistant" | "Tool" | null {
  const normalized = label.trim().toLowerCase();
  if (normalized === "user") {
    return "User";
  }
  if (normalized === "assistant") {
    return "Assistant";
  }
  if (normalized === "system" || normalized.includes("tool")) {
    return "Tool";
  }
  return null;
}

function buildSessionTimeBreakdownFromStatistics(
  statistics: AnalysisSessionStatistics | null
): SessionBrowserBreakdownSegment[] {
  if (!statistics) {
    return [];
  }

  const totals = {
    User: 0,
    Assistant: 0,
    Tool: 0
  };

  for (const entry of statistics.timeBreakdown) {
    const normalizedLabel = normalizeAnalysisTimeLabel(entry.label);
    if (normalizedLabel) {
      totals[normalizedLabel] += entry.value;
    }
  }

  const segments: SessionBrowserBreakdownSegment[] = [
    { label: "User", value: totals.User, tone: "user" },
    { label: "Assistant", value: totals.Assistant, tone: "assistant" },
    { label: "Tool", value: totals.Tool, tone: "tool" }
  ];
  return segments.filter((segment) => segment.value > 0);
}

function buildSectionTimeBreakdownFromEntries(
  section: AnalysisSessionSectionSummary,
  entries: AnalysisContentEntry[]
): SessionBrowserBreakdownSegment[] {
  const startTime = Date.parse(section.startTimestamp ?? "");
  const endTime = Date.parse(section.endTimestamp ?? "");
  if (Number.isNaN(startTime) || Number.isNaN(endTime) || endTime <= startTime) {
    return [];
  }

  const timedEntries = entries
    .filter((entry) => entry.sectionId === section.sectionId)
    .map((entry) => ({
      ...entry,
      unixMs: Date.parse(entry.timestamp ?? "")
    }))
    .filter((entry) => !Number.isNaN(entry.unixMs))
    .sort((left, right) => (left.unixMs === right.unixMs ? left.sequence - right.sequence : left.unixMs - right.unixMs));

  if (timedEntries.length === 0) {
    return [];
  }

  const totals = {
    User: 0,
    Assistant: 0,
    Tool: 0
  };
  let previousTime = startTime;

  // Attribute each elapsed interval to the event that becomes active at its end.
  // This keeps section hours tied to real trajectory timestamps instead of silently
  // mirroring message counts when the profiler does not persist per-role section times.
  for (const entry of timedEntries) {
    const currentTime = Math.max(previousTime, Math.min(entry.unixMs, endTime));
    const normalizedKind = normalizeAnalysisEntryTimingKind(entry);
    if (normalizedKind) {
      totals[normalizedKind] += Math.max(0, currentTime - previousTime) / 1000;
    }
    previousTime = currentTime;
  }

  const trailingKind = normalizeAnalysisEntryTimingKind(timedEntries[timedEntries.length - 1] ?? null);
  if (trailingKind && previousTime < endTime) {
    totals[trailingKind] += (endTime - previousTime) / 1000;
  }

  const segments: SessionBrowserBreakdownSegment[] = [
    { label: "User", value: totals.User, tone: "user" },
    { label: "Assistant", value: totals.Assistant, tone: "assistant" },
    { label: "Tool", value: totals.Tool, tone: "tool" }
  ];
  return segments.filter((segment) => segment.value > 0);
}

function normalizeAnalysisTimeLabel(label: string): "User" | "Assistant" | "Tool" | null {
  const normalized = label.trim().toLowerCase();
  if (normalized === "user") {
    return "User";
  }
  if (normalized === "assistant" || normalized === "model") {
    return "Assistant";
  }
  if (normalized === "tool" || normalized === "system") {
    return "Tool";
  }
  return null;
}

function normalizeAnalysisEntryTimingKind(entry: AnalysisContentEntry | null): "User" | "Assistant" | "Tool" | null {
  if (!entry) {
    return null;
  }
  if (entry.kind === "user") {
    return "User";
  }
  if (entry.kind === "assistant" || entry.kind === "thinking") {
    return "Assistant";
  }
  if (entry.kind === "tool-use" || entry.kind === "tool-result") {
    return "Tool";
  }
  if (entry.role === "user") {
    return "User";
  }
  if (entry.role === "assistant") {
    return "Assistant";
  }
  if (entry.role === "system" || entry.role === "tool") {
    return "Tool";
  }
  return null;
}
