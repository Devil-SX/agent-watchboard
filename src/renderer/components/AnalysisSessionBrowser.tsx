import { useEffect, useState, type ReactElement } from "react";

import type {
  AnalysisProjectSummary,
  AnalysisSessionDetail,
  AnalysisSessionSectionSummary,
  AnalysisSessionStatistics,
  AnalysisSessionSummary
} from "@shared/ipc";

import {
  buildSectionBrowserBreakdown,
  buildSessionBrowserBreakdown,
  formatBrowserBreakdownValue,
  formatCompactMetric,
  formatDuration,
  getSessionBrowserSortMetricOptions,
  normalizeSessionBrowserSortMetric,
  sortSessionBrowserItems,
  type SessionBrowserBreakdownSegment,
  type SessionBrowserMetricMode,
  type SessionBrowserSortDirection,
  type SessionBrowserSortKey,
  type SessionBrowserSortMetric
} from "@renderer/components/analysisShared";

type AnalysisSessionBrowserProps = {
  projects: AnalysisProjectSummary[];
  projectsLoading: boolean;
  projectError: string;
  selectedProjectKey: string | null;
  projectSessions: AnalysisSessionSummary[];
  projectSessionsByKey: Map<string, AnalysisSessionSummary[]>;
  projectSessionsLoading: boolean;
  sessionSections: AnalysisSessionSectionSummary[];
  sessionSectionsById: Map<string, AnalysisSessionSectionSummary[]>;
  sessionSectionsLoading: boolean;
  sessionError: string;
  selectedSessionId: string | null;
  selectedSectionId: string | null;
  sessionDetail: AnalysisSessionDetail | null;
  sessionStatistics: AnalysisSessionStatistics | null;
  sessionStatisticsById: Map<string, AnalysisSessionStatistics | null>;
  onSelectProject: (projectKey: string) => void;
  onSelectSession: (sessionId: string) => void;
  onSelectSection: (sectionId: string) => void;
};

