import { useEffect, useMemo, useState, type ReactElement } from "react";

import { CompactDropdown, CompactToggleButton } from "@renderer/components/CompactControls";
import { LocationBadge } from "@renderer/components/LocationBadge";
import { MarkdownDocument } from "@renderer/components/MarkdownDocument";
import type { AgentPathLocation, BoardDocument, BoardItem, BoardSection } from "@shared/schema";

type Props = {
  document: BoardDocument | null;
  boardLocationKind: AgentPathLocation;
  canSwitchLocation: boolean;
  onBoardLocationChange: (location: AgentPathLocation) => void;
};

type SelectedBoardItem = {
  item: BoardItem;
  section: BoardSection;
};

type BoardViewMode = "list" | "calendar";
type StatusFilter = "all" | "todo" | "doing" | "done";
type DeadlineFilter = "all" | "has-ddl" | "no-ddl" | "overdue" | "7d" | "30d";
type CalendarEventKind = "created" | "completed" | "deadline";

type CalendarEvent = {
  kind: CalendarEventKind;
  item: BoardItem;
  section: BoardSection;
};

type CalendarDaySummary = {
  dateKey: string;
  created: CalendarEvent[];
  completed: CalendarEvent[];
  deadlines: CalendarEvent[];
};

type CalendarCell = {
  dateKey: string;
  dayNumber: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  summary: CalendarDaySummary;
};

const WEEKDAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

