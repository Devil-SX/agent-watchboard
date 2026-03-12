import { useEffect, useMemo, useState, type ReactElement } from "react";

import { CalendarIcon, IconButton, ListIcon } from "@renderer/components/IconButton";
import type { BoardDocument, BoardItem, BoardSection } from "@shared/schema";

type Props = {
  document: BoardDocument | null;
};

type SelectedBoardItem = {
  item: BoardItem;
  section: BoardSection;
};

type BoardViewMode = "list" | "calendar";
type StatusFilter = "all" | "todo" | "done";
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

export function BoardTree({ document }: Props): ReactElement {
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

  if (!document || document.sections.length === 0) {
    return (
      <div className="panel-empty">
        <p>No board data loaded.</p>
        <span>Use the repo-local `todo_preview` command to populate the JSON board.</span>
      </div>
    );
  }

  return (
    <div className="board-tree-shell">
      <div className="board-toolbar">
        <div className="board-toolbar-group">
          <IconButton label="List" icon={<ListIcon />} isActive={viewMode === "list"} onClick={() => setViewMode("list")} />
          <IconButton
            label="Calendar"
            icon={<CalendarIcon />}
            isActive={viewMode === "calendar"}
            onClick={() => setViewMode("calendar")}
          />
        </div>

        <div className="board-toolbar-group">
          <label className="board-filter">
            <span>Status</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}>
              <option value="all">All</option>
              <option value="todo">Todo</option>
              <option value="done">Done</option>
            </select>
          </label>

          <label className="board-filter">
            <span>DDL</span>
            <select value={deadlineFilter} onChange={(event) => setDeadlineFilter(event.target.value as DeadlineFilter)}>
              <option value="all">All</option>
              <option value="has-ddl">Has DDL</option>
              <option value="no-ddl">No DDL</option>
              <option value="overdue">Overdue</option>
              <option value="7d">Next 7 Days</option>
              <option value="30d">Next 30 Days</option>
            </select>
          </label>
        </div>
      </div>

      <div className="board-tree">
        {viewMode === "list" ? (
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
                            <span className={`board-node-status ${item.status === "done" ? "is-done" : "is-todo"}`} />
                            <span className="board-item-copy">
                              <span className="board-item-title-row">
                                <strong>{item.name}</strong>
                                <span className={item.status === "done" ? "board-item-badge is-done" : "board-item-badge is-todo"}>
                                  {item.status}
                                </span>
                                {item.deadlineAt ? (
                                  <span className={isOverdue(item) ? "board-item-deadline is-overdue" : "board-item-deadline"}>
                                    DDL {item.deadlineAt}
                                  </span>
                                ) : null}
                              </span>
                              {item.description ? <span className="board-item-description">{item.description}</span> : null}
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
                <span className={`board-node-status ${selected.item.status === "done" ? "is-done" : "is-todo"}`} />
                <span className={selected.item.status === "done" ? "board-item-badge is-done" : "board-item-badge is-todo"}>
                  {selected.item.status}
                </span>
                {selected.item.deadlineAt ? (
                  <span className={isOverdue(selected.item) ? "board-item-deadline is-overdue" : "board-item-deadline"}>
                    DDL {selected.item.deadlineAt}
                  </span>
                ) : null}
              </div>

              <div className="board-detail-section">
                <span className="board-detail-label">Description</span>
                <p>{selected.item.description || "No description."}</p>
              </div>

              <div className="board-detail-grid">
                <BoardDetailLine label="Section" value={selected.section.name} />
                <BoardDetailLine label="DDL" value={selected.item.deadlineAt ?? "No deadline"} />
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
                    DDL {event.item.deadlineAt}
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
    parts.push(`DDL ${item.deadlineAt}`);
  }
  parts.push(`Created ${formatTimestamp(item.createdAt)}`);
  if (item.completedAt) {
    parts.push(`Completed ${formatTimestamp(item.completedAt)}`);
  }
  return parts.join(" · ");
}

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