export function AnalysisSessionBrowser({
  projects,
  projectsLoading,
  projectError,
  selectedProjectKey,
  projectSessions,
  projectSessionsByKey,
  projectSessionsLoading,
  sessionSections,
  sessionSectionsById,
  sessionSectionsLoading,
  sessionError,
  selectedSessionId,
  selectedSectionId,
  sessionDetail,
  sessionStatistics,
  sessionStatisticsById,
  onSelectProject,
  onSelectSession,
  onSelectSection
}: AnalysisSessionBrowserProps): ReactElement {
  const [collapsedProjects, setCollapsedProjects] = useState<Record<string, boolean>>({});
  const [collapsedSessions, setCollapsedSessions] = useState<Record<string, boolean>>({});
  const [browserMetricMode, setBrowserMetricMode] = useState<SessionBrowserMetricMode>("messages");
  const [browserSortKey, setBrowserSortKey] = useState<SessionBrowserSortKey>("alphabetic");
  const [browserSortDirection, setBrowserSortDirection] = useState<SessionBrowserSortDirection>("asc");
  const [browserSortMetric, setBrowserSortMetric] = useState<SessionBrowserSortMetric>("assistant");

  useEffect(() => {
    if (selectedProjectKey) {
      setCollapsedProjects((current) => ({ ...current, [selectedProjectKey]: false }));
    }
  }, [selectedProjectKey]);

  useEffect(() => {
    if (selectedSessionId) {
      setCollapsedSessions((current) => ({ ...current, [selectedSessionId]: false }));
    }
  }, [selectedSessionId]);

  useEffect(() => {
    setBrowserSortMetric((current) => normalizeSessionBrowserSortMetric(browserSortKey, current));
  }, [browserSortKey]);

  const metricOptions = getSessionBrowserSortMetricOptions(browserSortKey);

  return (
    <article className="analysis-card analysis-sidebar">
      <div className="analysis-card-header">
        <h3>Session Browser</h3>
        <div className="analysis-browser-header-actions">
          <div className="analysis-browser-toggle" role="group" aria-label="Session browser metrics">
            <button
              type="button"
              className={browserMetricMode === "messages" ? "analysis-browser-toggle-button is-active" : "analysis-browser-toggle-button"}
              onClick={() => setBrowserMetricMode("messages")}
            >
              Messages
            </button>
            <button
              type="button"
              className={browserMetricMode === "hours" ? "analysis-browser-toggle-button is-active" : "analysis-browser-toggle-button"}
              onClick={() => setBrowserMetricMode("hours")}
            >
              Hours
            </button>
          </div>
          <div className="analysis-browser-toggle" role="group" aria-label="Session browser sort key">
            <button
              type="button"
              className={browserSortKey === "alphabetic" ? "analysis-browser-toggle-button is-active" : "analysis-browser-toggle-button"}
              onClick={() => setBrowserSortKey("alphabetic")}
            >
              A-Z
            </button>
            <button
              type="button"
              className={browserSortKey === "messages" ? "analysis-browser-toggle-button is-active" : "analysis-browser-toggle-button"}
              onClick={() => setBrowserSortKey("messages")}
            >
              Message
            </button>
            <button
              type="button"
              className={browserSortKey === "hours" ? "analysis-browser-toggle-button is-active" : "analysis-browser-toggle-button"}
              onClick={() => setBrowserSortKey("hours")}
            >
              Time
            </button>
          </div>
          <div className="analysis-browser-toggle" role="group" aria-label="Session browser sort direction">
            <button
              type="button"
              className={browserSortDirection === "asc" ? "analysis-browser-toggle-button is-active" : "analysis-browser-toggle-button"}
              onClick={() => setBrowserSortDirection("asc")}
            >
              Asc
            </button>
            <button
              type="button"
              className={browserSortDirection === "desc" ? "analysis-browser-toggle-button is-active" : "analysis-browser-toggle-button"}
              onClick={() => setBrowserSortDirection("desc")}
            >
              Desc
            </button>
          </div>
          {metricOptions.length > 0 ? (
            <div className="analysis-browser-toggle" role="group" aria-label="Session browser sort metric">
              {metricOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  className={browserSortMetric === option.value ? "analysis-browser-toggle-button is-active" : "analysis-browser-toggle-button"}
                  onClick={() => setBrowserSortMetric(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          ) : null}
          <span className="entry-badge">{projects.length}</span>
        </div>
      </div>
      {projectError ? <div className="toolbar-error">{projectError}</div> : null}
      {sessionError ? <div className="toolbar-error">{sessionError}</div> : null}
      <div className="analysis-tree">
        {projectsLoading ? <div className="panel-empty"><p>Loading projects...</p></div> : null}
        {projects.map((project) => {
          const projectCollapsed = collapsedProjects[project.projectKey] ?? project.projectKey !== selectedProjectKey;
          const cachedProjectSessions = projectSessionsByKey.get(project.projectKey) ?? [];
          const renderedProjectSessions = sortSessionBrowserItems(
            project.projectKey === selectedProjectKey ? projectSessions : cachedProjectSessions,
            browserSortKey,
            browserSortDirection,
            browserSortMetric,
            (session) => session.sessionId,
            (session) =>
              buildSessionBrowserBreakdown(
                sessionDetail?.summary.sessionId === session.sessionId ? sessionDetail : null,
                session.sessionId === selectedSessionId ? sessionSections : sessionSectionsById.get(session.sessionId) ?? [],
                session.sessionId === selectedSessionId ? sessionStatistics : sessionStatisticsById.get(session.sessionId) ?? null,
                browserSortKey === "hours" ? "hours" : "messages"
              )
          );
          const showProjectSessions = !projectCollapsed;
          return (
            <div key={project.projectKey || "__unknown_project__"} className="analysis-tree-node" data-analysis-tree-kind="project">
              <button
                type="button"
                className={project.projectKey === selectedProjectKey ? "analysis-tree-row is-active" : "analysis-tree-row"}
                data-analysis-tree-kind="project"
                data-analysis-project-key={project.projectKey}
                onClick={() => {
                  onSelectProject(project.projectKey);
                  setCollapsedProjects((current) => ({
                    ...current,
                    [project.projectKey]: !(current[project.projectKey] ?? project.projectKey !== selectedProjectKey)
                  }));
                }}
              >
                <span className={projectCollapsed ? "board-toggle-caret is-collapsed" : "board-toggle-caret"} />
                <span className="analysis-tree-copy">
                  <strong>{project.projectPath ?? "Unknown project"}</strong>
                  <span>{project.sessionCount} sessions · {formatCompactMetric(project.totalTokens)} tokens</span>
                </span>
              </button>
              {showProjectSessions ? (
                <div className="analysis-tree-children">
                  {project.projectKey === selectedProjectKey && projectSessionsLoading ? <div className="analysis-tree-empty">Loading sessions...</div> : null}
                  {project.projectKey === selectedProjectKey || renderedProjectSessions.length > 0 ? null : (
                    <div className="analysis-tree-empty">Select this project to load sessions.</div>
                  )}
                  {renderedProjectSessions.map((session) => {
                    const sessionCollapsed = collapsedSessions[session.sessionId] ?? session.sessionId !== selectedSessionId;
                    const renderedSessionSections = sortSessionBrowserItems(
                      session.sessionId === selectedSessionId ? sessionSections : sessionSectionsById.get(session.sessionId) ?? [],
                      browserSortKey,
                      browserSortDirection,
                      browserSortMetric,
                      (section) => section.title || `Section ${section.sectionIndex + 1}`,
                      (section) =>
                        buildSectionBrowserBreakdown(
                          section,
                          browserSortKey === "hours" ? "hours" : "messages",
                          sessionDetail?.summary.sessionId === session.sessionId ? sessionDetail.entries : []
                        )
                    );
                    const showSections = !sessionCollapsed;
                    const rowStatistics =
                      session.sessionId === selectedSessionId
                        ? sessionStatistics
                        : sessionStatisticsById.get(session.sessionId) ?? null;
                    return (
                      <div key={session.sessionId} className="analysis-tree-node" data-analysis-tree-kind="session">
                        <button
                          type="button"
                          className={session.sessionId === selectedSessionId ? "analysis-tree-row is-active" : "analysis-tree-row"}
                          data-analysis-tree-kind="session"
                          data-analysis-session-id={session.sessionId}
                          onClick={() => {
                            onSelectSession(session.sessionId);
                            setCollapsedSessions((current) => ({
                              ...current,
                              [session.sessionId]: !(current[session.sessionId] ?? session.sessionId !== selectedSessionId)
                            }));
                          }}
                        >
                          <span className={sessionCollapsed ? "board-toggle-caret is-collapsed" : "board-toggle-caret"} />
                          <span className="analysis-tree-content">
                            <span className="analysis-tree-copy">
                              <strong>{session.sessionId}</strong>
                              <span>{formatDuration(session.durationSeconds)} · {formatCompactMetric(session.totalTokens)} tokens</span>
                            </span>
                            <TreeStackedBar
                              segments={buildSessionBrowserBreakdown(
                                sessionDetail?.summary.sessionId === session.sessionId ? sessionDetail : null,
                                renderedSessionSections,
                                rowStatistics,
                                browserMetricMode
                              )}
                              mode={browserMetricMode}
                            />
                          </span>
                        </button>
                        {showSections ? (
                          <div className="analysis-tree-children">
                            {session.sessionId === selectedSessionId && sessionSectionsLoading ? (
                              <div className="analysis-tree-empty">Loading sections...</div>
                            ) : null}
                            {session.sessionId === selectedSessionId || renderedSessionSections.length > 0 ? null : (
                              <div className="analysis-tree-empty">Select this session to load sections.</div>
                            )}
                            {session.sessionId === selectedSessionId && !sessionSectionsLoading && renderedSessionSections.length === 0 ? (
                              <div className="analysis-tree-empty">No materialized sections.</div>
                            ) : null}
                            {renderedSessionSections.map((section) => (
                              <button
                                key={section.sectionId}
                                type="button"
                                className={section.sectionId === selectedSectionId ? "analysis-tree-leaf is-active" : "analysis-tree-leaf"}
                                data-analysis-tree-kind="section"
                                data-analysis-section-id={section.sectionId}
                                onClick={() => onSelectSection(section.sectionId)}
                              >
                                <span className="analysis-tree-content">
                                  <span className="analysis-tree-copy">
                                    <strong>{section.title}</strong>
                                    <span>{section.totalMessages} msgs · {formatCompactMetric(section.totalTokens)} tokens</span>
                                  </span>
                                  <TreeStackedBar
                                    segments={buildSectionBrowserBreakdown(
                                      section,
                                      browserMetricMode,
                                      sessionDetail?.summary.sessionId === session.sessionId ? sessionDetail.entries : []
                                    )}
                                    mode={browserMetricMode}
                                  />
                                </span>
                              </button>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </article>
  );
}

function TreeStackedBar({
  segments,
  mode
}: {
  segments: SessionBrowserBreakdownSegment[];
  mode: SessionBrowserMetricMode;
}): ReactElement | null {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  if (total <= 0) {
    return null;
  }

  return (
    <div className="analysis-tree-stack">
      <div className="analysis-tree-stack-bar" aria-label={`${mode} mix`}>
        {segments.map((segment) => (
          <span
            key={segment.label}
            className={`analysis-tree-stack-segment is-${segment.tone}`}
            style={{ width: `${(segment.value / total) * 100}%` }}
            title={`${segment.label}: ${formatBrowserBreakdownValue(segment.value, mode)}`}
          />
        ))}
      </div>
      <div className="analysis-tree-stack-legend">
        {segments.map((segment) => (
          <span key={segment.label}>
            {segment.label} {formatBrowserBreakdownValue(segment.value, mode)}
          </span>
        ))}
      </div>
    </div>
  );
}
