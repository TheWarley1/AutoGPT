import { createParser } from "eventsource-parser";
import type { MutableValue } from "./copilotStreamTransport";

export interface StreamActivity {
  lastReceivedAt: number;
  finished: boolean;
  noActiveStream?: boolean;
}

export function trackStreamActivity(
  body: ReadableStream<Uint8Array>,
  activity: StreamActivity,
) {
  const decoder = new TextDecoder();
  const parser = createParser({
    onEvent(event) {
      try {
        const data: unknown = JSON.parse(event.data);
        if (
          data &&
          typeof data === "object" &&
          "type" in data &&
          data.type === "finish"
        ) {
          activity.finished = true;
        }
      } catch {}
    },
  });
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        activity.lastReceivedAt = Date.now();
        parser.feed(decoder.decode(chunk, { stream: true }));
        controller.enqueue(chunk);
      },
    }),
  );
}

export function streamIsAlive(
  ref: MutableValue<StreamActivity | null> | undefined,
  timeoutMs: number,
) {
  const activity = ref?.current;
  return !!activity && Date.now() - activity.lastReceivedAt < timeoutMs;
}
