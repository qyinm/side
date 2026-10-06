import { afterEach, expect, spyOn, test } from "bun:test";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PiAgent, type PiAgentEvent, type ReasoningEffort } from "../../../packages/pi-agent/src/index";

afterEach(() => { createRuntime.mockRestore(); });
const createRuntime = spyOn(ModelRuntime, "create");

test("reasoning selections reach the runtime; unsupported efforts never send a message", async () => {
  const thinkingLevelMap: Partial<Record<ReasoningEffort, null>> = { off: null, minimal: null, xhigh: null, max: null };
  const model = { id: "test", provider: "test", name: "Test", reasoning: true, contextWindow: 1000,
    thinkingLevelMap };
  const requests: { reasoning?: string; messages: unknown[] }[] = [];
  const runtime = {
    getModel: () => model,
    getProviders: () => [{ id: "test", name: "Test", auth: {}, getModels: () => [model] }],
    hasConfiguredAuth: () => true,
    async *streamSimple(_model: unknown, context: { messages: unknown[] }, options: { reasoning?: string }) {
      requests.push({ reasoning: options.reasoning, messages: context.messages });
      yield { type: "error", reason: "aborted" };
    },
  };
  createRuntime.mockResolvedValue(runtime as unknown as ModelRuntime);
  let finish: (event: PiAgentEvent) => void = () => {};
  const directory = mkdtempSync(path.join(tmpdir(), "side-reasoning-"));
  const agent = await PiAgent.create({ runtimeDirectory: directory, onEvent: (event) => finish(event) });
  expect(agent.getCatalog().models[0].reasoningEfforts).toEqual(["low", "medium", "high"]);
  const send = (reasoningEffort: "high" | "max" | "off" | undefined) => new Promise<PiAgentEvent>((resolve) => {
    finish = resolve;
    agent.sendMessage({ requestId: crypto.randomUUID(), providerId: "test", modelId: "test", text: "Hello", reasoningEffort });
  });
  await send("high");
  expect(requests[0].reasoning).toBe("high");
  const rejected = await send("max");
  expect(rejected).toMatchObject({ type: "chat_event", event: { type: "error" } });
  expect(requests).toHaveLength(1);
  delete model.thinkingLevelMap.off;
  await send("off");
  expect(requests[1].reasoning).toBeUndefined();
  expect(requests[1].messages).toHaveLength(2);
  model.reasoning = false;
  expect(agent.getCatalog().models[0].reasoningEfforts).toEqual([]);
  const unsupported = await send("high");
  expect(unsupported).toMatchObject({ type: "chat_event", event: { type: "error" } });
  expect(requests).toHaveLength(2);
  await send(undefined);
  expect(requests[2].reasoning).toBeUndefined();
  const originalSession = agent.getSessions().activeSession.id;
  agent.createSession();
  await send(undefined);
  expect(requests[3].messages).toHaveLength(1);
  agent.selectSession(originalSession);
  await send(undefined);
  expect(requests[4].messages).toHaveLength(4);
  agent.dispose();
  rmSync(directory, { recursive: true, force: true });
});
