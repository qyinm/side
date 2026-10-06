import { randomUUID } from "node:crypto";
import path from "node:path";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { registerBunOAuthFlows } from "@earendil-works/pi-ai/bun-oauth";
import { getSupportedThinkingLevels } from "@earendil-works/pi-ai";
import { SessionStore, type ChatSessionState } from "./sessions";
export type { ChatSessionState, ChatSessionSummary } from "./sessions";
import type {
  AssistantMessage,
  AuthEvent as PiAuthEvent,
  AuthInteraction,
  AuthPrompt as PiAuthPrompt,
  AuthType as PiAuthType,
  Message,
  ModelThinkingLevel,
  UserMessage,
} from "@earendil-works/pi-ai";

export type AuthType = PiAuthType;
export type ReasoningEffort = ModelThinkingLevel;

export type AuthPrompt =
  | { type: "text" | "secret" | "manual_code"; message: string; placeholder?: string }
  | {
      type: "select";
      message: string;
      options: readonly { id: string; label: string; description?: string }[];
    };

export type AuthEvent =
  | { type: "info"; message: string; links?: readonly { url: string; label?: string }[] }
  | { type: "auth_url"; url: string; instructions?: string }
  | {
      type: "device_code";
      userCode: string;
      verificationUri: string;
      intervalSeconds?: number;
      expiresInSeconds?: number;
    }
  | { type: "progress"; message: string };

export interface ModelOption {
  id: string;
  name: string;
  providerId: string;
  reasoning: boolean;
  reasoningEfforts: ReasoningEffort[];
  contextWindow: number;
}

export interface ProviderOption {
  id: string;
  name: string;
  configured: boolean;
  authMethods: AuthType[];
  models: ModelOption[];
}

export interface ProviderCatalog {
  providers: ProviderOption[];
  models: ModelOption[];
}

export interface ChatSendRequest {
  requestId: string;
  providerId: string;
  modelId: string;
  text: string;
  reasoningEffort?: ReasoningEffort;
}

export type ChatEvent =
  | { requestId: string; type: "delta"; delta: string }
  | { requestId: string; type: "done"; content: string }
  | { requestId: string; type: "error"; message: string }
  | { requestId: string; type: "stopped" };

export interface AuthPromptRequest {
  id: string;
  providerId: string;
  prompt: AuthPrompt;
}

export interface AuthEventNotification {
  providerId: string;
  event: AuthEvent;
}

export type PiAgentEvent =
  | { type: "chat_event"; event: ChatEvent }
  | { type: "auth_prompt"; request: AuthPromptRequest }
  | { type: "auth_event"; notification: AuthEventNotification };

export interface PiAgentOptions {
  runtimeDirectory: string;
  onEvent: (event: PiAgentEvent) => void;
}

interface PendingAuthPrompt {
  providerId: string;
  prompt: PiAuthPrompt;
  resolve: (value: string) => void;
  reject: (error: Error) => void;
  removeAbortListener: () => void;
}

export class PiAgent {
  private get conversation(): Message[] { return this.sessions.active.messages; }
  private readonly activeStreams = new Map<string, AbortController>();
  private readonly pendingAuthPrompts = new Map<string, PendingAuthPrompt>();
  private disposed = false;

  private constructor(
    private readonly runtime: ModelRuntime,
    private readonly onEvent: PiAgentOptions["onEvent"],
    private readonly sessions: SessionStore,
  ) {}

  static async create(options: PiAgentOptions): Promise<PiAgent> {
    // Pi's default OAuth loaders use computed relative imports that desktop
    // bundlers cannot follow. Register the statically imported flows instead.
    registerBunOAuthFlows();
    const runtime = await ModelRuntime.create({
      authPath: path.join(options.runtimeDirectory, "auth.json"),
      modelsPath: path.join(options.runtimeDirectory, "models.json"),
      modelsStorePath: path.join(options.runtimeDirectory, "models-store.json"),
      allowModelNetwork: false,
      refreshOnCreate: false,
    });

    return new PiAgent(runtime, options.onEvent, new SessionStore(path.join(options.runtimeDirectory, "sessions.json")));
  }

  getSessions(): ChatSessionState { return this.sessions.state(); }

  createSession(): ChatSessionState {
    if (this.activeStreams.size) throw new Error("Stop the current response before starting a new chat.");
    return this.sessions.create();
  }

