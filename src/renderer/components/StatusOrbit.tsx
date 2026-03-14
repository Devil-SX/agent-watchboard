import { type ReactElement } from "react";

type Props = {
  active: boolean;
};

const ORBIT_PATH =
  "M 14 1.5 H 86 A 12.5 12.5 0 0 1 98.5 14 V 86 A 12.5 12.5 0 0 1 86 98.5 H 14 A 12.5 12.5 0 0 1 1.5 86 V 14 A 12.5 12.5 0 0 1 14 1.5";

export function StatusOrbit({ active }: Props): ReactElement | null {
  if (!active) {
    return null;
  }

  return (
    <span className="status-orbit" aria-hidden="true">
      <svg className="status-orbit-svg" viewBox="0 0 100 100" preserveAspectRatio="none" role="presentation">
        <path className="status-orbit-path" d={ORBIT_PATH} pathLength={100} />
        <circle className="status-orbit-dot is-primary" r="2.9">
          <animateMotion dur="3.4s" repeatCount="indefinite" rotate="auto" path={ORBIT_PATH} />
        </circle>
        <circle className="status-orbit-dot is-secondary" r="2.4">
          <animateMotion dur="3.4s" begin="-1.7s" repeatCount="indefinite" rotate="auto" path={ORBIT_PATH} />
        </circle>
      </svg>
    </span>
  );
}
