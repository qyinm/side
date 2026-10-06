import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Conversation,
  ConversationContent,
} from "../components/ai-elements/conversation";
import {
  Message,
  MessageContent,
  MessageResponse,
} from "../components/ai-elements/message";
import {
  PromptInput,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "../components/ai-elements/prompt-input";
import { ArrowUp, ArrowUpRight, ChevronDown, Globe, History, KeyRound, LogIn, MessageCircle, Plus, Unplug, X } from "lucide-react";
import type {
  AuthPrompt,
  AuthEventNotification,
  AuthPromptRequest,
  AuthType,
  ChatEvent,
  ChatSessionState,
  ChatSessionSummary,
  ModelOption,
  ProviderCatalog,
  ProviderOption,
  ReasoningEffort,
} from "../shared/contracts";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  error?: boolean;
}

function formatModelName(model: ModelOption | undefined): string {
  if (!model) return "Choose a model";
  return model.name || model.id;
}

function getModelKey(model: ModelOption): string {
  return `${model.providerId}::${model.id}`;
}

function getPromptKind(prompt: AuthPrompt): "text" | "secret" | "select" {
  return prompt.type === "manual_code" ? "text" : prompt.type;
}

function describeAuthEvent(event: AuthEventNotification["event"]): string {
  if (event.type === "auth_url") return event.instructions ?? "Continue in your browser to finish signing in.";
  if (event.type === "device_code") return `Enter code ${event.userCode} at the sign-in page.`;
  return event.message;
}

