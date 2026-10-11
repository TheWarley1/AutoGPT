import type { Chat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import type { MutableValue } from "./copilotStreamTransport";

export function createCopilotRequestLifecycle(
  chat: Chat<UIMessage>,
  controllerRef: MutableValue<AbortController | null>,
) {
  let active: Promise<void> | null = null;
  let activeKind: "send" | "resume" | null = null;
  let restarting: Promise<void> | null = null;
  let generation = 0;
  let stopped = false;

  function abortConnection() {
    void chat.stop();
    controllerRef.current?.abort();
  }

  function startRequest(start: () => Promise<void>, kind: "send" | "resume") {
    controllerRef.current = new AbortController();
    activeKind = kind;
    const request = start().finally(() => {
      if (active === request) {
        active = null;
        activeKind = null;
        controllerRef.current = null;
      }
    });
    active = request;
    return request;
  }

  function replaceRequest(
    start: () => Promise<void>,
    kind: "send" | "resume",
    beforeStart?: () => void,
  ) {
    const version = ++generation;
    const previous = active;
    abortConnection();
    const request = Promise.resolve(previous)
      .catch(() => {})
      .then(() => {
        if (version !== generation) return;
        restarting = null;
        beforeStart?.();
        return startRequest(start, kind);
      })
      .finally(() => {
        if (restarting === request) restarting = null;
      });
    restarting = request;
    return request;
  }

  function sendMessage(...args: Parameters<Chat<UIMessage>["sendMessage"]>) {
    stopped = false;
    if (active || restarting) {
      return replaceRequest(() => chat.sendMessage(...args), "send");
    }
    generation++;
    return startRequest(() => chat.sendMessage(...args), "send");
  }

  function resumeStream(beforeResume?: () => void, force = false) {
    if (stopped) return Promise.resolve();
    if (restarting) return restarting;
    if (active && activeKind === "resume" && !force) return active;
    return replaceRequest(() => chat.resumeStream(), "resume", beforeResume);
  }

  function stop() {
    stopped = true;
    generation++;
    abortConnection();
  }

  return { sendMessage, resumeStream, stop };
}
