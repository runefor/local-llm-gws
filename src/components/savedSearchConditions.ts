export type SavedSearchCondition<T> = {
  readonly id: string;
  readonly name: string;
  readonly version: 1;
  readonly values: T;
};

const safeStorage = () => {
  if (typeof window === "undefined") return null;
  return window.localStorage;
};

export function loadSavedSearchConditions<T>(key: string): SavedSearchCondition<T>[] {
  const storage = safeStorage();
  if (!storage) return [];
  try {
    const parsed: unknown = JSON.parse(storage.getItem(key) || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is SavedSearchCondition<T> => {
      if (!item || typeof item !== "object") return false;
      const record = item as Record<string, unknown>;
      return typeof record.id === "string" && typeof record.name === "string" && record.version === 1 && typeof record.values === "object" && record.values !== null;
    });
  } catch {
    return [];
  }
}

export function saveSearchCondition<T>(key: string, name: string, values: T): SavedSearchCondition<T>[] {
  const trimmedName = name.trim();
  const next = [
    { id: `${Date.now()}`, name: trimmedName, version: 1 as const, values },
    ...loadSavedSearchConditions<T>(key).filter((item) => item.name !== trimmedName),
  ].slice(0, 20);
  safeStorage()?.setItem(key, JSON.stringify(next));
  return next;
}
