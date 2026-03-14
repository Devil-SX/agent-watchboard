export function movePathSuggestionIndex(currentIndex: number, suggestionCount: number, direction: "up" | "down"): number {
  if (suggestionCount <= 0) {
    return -1;
  }
  if (currentIndex < 0) {
    return direction === "down" ? 0 : suggestionCount - 1;
  }
  if (direction === "down") {
    return (currentIndex + 1) % suggestionCount;
  }
  return (currentIndex - 1 + suggestionCount) % suggestionCount;
}