  selectSession(id: string): ChatSessionState {
    if (this.activeStreams.size) throw new Error("Stop the current response before switching chats.");
    return this.sessions.select(id);
  }

  getCatalog(): ProviderCatalog {
    const providers: ProviderOption[] = this.runtime.getProviders().map((provider) => {
      const models = provider.getModels().map((model) => ({
        id: model.id,
        name: model.name,
        providerId: model.provider,
        reasoning: model.reasoning,
        reasoningEfforts: model.reasoning ? getSupportedThinkingLevels(model) : [],
        contextWindow: model.contextWindow,
      }));
      const authMethods: AuthType[] = [];

      if (provider.auth.apiKey?.login) authMethods.push("api_key");
      if (provider.auth.oauth) authMethods.push("oauth");

      return {
        id: provider.id,
        name: provider.name,
        configured: this.runtime.hasConfiguredAuth(provider.id),
        authMethods,
        models,
      };
    });

    return {
      providers: providers.filter((provider) => provider.models.length > 0),
      models: providers.flatMap((provider) => provider.models),
    };
  }

  async login(providerId: string, type: AuthType): Promise<void> {
    this.ensureActive();
    const provider = this.runtime.getProvider(providerId);
    if (!provider) throw new Error("Unknown provider.");
    if (type === "api_key" && !provider.auth.apiKey?.login) {
      throw new Error("This provider does not support interactive API-key setup.");
    }
    if (type === "oauth" && !provider.auth.oauth) {
      throw new Error("This provider does not support OAuth.");
    }

    await this.runtime.login(providerId, type, this.createAuthInteraction(providerId));
  }

  async logout(providerId: string): Promise<void> {
    this.ensureActive();
    await this.runtime.logout(providerId);
  }

  respondToAuthPrompt(id: string, value: string): void {
    const pending = this.pendingAuthPrompts.get(id);
    if (!pending) return;
    if (typeof value !== "string" || value.length > 8192) {
      throw new Error("Authentication response is invalid.");
    }
    if (
      pending.prompt.type === "select" &&
      !pending.prompt.options.some((option) => option.id === value)
    ) {
      throw new Error("Select a listed authentication option.");
    }

    pending.removeAbortListener();
    this.pendingAuthPrompts.delete(id);
    pending.resolve(value);
  }

  cancelAuthPrompt(id: string): void {
    const pending = this.pendingAuthPrompts.get(id);
    if (!pending) return;

    pending.removeAbortListener();
    this.pendingAuthPrompts.delete(id);
    pending.reject(new Error("Authentication was cancelled."));
  }

  sendMessage(request: ChatSendRequest): void {
    if (this.disposed) {
      this.publishChatEvent({
        requestId: request.requestId,
        type: "error",
        message: "The Pi agent is shutting down.",
      });
      return;
    }
    if (this.activeStreams.size) {
      this.publishChatEvent({ requestId: request.requestId, type: "error", message: "A response is already in progress." });
      return;
    }

    void this.streamChat(request);
  }

  stopMessage(requestId: string): void {
    this.activeStreams.get(requestId)?.abort();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    for (const controller of this.activeStreams.values()) controller.abort();
    for (const pending of this.pendingAuthPrompts.values()) {
      pending.removeAbortListener();
      pending.reject(new Error("Application is closing."));
    }
    this.pendingAuthPrompts.clear();
  }

  private createAuthInteraction(providerId: string): AuthInteraction {
    return {
      prompt: (prompt) => {
        const id = randomUUID();
        const request: AuthPromptRequest = {
          id,
          providerId,
          prompt: this.serializeAuthPrompt(prompt),
        };

        return new Promise((resolve, reject) => {
          const abortPrompt = () => {
            this.pendingAuthPrompts.delete(id);
            reject(new Error("Authentication prompt was cancelled."));
          };

          prompt.signal?.addEventListener("abort", abortPrompt, { once: true });
          this.pendingAuthPrompts.set(id, {
            providerId,
            prompt,
            resolve,
            reject,
            removeAbortListener: () =>
              prompt.signal?.removeEventListener("abort", abortPrompt),
          });
          this.onEvent({ type: "auth_prompt", request });
        });
      },
      notify: (event) => {
        this.onEvent({
          type: "auth_event",
          notification: { providerId, event: this.serializeAuthEvent(event) },
        });
      },
    };
  }

