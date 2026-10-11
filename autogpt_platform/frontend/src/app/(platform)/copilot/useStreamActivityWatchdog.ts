import { useMountEffect } from "@/hooks/useMountEffect";
import { useEffect, useRef } from "react";
import { streamIsAlive, type StreamActivity } from "./copilotStreamActivity";

// Heartbeats count as activity even while a tool has no visible output.
const STREAM_STALL_TIMEOUT_MS = 60_000;

type UseChatStatus = "submitted" | "streaming" | "ready" | "error";

interface UseStreamActivityWatchdogArgs {
  sessionId: string | null;
  status: UseChatStatus;
  /**
   * A monotonic-ish signal that changes whenever the stream produces any
   * visible content. In practice: rawMessages.length + a hash of the last
   * assistant message's parts. Any change resets the watchdog timer.
   */
  activityToken: string | number;
  /** True when a reconnect is already scheduled; the watchdog stays quiet. */
  isReconnectScheduled: boolean;
  /** True when the user explicitly stopped; the watchdog stays quiet. */
  isUserStoppingRef: React.MutableRefObject<boolean>;
  /**
   * Ref to the reconnect trigger. Called after ``STREAM_STALL_TIMEOUT_MS``
   * of no activity while the stream is active — this routes through the
   * existing reconnect cascade (toast + exponential backoff + 30 s forced
   * idle), so the UI can never get stuck on a dead stream.
   */
  handleReconnectRef: React.MutableRefObject<(force?: boolean) => void>;
  streamActivityRef?: React.MutableRefObject<StreamActivity | null>;
}

export function useStreamActivityWatchdog({
  sessionId,
  status,
  activityToken,
  isReconnectScheduled,
  isUserStoppingRef,
  handleReconnectRef,
  streamActivityRef,
}: UseStreamActivityWatchdogArgs) {
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    clearTimeout(timerRef.current);
    timerRef.current = undefined;

    if (!sessionId) return;
    if (status !== "streaming" && status !== "submitted") return;
    if (isReconnectScheduled) return;
    if (isUserStoppingRef.current) return;

    function checkActivity() {
      if (isUserStoppingRef.current) return;
      if (streamIsAlive(streamActivityRef, STREAM_STALL_TIMEOUT_MS)) {
        timerRef.current = setTimeout(checkActivity, STREAM_STALL_TIMEOUT_MS);
        return;
      }
      handleReconnectRef.current(true);
    }
    timerRef.current = setTimeout(checkActivity, STREAM_STALL_TIMEOUT_MS);

    return () => {
      clearTimeout(timerRef.current);
      timerRef.current = undefined;
    };
  }, [
    sessionId,
    status,
    activityToken,
    isReconnectScheduled,
    isUserStoppingRef,
    handleReconnectRef,
    streamActivityRef,
  ]);

  useMountEffect(() => {
    return () => {
      clearTimeout(timerRef.current);
      timerRef.current = undefined;
    };
  });
}