export function BoardTree({ document, boardLocationKind, canSwitchLocation, onBoardLocationChange }: Props): ReactElement {
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<BoardViewMode>("list");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [deadlineFilter, setDeadlineFilter] = useState<DeadlineFilter>("all");
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});
  const [visibleMonth, setVisibleMonth] = useState(() => startOfMonth(new Date()));
  const [selectedDateKey, setSelectedDateKey] = useState(() => todayDateKey());

  const filteredSections = useMemo(
    () => filterSections(document, statusFilter, deadlineFilter),
    [deadlineFilter, document, statusFilter]
  );
  const selected = useMemo(() => resolveSelectedItem(filteredSections, selectedItemId), [filteredSections, selectedItemId]);
  const calendarDays = useMemo(() => buildCalendarDays(filteredSections, visibleMonth), [filteredSections, visibleMonth]);
  const selectedDay = useMemo(
    () => calendarDays.find((day) => day.dateKey === selectedDateKey) ?? calendarDays[0] ?? null,
    [calendarDays, selectedDateKey]
  );

  useEffect(() => {
    if (selectedItemId && !selected) {
      setSelectedItemId(null);
    }
  }, [selected, selectedItemId]);

  useEffect(() => {
    if (selectedDay) {
      return;
    }
    setSelectedDateKey(todayDateKey());
  }, [selectedDay]);

  return (
    <div className="board-tree-shell">
      <div className="board-toolbar">
        <div className="board-toolbar-group">
          {canSwitchLocation ? (
            <CompactToggleButton
              label="Env"
              value={<LocationBadge location={boardLocationKind} />}
              onClick={() => onBoardLocationChange(boardLocationKind === "host" ? "wsl" : "host")}
            />
          ) : null}
          <CompactToggleButton
            label="View"
            value={viewMode === "list" ? "List" : "Calendar"}
            onClick={() => setViewMode((current) => (current === "list" ? "calendar" : "list"))}
          />
        </div>

        <div className="board-toolbar-group">
          <CompactDropdown label="Status" value={statusFilter} options={STATUS_FILTER_OPTIONS} onChange={setStatusFilter} />
          <CompactDropdown label="DDL" value={deadlineFilter} options={DEADLINE_FILTER_OPTIONS} onChange={setDeadlineFilter} />
        </div>
      </div>

      <div className="board-tree">
        {!document ? (
          <div className="panel-empty">
            <p>No board data loaded.</p>
            <span>Retry after the selected board env path becomes available.</span>
          </div>
        ) : document.sections.length === 0 ? (
          <div className="panel-empty">
            <p>This {boardLocationKind === "wsl" ? "WSL" : "host"} board is loaded but empty.</p>
            <span>Use the repo-local `todo_preview` command to add sections or tasks to this env.</span>
          </div>
        ) : viewMode === "list" ? (
          filteredSections.length > 0 ? (
            filteredSections.map((section) => {
              const collapsed = collapsedSections[section.id] ?? false;
              return (
                <section key={section.id} className="board-section">
                  <header className="board-section-header">
                    <button
                      type="button"
                      className="board-section-toggle"
                      onClick={() =>
                        setCollapsedSections((current) => ({
                          ...current,
                          [section.id]: !collapsed
                        }))
                      }
                    >
                      <span className={collapsed ? "board-toggle-caret is-collapsed" : "board-toggle-caret"} />
                      <span className="board-section-copy">
                        <span className="board-section-title-row">
                          <span className="board-section-badge">Section</span>
                          <strong>{section.name}</strong>
                        </span>
                        {section.description ? <span className="board-section-description">{section.description}</span> : null}
                      </span>
                    </button>
                    <span className="board-section-count">{section.items.length}</span>
                  </header>

                  {!collapsed ? (
                    section.items.length > 0 ? (
                      <div className="board-item-list">
                        {section.items.map((item) => (
                          <button
                            key={item.id}
                            type="button"
                            className={item.id === selectedItemId ? "board-item is-active" : "board-item"}
                            onClick={() => setSelectedItemId(item.id)}
                          >
                            <BoardStatusIcon status={item.status} />
                            <span className="board-item-copy">
                              <span className="board-item-title-row">
                                <strong>{item.name}</strong>
                                {item.deadlineAt ? (
                                  <span className={isOverdue(item) ? "board-item-deadline is-overdue" : "board-item-deadline"}>
                                    {formatDeadlineTag(item.deadlineAt)}
                                  </span>
                                ) : null}
                              </span>
                              <span className="board-item-meta">{formatItemMeta(item)}</span>
                            </span>
                          </button>
                        ))}
                      </div>
                    ) : (
                      <div className="board-section-empty">No items in this section.</div>
                    )
                  ) : null}
                </section>
              );
            })
          ) : (
            <div className="panel-empty">
              <p>No items match the current filters.</p>
              <span>Adjust status or DDL filters to widen the board view.</span>
            </div>
          )
        ) : (
          <div className="board-calendar">
            <div className="board-calendar-toolbar">
              <div className="board-calendar-month">
                <button type="button" className="board-toolbar-chip" onClick={() => setVisibleMonth(addMonths(visibleMonth, -1))}>
                  Prev
                </button>
                <strong>{formatMonthLabel(visibleMonth)}</strong>
                <button type="button" className="board-toolbar-chip" onClick={() => setVisibleMonth(addMonths(visibleMonth, 1))}>
                  Next
                </button>
              </div>
              <div className="board-calendar-legend">
                <span><i className="board-calendar-dot is-created" /> Created</span>
                <span><i className="board-calendar-dot is-completed" /> Completed</span>
                <span><i className="board-calendar-dot is-deadline" /> DDL</span>
              </div>
            </div>

            <div className="board-calendar-grid">
              {WEEKDAY_LABELS.map((label) => (
                <span key={label} className="board-calendar-weekday">
                  {label}
                </span>
              ))}
              {calendarDays.map((day) => (
                <button
                  key={day.dateKey}
                  type="button"
                  className={
                    day.dateKey === selectedDateKey
                      ? day.isCurrentMonth
                        ? "board-calendar-day is-selected"
                        : "board-calendar-day is-outside is-selected"
                      : day.isToday
                        ? day.isCurrentMonth
                          ? "board-calendar-day is-today"
                          : "board-calendar-day is-outside is-today"
                        : day.isCurrentMonth
                          ? "board-calendar-day"
                          : "board-calendar-day is-outside"
                  }
                  onClick={() => setSelectedDateKey(day.dateKey)}
                >
                  <span className="board-calendar-day-number">{day.dayNumber}</span>
                  <span className="board-calendar-dot-row">
                    {day.summary.created.length > 0 ? <i className="board-calendar-dot is-created" /> : null}
                    {day.summary.completed.length > 0 ? <i className="board-calendar-dot is-completed" /> : null}
                    {day.summary.deadlines.length > 0 ? <i className="board-calendar-dot is-deadline" /> : null}
                  </span>
                </button>
              ))}
            </div>

            <div className="board-calendar-day-panel">
              <header className="board-calendar-day-header">
                <strong>{selectedDay ? formatLongDate(selectedDay.dateKey) : "No date selected"}</strong>
              </header>
              {selectedDay ? <CalendarDayEvents day={selectedDay} onOpenItem={setSelectedItemId} /> : null}
            </div>
          </div>
        )}
      </div>

      {selected ? (
        <>
          <button type="button" className="board-detail-backdrop" aria-label="Close item details" onClick={() => setSelectedItemId(null)} />
          <aside className="board-detail-drawer">
            <header className="board-detail-header">
              <div>
                <p className="panel-eyebrow">Board Item</p>
                <h3>{selected.item.name}</h3>
              </div>
              <div className="toolbar-actions">
                <button type="button" className="secondary-button" onClick={() => setSelectedItemId(null)}>
                  Close
                </button>
              </div>
            </header>

            <div className="board-detail-body">
              <div className="board-detail-status-row">
                <BoardStatusIcon status={selected.item.status} />
                {selected.item.deadlineAt ? (
                  <span className={isOverdue(selected.item) ? "board-item-deadline is-overdue" : "board-item-deadline"}>
                    {formatDeadlineTag(selected.item.deadlineAt)}
                  </span>
                ) : null}
              </div>

              <div className="board-detail-section">
                <span className="board-detail-label">History</span>
                <BoardItemMarkdownSection content={selected.item.history} emptyCopy="No history yet." />
              </div>

              <div className="board-detail-section">
                <span className="board-detail-label">Next</span>
                <BoardItemMarkdownSection content={selected.item.next} emptyCopy="No next step yet." />
              </div>

              <div className="board-detail-grid">
                <BoardDetailLine label="Section" value={selected.section.name} />
                <BoardDetailLine
                  label="DDL"
                  value={selected.item.deadlineAt ? `${selected.item.deadlineAt} · ${formatDeadlineDelta(selected.item.deadlineAt)}` : "No deadline"}
                />
                <BoardDetailLine label="Created At" value={formatTimestamp(selected.item.createdAt)} />
                <BoardDetailLine label="Completed At" value={selected.item.completedAt ? formatTimestamp(selected.item.completedAt) : "Not completed"} />
                <BoardDetailLine label="Item ID" value={selected.item.id} />
              </div>
            </div>
          </aside>
        </>
      ) : null}
    </div>
  );
}