  private serializeAuthPrompt(prompt: PiAuthPrompt): AuthPrompt {
    if (prompt.type === "select") {
      return {
        type: prompt.type,
        message: prompt.message,
        options: prompt.options.map((option) => ({ ...option })),
      };
    }
    return {
      type: prompt.type,
      message: prompt.message,
      placeholder: prompt.placeholder,
    };
  }

  private serializeAuthEvent(event: PiAuthEvent): AuthEvent {
    if (event.type === "info") {
      return { ...event, links: event.links?.map((link) => ({ ...link })) };
    }
    return { ...event };
  }

  private async streamChat(request: ChatSendRequest): Promise<void> {
    const text = request.text.trim();
    if (!text || text.length > 20_000) {
      this.publishChatEvent({
        requestId: request.requestId,
        type: "error",
        message: "Messages must be between 1 and 20,000 characters.",
      });
      return;
    }

    const model = this.runtime.getModel(request.providerId, request.modelId);
    if (!model) {
      this.publishChatEvent({
        requestId: request.requestId,
        type: "error",
        message: "That model is no longer available. Refresh the model list and try again.",
      });
      return;
    }

    if (request.reasoningEffort !== undefined && !getSupportedThinkingLevels(model).includes(request.reasoningEffort)) {
      this.publishChatEvent({ requestId: request.requestId, type: "error", message: "That reasoning effort is not supported by this model." });
      return;
    }

    const controller = new AbortController();
    this.activeStreams.set(request.requestId, controller);
    let terminalEvent: ChatEvent | undefined;
    try {
      const session = this.sessions.active;
      if (!this.conversation.length) session.title = text.replace(/\s+/g, " ").slice(0, 64);
      session.providerId = request.providerId;
      session.modelId = request.modelId;
      session.reasoningEffort = request.reasoningEffort;
      session.updatedAt = Date.now();
      this.conversation.push(this.toUserMessage(text));
      this.sessions.save();
      const stream = this.runtime.streamSimple(model, { messages: [...this.conversation] }, {
        signal: controller.signal,
        reasoning: request.reasoningEffort === "off" ? undefined : request.reasoningEffort,
      });
      let savedAssistantMessage: AssistantMessage | undefined;

      for await (const event of stream) {
        if (event.type === "text_delta") {
          this.publishChatEvent({
            requestId: request.requestId,
            type: "delta",
            delta: event.delta,
          });
        } else if (event.type === "done") {
          savedAssistantMessage = event.message;
          this.conversation.push(event.message);
          session.updatedAt = Date.now();
          this.sessions.save();
          terminalEvent = {
            requestId: request.requestId,
            type: "done",
            content: this.getTextContent(event.message),
          };
          break;
        } else if (event.type === "error") {
          if (event.reason === "aborted") {
            terminalEvent = { requestId: request.requestId, type: "stopped" };
          } else {
            terminalEvent = {
              requestId: request.requestId,
              type: "error",
              message: event.error.errorMessage ?? "The provider could not complete the request.",
            };
          }
          break;
        }
      }

      if (!savedAssistantMessage && controller.signal.aborted) {
        terminalEvent = { requestId: request.requestId, type: "stopped" };
      }
    } catch (error) {
      terminalEvent = (
        controller.signal.aborted
          ? { requestId: request.requestId, type: "stopped" }
          : {
              requestId: request.requestId,
              type: "error",
              message: this.getSafeErrorMessage(error),
            }
      );
    } finally {
      this.activeStreams.delete(request.requestId);
      if (terminalEvent) this.publishChatEvent(terminalEvent);
    }
  }

  private getTextContent(message: AssistantMessage): string {
    return message.content
      .filter((content) => content.type === "text")
      .map((content) => content.text)
      .join("");
  }

  private toUserMessage(text: string): UserMessage {
    return { role: "user", content: text, timestamp: Date.now() };
  }

  private publishChatEvent(event: ChatEvent): void {
    this.onEvent({ type: "chat_event", event });
  }

  private getSafeErrorMessage(error: unknown): string {
    if (error instanceof Error) return error.message;
    return "Something went wrong while contacting the model.";
  }

  private ensureActive(): void {
    if (this.disposed) throw new Error("The Pi agent is shutting down.");
  }
}
