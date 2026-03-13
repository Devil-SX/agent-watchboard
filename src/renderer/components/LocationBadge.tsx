import type { ReactElement } from "react";

import { HostIcon, WslIcon } from "@renderer/components/IconButton";
import type { AgentPathLocation } from "@shared/schema";

type LocationBadgeProps = {
  location: AgentPathLocation;
  tone?: "default" | "strong";
  showLabel?: boolean;
};

export function LocationBadge({ location, tone = "default", showLabel = true }: LocationBadgeProps): ReactElement {
  const className = ["location-badge", `is-${location}`, tone === "strong" ? "is-strong" : ""].filter(Boolean).join(" ");

  return (
    <span className={className}>
      <span className="location-badge-icon" aria-hidden="true">
        {location === "host" ? <HostIcon /> : <WslIcon />}
      </span>
      {showLabel ? <span>{location === "host" ? "Host" : "WSL"}</span> : null}
    </span>
  );
}

export function getLocationLabel(location: AgentPathLocation): string {
  return location === "host" ? "Host" : "WSL";
}