export function BoardItemMarkdownSection({ content, emptyCopy }: { content: string; emptyCopy: string }): ReactElement {
  if (!content.trim()) {
    return <p>{emptyCopy}</p>;
  }
  return <MarkdownDocument content={content} className="board-markdown-body" />;
}

const STATUS_FILTER_OPTIONS: Array<{ label: string; value: StatusFilter; content: ReactElement }> = [
  { label: "All", value: "all", content: <StatusFilterOption status="all" label="All" /> },
  { label: "Todo", value: "todo", content: <StatusFilterOption status="todo" label="Todo" /> },
  { label: "Doing", value: "doing", content: <StatusFilterOption status="doing" label="Doing" /> },
  { label: "Done", value: "done", content: <StatusFilterOption status="done" label="Done" /> }
];

const DEADLINE_FILTER_OPTIONS: Array<{ label: string; value: DeadlineFilter; content: ReactElement }> = [
  { label: "All", value: "all", content: <DeadlineFilterOption filter="all" label="All" /> },
  { label: "Has DDL", value: "has-ddl", content: <DeadlineFilterOption filter="has-ddl" label="Has DDL" /> },
  { label: "No DDL", value: "no-ddl", content: <DeadlineFilterOption filter="no-ddl" label="No DDL" /> },
  { label: "Overdue", value: "overdue", content: <DeadlineFilterOption filter="overdue" label="Overdue" /> },
  { label: "Next 7 Days", value: "7d", content: <DeadlineFilterOption filter="7d" label="Next 7 Days" /> },
  { label: "Next 30 Days", value: "30d", content: <DeadlineFilterOption filter="30d" label="Next 30 Days" /> }
];

