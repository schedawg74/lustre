import { useEffect, useState } from "react";
import type { WxtStorageItem } from "wxt/utils/storage";

/** The current value of a storage item, updated when any context changes it. */
export const useStorageItem = <T, M extends Record<string, unknown>>(
  item: WxtStorageItem<T, M>
): T => {
  const [value, setValue] = useState<T>(item.fallback);
  useEffect(() => {
    let active = true;
    item.getValue().then((stored) => {
      if (active) {
        setValue(stored);
      }
    });
    const unwatch = item.watch((next) => setValue(next ?? item.fallback));
    return () => {
      active = false;
      unwatch();
    };
  }, [item]);
  return value;
};

/** Re-renders every `ms`, for values that depend on the current time. */
export const useNow = (ms: number): number => {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(timer);
  }, [ms]);
  return now;
};