export function App() {
  const [catalog, setCatalog] = useState<ProviderCatalog>();
  const [selectedModelId, setSelectedModelId] = useState("");
  const [preferredEffort, setPreferredEffort] = useState<ReasoningEffort>("medium");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [sessionBusy, setSessionBusy] = useState(true);
  const [draft, setDraft] = useState("");
  const [streamingId, setStreamingId] = useState<string>();
  const [activeProviderId, setActiveProviderId] = useState<string>();
  const [authPrompt, setAuthPrompt] = useState<AuthPromptRequest>();
  const [authNotice, setAuthNotice] = useState<AuthEventNotification>();
  const [errorMessage, setErrorMessage] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const isInputPointerDown = useRef(false);
  const historyRef = useRef<HTMLDivElement>(null);
  const activeRequestRef = useRef<string | undefined>(undefined);

  const models = catalog?.models ?? [];
  const selectedModel = useMemo(
    () => models.find((model) => getModelKey(model) === selectedModelId) ?? models[0],
    [models, selectedModelId],
  );
  const selectedProvider = catalog?.providers.find((provider) => provider.id === selectedModel?.providerId);
  const reasoningEfforts = selectedModel?.reasoningEfforts ?? [];
  const selectedEffort = reasoningEfforts.includes(preferredEffort) ? preferredEffort
    : reasoningEfforts.includes("medium") ? "medium" : reasoningEfforts[0];

  const refreshCatalog = useCallback(async () => {
    try {
      const nextCatalog = await window.side.getCatalog();
      setCatalog(nextCatalog);
      setSelectedModelId((currentId) => {
        if (nextCatalog.models.some((model) => getModelKey(model) === currentId)) return currentId;
        const configuredModel = nextCatalog.models.find((model) => nextCatalog.providers.find((provider) => provider.id === model.providerId)?.configured);
        return (configuredModel && getModelKey(configuredModel))
          ?? (nextCatalog.models[0] && getModelKey(nextCatalog.models[0]))
          ?? "";
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not load available models.");
    }
  }, []);

  useEffect(() => {
    void refreshCatalog();
    void window.side.getSessions().then(applySession).catch((error) => {
      setErrorMessage(error instanceof Error ? error.message : "Could not load chat history.");
    }).finally(() => setSessionBusy(false));
    return window.side.onChatEvent(handleChatEvent);
  }, [refreshCatalog]);

  useEffect(() => {
    const removeAuthPromptListener = window.side.onAuthPrompt(setAuthPrompt);
    const removeAuthEventListener = window.side.onAuthEvent((notification) => {
      setAuthNotice(notification);
    });
    return () => {
      removeAuthPromptListener();
      removeAuthEventListener();
    };
  }, []);

  useEffect(() => {
    if (!historyOpen) return;
    historyRef.current?.querySelector<HTMLButtonElement>('[role="menuitem"]')?.focus();
    const closeOutside = (event: PointerEvent) => {
      if (!historyRef.current?.contains(event.target as Node)) setHistoryOpen(false);
    };
    const close = () => setHistoryOpen(false);
    document.addEventListener("pointerdown", closeOutside);
    window.addEventListener("blur", close);
    return () => {
      document.removeEventListener("pointerdown", closeOutside);
      window.removeEventListener("blur", close);
    };
  }, [historyOpen]);

  function applySession(state: ChatSessionState): void {
    setSessions(state.sessions);
    setActiveSessionId(state.activeSession.id);
    setMessages(state.activeSession.messages);
    if (state.activeSession.providerId && state.activeSession.modelId) {
      setSelectedModelId(`${state.activeSession.providerId}::${state.activeSession.modelId}`);
    }
    if (state.activeSession.reasoningEffort) setPreferredEffort(state.activeSession.reasoningEffort);
  }

  async function changeSession(id?: string): Promise<void> {
    if (streamingId || sessionBusy || activeProviderId) return;
    setSessionBusy(true);
    setHistoryOpen(false);
    try {
      applySession(await (id ? window.side.selectSession(id) : window.side.createSession()));
      setDraft("");
      setErrorMessage("");
      setAuthNotice(undefined);
      activeRequestRef.current = undefined;
      inputRef.current?.focus();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not open chat.");
    } finally { setSessionBusy(false); }
  }

  useEffect(() => {
    const removeCatalogListener = window.addEventListener
      ? (() => {
          const listener = () => void refreshCatalog();
          window.addEventListener("focus", listener);
          return () => window.removeEventListener("focus", listener);
        })()
      : () => undefined;
    return removeCatalogListener;
  }, [refreshCatalog]);

  useEffect(() => {
    return window.side.onPanelFocus(() => {
      window.side.expandPanel();
      requestAnimationFrame(() => inputRef.current?.focus());
    });
  }, []);

  function handleChatEvent(event: ChatEvent): void {
    if (event.requestId !== activeRequestRef.current) return;
    if (event.type !== "delta") {
      void window.side.getSessions().then((state) => setSessions(state.sessions)).catch(() => undefined);
    }
    if (event.type === "delta") {
      setMessages((current) => {
        const existing = current.find((message) => message.id === event.requestId);
        if (!existing) {
          return [...current, { id: event.requestId, role: "assistant", content: event.delta }];
        }
        return current.map((message) => message.id === event.requestId
          ? { ...message, content: message.content + event.delta }
          : message);
      });
      return;
    }

    if (event.type === "done") {
      setMessages((current) => {
        const existing = current.some((message) => message.id === event.requestId);
        if (!existing && event.content) {
          return [...current, { id: event.requestId, role: "assistant", content: event.content }];
        }
        return current.map((message) => message.id === event.requestId
          ? { ...message, content: event.content }
          : message);
      });
      setStreamingId(undefined);
      return;
    }

    if (event.type === "error") {
      setErrorMessage(event.message);
      setMessages((current) => current.filter((message) => message.id !== event.requestId || message.role === "user"));
      setStreamingId(undefined);
      return;
    }

    setMessages((current) => current.filter((message) => message.id !== event.requestId || message.role === "user"));
    setStreamingId(undefined);
  }

  async function connectProvider(provider: ProviderOption, type: AuthType): Promise<void> {
    setActiveProviderId(provider.id);
    setAuthNotice(undefined);
    setErrorMessage("");
    try {
      await window.side.login(provider.id, type);
      await refreshCatalog();
      setAuthNotice(undefined);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not connect the provider.";
      setErrorMessage(message.endsWith("Authentication was cancelled.") ? "" : message);
      setAuthNotice(undefined);
    } finally {
      setActiveProviderId(undefined);
      setAuthPrompt(undefined);
    }
  }

  async function disconnectProvider(provider: ProviderOption): Promise<void> {
    setActiveProviderId(provider.id);
    setErrorMessage("");
    try {
      await window.side.logout(provider.id);
      await refreshCatalog();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not disconnect the provider.");
    } finally {
      setActiveProviderId(undefined);
    }
  }

  async function submitAuthPrompt(value: string): Promise<void> {
    if (!authPrompt) return;
    try {
      await window.side.respondToAuthPrompt(authPrompt.id, value);
      setAuthPrompt(undefined);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Could not submit authentication details.");
    }
  }

  async function cancelAuthPrompt(): Promise<void> {
    if (!authPrompt) return;
    await window.side.cancelAuthPrompt(authPrompt.id);
    setAuthPrompt(undefined);
  }

  function sendMessage(messageText = draft): void {
    const text = messageText.trim();
    if (!text || !selectedModel || streamingId || sessionBusy) return;
    const requestId = crypto.randomUUID();
    setErrorMessage("");
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", content: text }]);
    setDraft("");
    setStreamingId(requestId);
    activeRequestRef.current = requestId;
    window.side.sendMessage({
      requestId,
      providerId: selectedModel.providerId,
      modelId: selectedModel.id,
      reasoningEffort: selectedEffort,
      text,
    });
  }

  return (
    <main className="panel-shell">
      <div className="session-toolbar">
        <div className="session-history" ref={historyRef} onKeyDown={(event) => {
          if (event.key === "Escape") { setHistoryOpen(false); historyRef.current?.querySelector<HTMLButtonElement>('.session-history-trigger')?.focus(); }
          if (historyOpen && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
            event.preventDefault();
            const items = Array.from(historyRef.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? []);
            const index = items.indexOf(document.activeElement as HTMLButtonElement);
            items[(index + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
          }
        }}>
          <button type="button" className="session-history-trigger" aria-label="Session history" title="Session history"
            aria-haspopup="menu" aria-expanded={historyOpen} disabled={sessionBusy || Boolean(streamingId) || Boolean(activeProviderId)}
            onClick={() => setHistoryOpen((open) => !open)}><History aria-hidden="true" /><ChevronDown aria-hidden="true" /></button>
          {historyOpen && <div className="session-history-popover" role="menu" aria-label="Recent chats">
            <div className="session-history-label">Recent chats</div>
            {sessions.length ? sessions.map((session) => (
              <button type="button" role="menuitem" className="session-history-item" key={session.id}
                aria-current={session.id === activeSessionId ? "true" : undefined} onClick={() => void changeSession(session.id)}>
                <MessageCircle aria-hidden="true" /><span><span>{session.title}</span><small>{new Date(session.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</small></span>
              </button>
            )) : <p className="session-history-empty">Your conversations will appear here.</p>}
          </div>}
        </div>
        <button type="button" className="session-new" aria-label="New session" title="New session"
          disabled={sessionBusy || Boolean(streamingId) || Boolean(activeProviderId)} onClick={() => void changeSession()}><Plus aria-hidden="true" /></button>
      </div>
      <Conversation key={activeSessionId} className="conversation" aria-live="polite">
          <ConversationContent className="message-list">
            {messages.map((message) => (
              <Message className="chat-message" from={message.role} key={message.id}>
                <MessageContent className="chat-message-content">
                  {message.content
                    ? <MessageResponse>{message.content}</MessageResponse>
                    : streamingId === message.id && <span className="typing-indicator"><i /><i /><i /></span>}
                </MessageContent>
              </Message>
            ))}
            {streamingId && !messages.some((message) => message.id === streamingId) && (
              <Message className="chat-message" from="assistant" key="pending-response">
                <MessageContent className="chat-message-content"><span className="typing-indicator"><i /><i /><i /></span></MessageContent>
              </Message>
            )}
          </ConversationContent>
      </Conversation>

      {(errorMessage || authNotice) && (
        <div className={`notice ${errorMessage ? "notice-error" : ""}`}>
          <span>{errorMessage || (authNotice ? describeAuthEvent(authNotice.event) : "")}</span>
          {authNotice?.event.type === "device_code" && (
            <button className="code-pill" onClick={() => void navigator.clipboard.writeText(authNotice.event.type === "device_code" ? authNotice.event.userCode : "")}>
              {authNotice.event.userCode}
            </button>
          )}
          {authNotice?.event.type === "auth_url" && (
            <button className="notice-link" onClick={() => void window.side.openExternal(authNotice.event.type === "auth_url" ? authNotice.event.url : "")}>
              Open sign-in ↗
            </button>
          )}
          <button className="notice-dismiss" aria-label="Dismiss" onClick={() => { setErrorMessage(""); setAuthNotice(undefined); }}>×</button>
        </div>
      )}

      <footer className="composer-area">
        <PromptInput
          className="composer"
          onSubmit={({ text }) => {
            if (!streamingId) sendMessage(text);
          }}
        >
          <PromptInputTextarea
            ref={inputRef}
            className="composer-input"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onPointerDown={() => { isInputPointerDown.current = true; }}
            onPointerUp={() => {
              isInputPointerDown.current = false;
              window.side.expandPanel();
            }}
            onPointerCancel={() => { isInputPointerDown.current = false; }}
            onFocus={() => {
              // Finish the initial click before moving the input upwards.
              if (!isInputPointerDown.current) window.side.expandPanel();
            }}
            placeholder="Ask anything…"
            aria-label="Message"
            rows={1}
            disabled={Boolean(activeProviderId)}
          />
          <PromptInputFooter className="composer-controls">
            <div className="composer-model-controls">
              <button
                type="button"
                className="composer-provider-select"
                aria-label="Provider"
                aria-haspopup="menu"
                disabled={!catalog?.providers.length || Boolean(streamingId) || Boolean(activeProviderId)}
                onClick={async (event) => {
                  const anchor = event.currentTarget.getBoundingClientRect().toJSON();
                  try {
                    const providerId = await window.side.showProviderMenu(selectedProvider?.id ?? "", anchor);
                    const provider = catalog?.providers.find((entry) => entry.id === providerId);
                    if (provider?.models[0]) setSelectedModelId(getModelKey(provider.models[0]));
                  } catch (error) {
                    setErrorMessage(error instanceof Error ? error.message : "Could not open provider menu.");
                  }
                }}
              >
                <span>{selectedProvider?.name ?? "Provider"}</span>
                <ChevronDown aria-hidden="true" />
              </button>
              <button
                type="button"
                className="composer-model-select"
                aria-label="Model"
                aria-haspopup="menu"
                disabled={!selectedProvider?.models.length || Boolean(streamingId) || Boolean(activeProviderId)}
                onClick={async (event) => {
                  const anchor = event.currentTarget.getBoundingClientRect().toJSON();
                  if (!selectedProvider) return;
                  try {
                    const modelId = await window.side.showModelMenu(selectedProvider.id, selectedModel?.id ?? "", anchor);
                    const model = selectedProvider.models.find((entry) => entry.id === modelId);
                    if (model) setSelectedModelId(getModelKey(model));
                  } catch (error) {
                    setErrorMessage(error instanceof Error ? error.message : "Could not open model menu.");
                  }
                }}
              >
                <span>{formatModelName(selectedModel)}</span>
                <ChevronDown aria-hidden="true" />
              </button>
              {selectedEffort && (
                <button type="button" className="composer-reasoning-select"
                  aria-label="Reasoning effort" title="Reasoning effort" aria-haspopup="menu"
                  disabled={Boolean(streamingId) || Boolean(activeProviderId)}
                  onClick={async (event) => {
                    if (!selectedModel) return;
                    const anchor = event.currentTarget.getBoundingClientRect().toJSON();
                    try {
                      const effort = await window.side.showReasoningMenu(selectedModel.providerId, selectedModel.id, selectedEffort, anchor);
                      const supportedEffort = reasoningEfforts.find((entry) => entry === effort);
                      if (supportedEffort) setPreferredEffort(supportedEffort);
                    } catch (error) {
                      setErrorMessage(error instanceof Error ? error.message : "Could not open reasoning menu.");
                    }
                  }}>
                  <span>{selectedEffort === "xhigh" ? "Extra high" : selectedEffort[0].toUpperCase() + selectedEffort.slice(1)}</span>
                  <ChevronDown aria-hidden="true" />
                </button>
              )}
            </div>
            {selectedProvider && (
              <div className="composer-auth-actions">
                {selectedProvider.configured ? (
                  <button type="button" className="composer-tool-button" aria-label="Disconnect provider" title="Disconnect provider"
                    disabled={Boolean(activeProviderId)} onClick={() => void disconnectProvider(selectedProvider)}>
                    <Unplug aria-hidden="true" />
                  </button>
                ) : selectedProvider.authMethods.map((method) => (
                  <button key={method} type="button" className="composer-tool-button"
                    aria-label={method === "oauth" ? "Sign in" : "Add API key"}
                    title={method === "oauth" ? "Sign in" : "Add API key"}
                    disabled={Boolean(activeProviderId)} onClick={() => void connectProvider(selectedProvider, method)}>
                    {method === "oauth" ? <LogIn aria-hidden="true" /> : <KeyRound aria-hidden="true" />}
                  </button>
                ))}
              </div>
            )}
            <PromptInputSubmit
              className="send-button"
              status={streamingId ? "streaming" : "ready"}
              onStop={() => { if (streamingId) window.side.stopMessage(streamingId); }}
              disabled={!streamingId && (sessionBusy || !draft.trim() || !selectedProvider?.configured)}
            ><ArrowUp aria-hidden="true" /></PromptInputSubmit>
          </PromptInputFooter>
        </PromptInput>
      </footer>

      {authPrompt && (
        <AuthPromptDialog
          request={authPrompt}
          providerName={catalog?.providers.find((provider) => provider.id === authPrompt.providerId)?.name ?? authPrompt.providerId}
          onSubmit={(value) => void submitAuthPrompt(value)}
          onCancel={() => void cancelAuthPrompt()}
        />
      )}
    </main>
  );
}

function AuthPromptDialog({
  request,
  providerName,
  onSubmit,
  onCancel,
}: {
  request: AuthPromptRequest;
  providerName: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState("");
  const prompt = request.prompt;
  const kind = getPromptKind(prompt);
  const message = prompt.message;
  const placeholder = "placeholder" in prompt ? prompt.placeholder : undefined;
  const isCodexMethod = request.providerId === "openai-codex" && prompt.type === "select"
    && prompt.options.every((option) => option.id === "browser" || option.id === "device_code");

  return (
    <div className="dialog-backdrop">
      <form className="auth-dialog" role="dialog" aria-modal="true" aria-labelledby="auth-dialog-title"
        onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); onCancel(); } }}
        onSubmit={(event) => { event.preventDefault(); onSubmit(value); }}>
        <div className="auth-dialog-header">
          <span className="auth-provider-name">{providerName}</span>
          <button type="button" className="auth-close" aria-label="Cancel sign in" onClick={onCancel}><X aria-hidden="true" /></button>
        </div>
        <h2 id="auth-dialog-title">{isCodexMethod ? "Connect your account" : message}</h2>
        {isCodexMethod && <p className="auth-description">Choose how you’d like to sign in.</p>}
        {prompt.type === "select" ? (
          <div className="auth-options">
            {prompt.options.map((option, index) => {
              const browserLogin = isCodexMethod && option.id === "browser";
              return (
                <button className={`auth-option${browserLogin ? " auth-option-recommended" : ""}`} type="button"
                  key={option.id} autoFocus={index === 0} onClick={() => onSubmit(option.id)}>
                  {isCodexMethod && <span className="auth-option-icon">{browserLogin ? <Globe aria-hidden="true" /> : <KeyRound aria-hidden="true" />}</span>}
                  <span className="auth-option-copy">
                    <span>{isCodexMethod ? browserLogin ? "Continue in browser" : "Use a device code" : option.label}</span>
                    {(isCodexMethod || option.description) && <small>{isCodexMethod ? browserLogin ? "Sign in with your ChatGPT account" : "Enter a one-time code in your browser" : option.description}</small>}
                  </span>
                  {isCodexMethod && <ArrowUpRight className="auth-option-arrow" aria-hidden="true" />}
                </button>
              );
            })}
          </div>
        ) : (
          <input
            autoFocus
            type={kind === "secret" ? "password" : "text"}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={placeholder ?? (kind === "secret" ? "API key" : "Enter value")}
          />
        )}
        {kind !== "select" && <div className="dialog-actions">
          <button className="quiet-button" type="button" onClick={onCancel}>Cancel</button>
          <button className="primary-button" type="submit" disabled={!value.trim()}>Continue</button>
        </div>}
      </form>
    </div>
  );
}
