import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Message } from "@earendil-works/pi-ai";
import type { ReasoningEffort } from "./index";

export interface ChatSessionSummary {
  id: string;
  title: string;
  updatedAt: number;
  providerId?: string;
  modelId?: string;
  reasoningEffort?: ReasoningEffort;
}
interface StoredSession extends ChatSessionSummary { messages: Message[] }
export interface ChatSessionState {
  sessions: ChatSessionSummary[];
  activeSession: ChatSessionSummary & { messages: { id: string; role: "user" | "assistant"; content: string }[] };
}

export class SessionStore {
  private sessions: StoredSession[] = [];
  active: StoredSession;

  constructor(private readonly file: string) {
    try {
      const saved = JSON.parse(readFileSync(file, "utf8"));
      if (saved.version !== 1 || !Array.isArray(saved.sessions)
        || !saved.sessions.every((session: StoredSession) => typeof session.id === "string"
          && typeof session.title === "string" && typeof session.updatedAt === "number" && Array.isArray(session.messages))) {
        throw new Error("Invalid chat session history.");
      }
      this.sessions = saved.sessions;
      this.active = this.sessions.find((session) => session.id === saved.activeId) ?? this.emptySession();
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      this.active = this.emptySession();
    }
  }

  private emptySession(): StoredSession {
    const session = { id: randomUUID(), title: "New chat", updatedAt: Date.now(), messages: [] };
    this.sessions.push(session);
    return session;
  }

  save(): void {
    mkdirSync(path.dirname(this.file), { recursive: true });
    const temporary = `${this.file}.tmp`;
    writeFileSync(temporary, JSON.stringify({ version: 1, activeId: this.active.id, sessions: this.sessions }), { mode: 0o600 });
    renameSync(temporary, this.file);
  }

  create(): ChatSessionState {
    const previous = this.active;
    if (this.active.messages.length) this.active = this.emptySession();
    try { this.save(); } catch (error) {
      if (this.active !== previous) this.sessions = this.sessions.filter((entry) => entry !== this.active);
      this.active = previous;
      throw error;
    }
    return this.state();
  }

  select(id: string): ChatSessionState {
    const session = this.sessions.find((entry) => entry.id === id);
    if (!session) throw new Error("That chat session is no longer available.");
    const previous = this.active;
    this.active = session;
    try { this.save(); } catch (error) { this.active = previous; throw error; }
    return this.state();
  }

  state(): ChatSessionState {
    const summary = ({ messages: _messages, ...metadata }: StoredSession): ChatSessionSummary => metadata;
    return {
      sessions: this.sessions.filter((session) => session.messages.length).map(summary).sort((a, b) => b.updatedAt - a.updatedAt),
      activeSession: { ...summary(this.active), messages: this.active.messages.flatMap((message, index) => {
        if (message.role !== "user" && message.role !== "assistant") return [];
        const content = typeof message.content === "string" ? message.content
          : message.content.filter((part) => part.type === "text").map((part) => part.text).join("");
        return content ? [{ id: `${this.active.id}:${index}`, role: message.role, content }] : [];
      }) },
    };
  }
}
