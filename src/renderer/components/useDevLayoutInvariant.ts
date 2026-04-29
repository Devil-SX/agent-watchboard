import { useEffect, useRef, type RefObject } from "react";

type LayoutInvariantRef = RefObject<Element | null>;

export function useDevLayoutInvariant(
  name: string,
  refs: readonly LayoutInvariantRef[],
  check: () => string | null,
  deps: readonly unknown[] = []
): void {
  const lastMessageRef = useRef<string | null>(null);
  // Vite injects `import.meta.env.DEV` in the renderer bundle, but node/jsdom tests
  // execute this hook without that shim. Treat missing env metadata as non-dev so
  // diagnostics never break deterministic unit tests.
  const isDev = Boolean((import.meta as ImportMeta & { env?: { DEV?: boolean } }).env?.DEV);

  useEffect(() => {
    if (!isDev || typeof window === "undefined") {
      return;
    }

    const targets = refs
      .map((ref) => ref.current)
      .filter((target): target is Element => target instanceof Element);
    if (targets.length === 0) {
      return;
    }

    let frameId = 0;

    const run = (): void => {
      if (frameId !== 0) {
        window.cancelAnimationFrame(frameId);
      }
      frameId = window.requestAnimationFrame(() => {
        frameId = 0;
        const nextMessage = check();
        if (nextMessage && nextMessage !== lastMessageRef.current) {
          lastMessageRef.current = nextMessage;
          console.warn(`[watchboard:layout] ${name}: ${nextMessage}`);
          return;
        }
        if (!nextMessage) {
          lastMessageRef.current = null;
        }
      });
    };

    run();
    const observer = new ResizeObserver(() => {
      run();
    });
    for (const target of targets) {
      observer.observe(target);
    }
    window.addEventListener("resize", run);

    return () => {
      if (frameId !== 0) {
        window.cancelAnimationFrame(frameId);
      }
      observer.disconnect();
      window.removeEventListener("resize", run);
    };
  }, [check, isDev, name, ...deps]);
}