function CalendarDayEvents({
  day,
  onOpenItem
}: {
  day: CalendarCell;
  onOpenItem: (itemId: string) => void;
}): ReactElement {
  const sections = [
    {
      key: "deadline",
      title: "DDL",
      events: day.summary.deadlines,
      className: "is-deadline"
    },
    {
      key: "created",
      title: "Created",
      events: day.summary.created,
      className: "is-created"
    },
    {
      key: "completed",
      title: "Completed",
      events: day.summary.completed,
      className: "is-completed"
    }
  ].filter((group) => group.events.length > 0);

  if (sections.length === 0) {
    return (
      <div className="board-section-empty">
        No matching items on this day.
      </div>
    );
  }

  return (
    <div className="board-calendar-event-groups">
      {sections.map((group) => (
        <section key={group.key} className="board-calendar-event-group">
          <header className="board-calendar-event-group-header">
            <i className={`board-calendar-dot ${group.className}`} />
            <strong>{group.title}</strong>
            <span>{group.events.length}</span>
          </header>
          <div className="board-calendar-event-list">
            {group.events.map((event) => (
              <button
                key={`${group.key}:${event.item.id}`}
                type="button"
                className="board-calendar-event-item"
                onClick={() => onOpenItem(event.item.id)}
              >
                <span className="board-calendar-event-copy">
                  <strong>{event.item.name}</strong>
                  <span>{event.section.name}</span>
                </span>
                {event.item.deadlineAt ? (
                  <span className={isOverdue(event.item) ? "board-item-deadline is-overdue" : "board-item-deadline"}>
                    {formatDeadlineTag(event.item.deadlineAt)}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function BoardDetailLine({ label, value }: { label: string; value: string }): ReactElement {
  return (
    <div className="board-detail-line">
      <span>{label}</span>
      <code>{value}</code>
    </div>
  );
}

function BoardStatusIcon({ status }: { status: BoardItem["status"] }): ReactElement {
  const className = `board-status-icon is-${status}`;
  if (status === "done") {
    return (
      <span className={className} aria-hidden="true">
        <svg viewBox="0 0 28 28" role="presentation">
          <path d="M14 22.5v-5.8" />
          <path d="M10.8 24.2h6.4" />
          <path d="M14 15.6c-1.7 0-3.2-.8-4.3-2.1-1.7.2-3.4-.4-4.6-1.7.7-2 2.3-3.5 4.3-4 .4-2.7 2.3-5 4.6-6.2 2.3 1.2 4.2 3.5 4.6 6.2 2 .5 3.6 2 4.3 4-1.2 1.3-2.9 1.9-4.6 1.7-1.1 1.3-2.6 2.1-4.3 2.1Z" />
          <path d="M7.6 12.1c1.9.2 3.3-.4 4.5-1.7" />
          <path d="M20.4 12.1c-1.9.2-3.3-.4-4.5-1.7" />
        </svg>
      </span>
    );
  }
  if (status === "doing") {
    return (
      <span className={className} aria-hidden="true">
        <svg viewBox="0 0 28 28" role="presentation">
          <path d="M14 23.4v-8.2" />
          <path d="M10.4 24.2h7.2" />
          <path d="M14.1 15.1c.2-4 2.5-7 6.2-8.1.1 3.8-1.4 6.9-4.8 8.7" />
          <path d="M13.9 15.7c-3.1-.2-5.8-2.1-7-5.3 3.4-.2 6 1.1 7.8 4" />
        </svg>
      </span>
    );
  }
  return (
    <span className={className} aria-hidden="true">
      <svg viewBox="0 0 28 28" role="presentation">
        <path d="M14 21.6v-4.2" />
        <path d="M10.4 23.2h7.2" />
        <path d="M13.8 17.1c0-3.4 2.2-5.8 5.7-6.9.2 4.3-1.9 7-5.7 8.6-3.8-1.6-5.9-4.3-5.7-8.6 3.5 1.1 5.7 3.5 5.7 6.9Z" />
        <path d="M11.2 20.1c1 .7 1.9 1.1 2.8 1.3" />
        <path d="M16.8 20.1c-1 .7-1.9 1.1-2.8 1.3" />
      </svg>
    </span>
  );
}

function StatusFilterOption({ status, label }: { status: StatusFilter; label: string }): ReactElement {
  return (
    <>
      <StatusFilterIcon status={status} />
      <span>{label}</span>
    </>
  );
}

function StatusFilterIcon({ status }: { status: StatusFilter }): ReactElement {
  if (status === "all") {
    return (
      <span className="board-status-filter-icon is-all" aria-hidden="true">
        <svg viewBox="0 0 24 24" role="presentation">
          <circle cx="12" cy="12" r="8.5" />
          <path d="M12 7.5v9" />
          <path d="M7.5 12h9" />
        </svg>
      </span>
    );
  }
  return <BoardStatusIcon status={status} />;
}

function DeadlineFilterOption({ filter, label }: { filter: DeadlineFilter; label: string }): ReactElement {
  return (
    <>
      <DeadlineMoodIcon filter={filter} />
      <span>{label}</span>
    </>
  );
}

function DeadlineMoodIcon({ filter }: { filter: DeadlineFilter }): ReactElement {
  return (
    <span className={`board-deadline-filter-icon is-${filter}`} aria-hidden="true">
      <svg viewBox="0 0 24 24" role="presentation">
        <circle cx="12" cy="12" r="8.5" />
        <path d={deadlineMoodEyesPath(filter)} />
        <path d={deadlineMoodMouthPath(filter)} />
        {filter === "overdue" ? <path d="M7.2 6.9 9.4 8.6" /> : null}
        {filter === "7d" ? <path d="M16.8 6.9 14.6 8.6" /> : null}
      </svg>
    </span>
  );
}

function deadlineMoodEyesPath(filter: DeadlineFilter): string {
  switch (filter) {
    case "overdue":
      return "M8.1 10.3 10.1 11.7 M10.1 10.3 8.1 11.7 M13.9 10.3 15.9 11.7 M15.9 10.3 13.9 11.7";
    case "7d":
      return "M8.2 10.1c.5-.8 1.2-1.2 2-1.2s1.5.4 2 1.2 M13.8 10.5c.4-.9 1.1-1.4 2-1.4.8 0 1.5.5 2 1.4";
    default:
      return "M9.1 10.2h.01 M14.9 10.2h.01";
  }
}

function deadlineMoodMouthPath(filter: DeadlineFilter): string {
  switch (filter) {
    case "no-ddl":
      return "M8.2 14.2c1 1.4 2.4 2.1 3.8 2.1 1.4 0 2.8-.7 3.8-2.1";
    case "30d":
      return "M8.3 15c1-.9 2.3-1.4 3.7-1.4 1.4 0 2.7.5 3.7 1.4";
    case "has-ddl":
      return "M8.4 15.1c1-.4 2.2-.7 3.6-.7 1.4 0 2.6.3 3.6.7";
    case "7d":
      return "M8.4 15.6c.9-.9 2.1-1.3 3.6-1.3s2.7.4 3.6 1.3";
    case "overdue":
      return "M8.4 16.6c.9-1.4 2.1-2.1 3.6-2.1s2.7.7 3.6 2.1";
    default:
      return "M8.7 15.3h6.6";
  }
}

function filterSections(
  document: BoardDocument | null,
  statusFilter: StatusFilter,
  deadlineFilter: DeadlineFilter
): BoardSection[] {
  if (!document) {
    return [];
  }
  return document.sections
    .map((section) => ({
      ...section,
      items: section.items.filter((item) => matchesFilters(item, statusFilter, deadlineFilter))
    }))
    .filter((section) => section.items.length > 0);
}

function matchesFilters(item: BoardItem, statusFilter: StatusFilter, deadlineFilter: DeadlineFilter): boolean {
  if (statusFilter !== "all" && item.status !== statusFilter) {
    return false;
  }

  const deadline = item.deadlineAt;
  const today = todayDateKey();

  switch (deadlineFilter) {
    case "all":
      return true;
    case "has-ddl":
      return Boolean(deadline);
    case "no-ddl":
      return !deadline;
    case "overdue":
      return Boolean(deadline) && item.status !== "done" && (deadline ?? "") < today;
    case "7d":
      return Boolean(deadline) && withinDays(today, deadline, 7);
    case "30d":
      return Boolean(deadline) && withinDays(today, deadline, 30);
    default:
      return true;
  }
}

function resolveSelectedItem(sections: BoardSection[], selectedItemId: string | null): SelectedBoardItem | null {
  if (!selectedItemId) {
    return null;
  }
  for (const section of sections) {
    const item = section.items.find((candidate) => candidate.id === selectedItemId);
    if (item) {
      return { item, section };
    }
  }
  return null;
}

function buildCalendarDays(sections: BoardSection[], visibleMonth: Date): CalendarCell[] {
  const summaries = new Map<string, CalendarDaySummary>();
  for (const section of sections) {
    for (const item of section.items) {
      pushCalendarEvent(summaries, toLocalDateKey(item.createdAt), "created", item, section);
      if (item.completedAt) {
        pushCalendarEvent(summaries, toLocalDateKey(item.completedAt), "completed", item, section);
      }
      if (item.deadlineAt) {
        pushCalendarEvent(summaries, item.deadlineAt, "deadline", item, section);
      }
    }
  }

  const start = startOfWeek(startOfMonth(visibleMonth));
  const end = endOfWeek(endOfMonth(visibleMonth));
  const days: CalendarCell[] = [];
  for (let cursor = new Date(start); cursor <= end; cursor = addDays(cursor, 1)) {
    const dateKey = localDateKey(cursor);
    days.push({
      dateKey,
      dayNumber: cursor.getDate(),
      isCurrentMonth: cursor.getMonth() === visibleMonth.getMonth() && cursor.getFullYear() === visibleMonth.getFullYear(),
      isToday: dateKey === todayDateKey(),
      summary: summaries.get(dateKey) ?? emptyDaySummary(dateKey)
    });
  }
  return days;
}

function pushCalendarEvent(
  summaries: Map<string, CalendarDaySummary>,
  dateKey: string,
  kind: CalendarEventKind,
  item: BoardItem,
  section: BoardSection
): void {
  const summary = summaries.get(dateKey) ?? emptyDaySummary(dateKey);
  if (kind === "created") {
    summary.created.push({ kind, item, section });
  } else if (kind === "completed") {
    summary.completed.push({ kind, item, section });
  } else {
    summary.deadlines.push({ kind, item, section });
  }
  summaries.set(dateKey, summary);
}

function emptyDaySummary(dateKey: string): CalendarDaySummary {
  return {
    dateKey,
    created: [],
    completed: [],
    deadlines: []
  };
}

function formatItemMeta(item: BoardItem): string {
  const parts = [];
  if (item.deadlineAt) {
    parts.push(`DDL ${formatDeadlineDelta(item.deadlineAt)}`);
  }
  parts.push(`Created ${formatTimestamp(item.createdAt)}`);
  if (item.completedAt) {
    parts.push(`Completed ${formatTimestamp(item.completedAt)}`);
  }
  return parts.join(" · ");
}

// Board list cards stay intentionally compact: title/deadline on row 1, meta on row 2.
// Long-form description remains available in the detail drawer instead of the list.

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function formatLongDate(dateKey: string): string {
  const date = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return dateKey;
  }
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
    weekday: "long"
  }).format(date);
}

function formatMonthLabel(date: Date): string {
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "long"
  }).format(date);
}

function formatDeadlineTag(deadlineAt: string): string {
  return formatDeadlineDelta(deadlineAt);
}

function formatDeadlineDelta(deadlineAt: string): string {
  const deadline = new Date(`${deadlineAt}T23:59:00`);
  if (Number.isNaN(deadline.getTime())) {
    return deadlineAt;
  }

  const diffMs = deadline.getTime() - Date.now();
  const absMs = Math.abs(diffMs);
  const totalMinutes = Math.max(1, Math.floor(absMs / 60_000));
  const totalHours = Math.max(1, Math.floor(absMs / 3_600_000));
  const totalDays = Math.max(1, Math.floor(absMs / 86_400_000));

  const compact =
    totalMinutes < 60
      ? `${totalMinutes}m`
      : totalHours < 24
        ? `${totalHours}h`
        : `${totalDays}d`;

  return diffMs >= 0 ? `in ${compact}` : `overdue ${compact}`;
}

function isOverdue(item: BoardItem): boolean {
  return Boolean(item.deadlineAt) && item.status !== "done" && (item.deadlineAt ?? "") < todayDateKey();
}

function withinDays(todayKey: string, deadlineAt: string | null, days: number): boolean {
  if (!deadlineAt) {
    return false;
  }
  return deadlineAt >= todayKey && deadlineAt <= addDaysToDateKey(todayKey, days);
}

function todayDateKey(): string {
  return localDateKey(new Date());
}

function toLocalDateKey(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value.slice(0, 10);
  }
  return localDateKey(date);
}

function localDateKey(date: Date): string {
  const year = date.getFullYear().toString().padStart(4, "0");
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDaysToDateKey(dateKey: string, days: number): string {
  const date = new Date(`${dateKey}T00:00:00`);
  return localDateKey(addDays(date, days));
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0);
}

function startOfWeek(date: Date): Date {
  const offset = (date.getDay() + 6) % 7;
  return addDays(date, -offset);
}

function endOfWeek(date: Date): Date {
  const offset = 6 - ((date.getDay() + 6) % 7);
  return addDays(date, offset);
}

function addMonths(date: Date, diff: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + diff, 1);
}

function addDays(date: Date, diff: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + diff);
  return next;
}
