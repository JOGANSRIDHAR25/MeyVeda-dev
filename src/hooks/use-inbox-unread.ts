"use client";

import { useCallback, useEffect, useState } from "react";

const POLL_MS = 15000;

type InboxThreadLike = { unreadCount?: number; unread?: boolean };

/**
 * Polls the caller's inbox endpoint (pro-inbox for practitioners/assistants,
 * patient-inbox for patients) and returns the total number of unread
 * messages across all threads, for the sidebar nav badge.
 */
export function useUnreadInboxCount(enabled: boolean, endpoint: string): number {
  const [count, setCount] = useState(0);

  const load = useCallback(async () => {
    try {
      const response = await fetch(endpoint, { credentials: "include", cache: "no-store" });
      const result = await response.json();
      if (!response.ok || !result.success) return;

      const threads = (result.data ?? []) as InboxThreadLike[];
      const total = threads.reduce(
        (sum, t) => sum + (t.unreadCount ?? (t.unread ? 1 : 0)),
        0
      );
      setCount(total);
    } catch {
      // Best-effort — the sidebar badge just stays at its last known value.
    }
  }, [endpoint]);

  useEffect(() => {
    if (!enabled) {
      setCount(0);
      return;
    }
    void load();
    const interval = setInterval(load, POLL_MS);
    return () => clearInterval(interval);
  }, [enabled, load]);

  return count;
}
