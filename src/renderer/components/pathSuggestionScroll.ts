type ScrollableSuggestionList = {
  children: ArrayLike<{ scrollIntoView?: (options?: ScrollIntoViewOptions) => void }>;
};

export function scrollActivePathSuggestionIntoView(
  container: ScrollableSuggestionList | null | undefined,
  suggestionIndex: number
): void {
  if (!container || suggestionIndex < 0 || suggestionIndex >= container.children.length) {
    return;
  }

  container.children[suggestionIndex]?.scrollIntoView?.({
    block: "nearest"
  });
}
