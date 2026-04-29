import { type ReactElement } from "react";

type Props = {
  active: boolean;
  variant?: "pane" | "workspace";
};

type OrbitConfig = {
  periodSeconds: number;
};

const ORBIT_PATH =
  "M 15.5 4.5 H 84.5 A 11 11 0 0 1 95.5 15.5 V 84.5 A 11 11 0 0 1 84.5 95.5 H 15.5 A 11 11 0 0 1 4.5 84.5 V 15.5 A 11 11 0 0 1 15.5 4.5";

const ORBIT_CONFIGS: Record<NonNullable<Props["variant"]>, OrbitConfig> = {
  pane: {
    periodSeconds: 2.1
  },
  workspace: {
    periodSeconds: 2.55
  }
};

function formatBeginSeconds(seconds: number): string {
  return `${seconds === 0 ? 0 : -Number(seconds.toFixed(3))}s`;
}

export function StatusOrbit({ active, variant = "pane" }: Props): ReactElement | null {
  if (!active) {
    return null;
  }

  const config = ORBIT_CONFIGS[variant];

  return (
    <span className={`status-orbit is-${variant}`} aria-hidden="true">
      <svg className="status-orbit-svg" viewBox="0 0 100 100" preserveAspectRatio="none" role="presentation">
        <path className="status-orbit-path is-aura" d={ORBIT_PATH} pathLength={100} />
        <path className="status-orbit-path is-track" d={ORBIT_PATH} pathLength={100} />
        <StatusComet className="is-primary" periodSeconds={config.periodSeconds} beginSeconds={0} />
        <StatusComet className="is-secondary" periodSeconds={config.periodSeconds} beginSeconds={config.periodSeconds / 2} />
      </svg>
    </span>
  );
}

function StatusComet({
  className,
  periodSeconds,
  beginSeconds
}: {
  className: string;
  periodSeconds: number;
  beginSeconds: number;
}): ReactElement {
  return (
    <g className={`status-orbit-comet ${className}`}>
      <line className="status-orbit-comet-glow" x1="-9" y1="0" x2="0" y2="0" />
      <line className="status-orbit-comet-core" x1="-4.5" y1="0" x2="0" y2="0" />
      <animateMotion dur={`${periodSeconds}s`} begin={formatBeginSeconds(beginSeconds)} repeatCount="indefinite" rotate="auto" path={ORBIT_PATH} />
    </g>
  );
}
