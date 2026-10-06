import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { SessionStore } from "../../../packages/pi-agent/src/sessions";

const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });

test("history survives restart, restores model settings, and keeps chat contexts separate", () => {
  const directory = mkdtempSync(path.join(tmpdir(), "side-sessions-"));
  directories.push(directory);
  const file = path.join(directory, "sessions.json");
  const store = new SessionStore(file);
  const original = store.active.id;
  Object.assign(store.active, { title: "First chat", providerId: "openai-codex", modelId: "test", reasoningEffort: "high" });
  store.active.messages.push({ role: "user", content: "Remember this", timestamp: Date.now() });
  store.save();
  store.create();
  expect(store.active.messages).toHaveLength(0);
  expect(store.state().sessions).toHaveLength(1);
  const second = store.active.id;
  store.create();
  expect(store.active.id).toBe(second);
  store.active.messages.push({ role: "user", content: "Another topic", timestamp: Date.now() });
  store.save();
  const restored = new SessionStore(file);
  expect(restored.active.id).toBe(second);
  expect(restored.state().sessions).toHaveLength(2);
  const selected = restored.select(original).activeSession;
  expect(selected.reasoningEffort).toBe("high");
  expect(selected.providerId).toBe("openai-codex");
  expect(selected.messages.map((message) => message.content)).toEqual(["Remember this"]);
  expect(new SessionStore(file).active.id).toBe(original);
  expect(() => restored.select("missing")).toThrow("no longer available");
  expect(restored.active.id).toBe(original);
});
