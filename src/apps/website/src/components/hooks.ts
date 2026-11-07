import {
  type RefObject,
  useEffect,
  useState,
  useSyncExternalStore,
} from "react";

/**
 * A media query. The server render and the first client render report a
 * match, so with `prefers-reduced-motion` the static page is complete.
 */
export const useMedia = (query: string): boolean =>
  useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(query);
      media.addEventListener("change", onChange);
      return () => media.removeEventListener("change", onChange);
    },
    () => window.matchMedia(query).matches,
    () => true
  );

export const usePageVisible = (): boolean =>
  useSyncExternalStore(
    (onChange) => {
      document.addEventListener("visibilitychange", onChange);
      return () => document.removeEventListener("visibilitychange", onChange);
    },
    () => !document.hidden,
    () => false
  );

export const useOnScreen = (ref: RefObject<Element | null>): boolean => {
  const [onScreen, setOnScreen] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) {
      return;
    }
    const observer = new IntersectionObserver(([entry]) =>
      setOnScreen(entry?.isIntersecting ?? false)
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return onScreen;
};
