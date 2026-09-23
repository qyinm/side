import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import type {
  AuthPrompt,
  AuthEventNotification,
  AuthPromptRequest,
  AuthType,
  ChatEvent,
  ModelOption,
  ProviderCatalog,
  ProviderOption,
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
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [streamingId, setStreamingId] = useState<string>();
  const [activeProviderId, setActiveProviderId] = useState<string>();
  const [authPrompt, setAuthPrompt] = useState<AuthPromptRequest>();
  const [authNotice, setAuthNotice] = useState<AuthEventNotification>();
  const [errorMessage, setErrorMessage] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const models = catalog?.models ?? [];
  const selectedModel = useMemo(
    () => models.find((model) => getModelKey(model) === selectedModelId) ?? models[0],
    [models, selectedModelId],
  );
  const selectedProvider = catalog?.providers.find((provider) => provider.id === selectedModel?.providerId);

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
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    return window.side.onPanelFocus(() => inputRef.current?.focus());
  }, []);

  function handleChatEvent(event: ChatEvent): void {
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
      setErrorMessage(error instanceof Error ? error.message : "Could not connect the provider.");
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

  function sendMessage(): void {
    const text = draft.trim();
    if (!text || !selectedModel || streamingId) return;
    const requestId = crypto.randomUUID();
    setErrorMessage("");
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", content: text }]);
    setDraft("");
    setStreamingId(requestId);
    window.side.sendMessage({
      requestId,
      providerId: selectedModel.providerId,
      modelId: selectedModel.id,
      text,
    });
  }

  function submitOnEnter(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      sendMessage();
    }
  }

  function clearConversation(): void {
    if (streamingId) window.side.stopMessage(streamingId);
    setMessages([]);
    setStreamingId(undefined);
  }

  return (
    <main className="panel-shell">
      <header className="topbar">
        <div className="brand-mark" aria-hidden="true"><span /></div>
        <div className="brand-copy">
          <span className="brand-name">side</span>
          <span className="brand-caption">ONE CHAT · ANY MODEL</span>
        </div>
        <button className="icon-button new-chat-button" title="New conversation" onClick={clearConversation}>
          <span aria-hidden="true">＋</span>
        </button>
      </header>

      <section className="model-row" aria-label="Model selection">
        <label className="select-wrap provider-select-wrap">
          <span className="sr-only">Provider</span>
          <select
            value={selectedProvider?.id ?? ""}
            onChange={(event) => {
              const nextProvider = catalog?.providers.find((provider) => provider.id === event.target.value);
              if (nextProvider?.models[0]) setSelectedModelId(getModelKey(nextProvider.models[0]));
            }}
            disabled={!catalog?.providers.length || Boolean(streamingId)}
          >
            {catalog?.providers.map((provider) => (
              <option key={provider.id} value={provider.id}>{provider.name}</option>
            ))}
          </select>
          <span className="select-chevron" aria-hidden="true">⌄</span>
        </label>
        <label className="select-wrap model-select-wrap">
          <span className="sr-only">Model</span>
          <select
            value={selectedModel ? getModelKey(selectedModel) : ""}
            onChange={(event) => setSelectedModelId(event.target.value)}
            disabled={!selectedProvider?.models.length || Boolean(streamingId)}
          >
            {selectedProvider?.models.map((model) => (
              <option key={getModelKey(model)} value={getModelKey(model)}>{formatModelName(model)}</option>
            ))}
          </select>
          <span className="select-chevron" aria-hidden="true">⌄</span>
        </label>
        <span className={`connection-dot ${selectedProvider?.configured ? "is-connected" : ""}`} title={selectedProvider?.configured ? "Connected" : "Not connected"} />
      </section>

      {selectedProvider && !selectedProvider.configured && (
        <ProviderConnectCard
          provider={selectedProvider}
          busy={activeProviderId === selectedProvider.id}
          onConnect={(type) => void connectProvider(selectedProvider, type)}
        />
      )}

      <section className="conversation" ref={scrollRef} aria-live="polite">
        {messages.length === 0 ? (
          <div className="empty-state">
            <div className="empty-orbit"><span /><span /><span /></div>
            <h1>What’s on your mind?</h1>
            <p>One calm space for the models you already use.</p>
            {!selectedProvider?.configured && <span className="empty-hint">Connect a provider to start chatting</span>}
          </div>
        ) : (
          <div className="message-list">
            {messages.map((message) => (
              <article className={`message message-${message.role}`} key={message.id}>
                {message.role === "assistant" && <span className="assistant-mark" aria-hidden="true">s</span>}
                <div className="message-content">{message.content || (streamingId === message.id ? <span className="typing-indicator"><i /><i /><i /></span> : "")}</div>
              </article>
            ))}
            {streamingId && !messages.some((message) => message.id === streamingId) && (
              <article className="message message-assistant" key="pending-response">
                <span className="assistant-mark" aria-hidden="true">s</span>
                <div className="message-content"><span className="typing-indicator"><i /><i /><i /></span></div>
              </article>
            )}
          </div>
        )}
      </section>

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
        {selectedProvider?.configured && (
          <div className="provider-status-line">
            <span className="status-indicator" />
            <span>{selectedProvider.name} connected</span>
            <button onClick={() => void disconnectProvider(selectedProvider)} disabled={Boolean(activeProviderId)}>
              {activeProviderId === selectedProvider.id ? "…" : "Disconnect"}
            </button>
          </div>
        )}
        <div className="composer">
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={submitOnEnter}
            placeholder={selectedModel ? `Message ${formatModelName(selectedModel)}…` : "Choose a model to get started"}
            aria-label="Message"
            rows={1}
            disabled={!selectedProvider?.configured || Boolean(activeProviderId)}
          />
          {streamingId ? (
            <button className="send-button stop-button" aria-label="Stop response" onClick={() => window.side.stopMessage(streamingId)}>
              <span />
            </button>
          ) : (
            <button className="send-button" aria-label="Send message" onClick={sendMessage} disabled={!draft.trim() || !selectedProvider?.configured}>
              <span aria-hidden="true">↑</span>
            </button>
          )}
          <button
            className="resize-panel-button"
            aria-label="Toggle panel size"
            title="Toggle panel size"
            onClick={() => window.side.togglePanelSize()}
          >
            <span aria-hidden="true">⤢</span>
          </button>
        </div>
        <div className="composer-hint"><span>↵ send</span><span>⇧ ↵ new line</span></div>
      </footer>

      {authPrompt && (
        <AuthPromptDialog
          request={authPrompt}
          onSubmit={(value) => void submitAuthPrompt(value)}
          onCancel={() => void cancelAuthPrompt()}
        />
      )}
    </main>
  );
}

function ProviderConnectCard({
  provider,
  busy,
  onConnect,
}: {
  provider: ProviderOption;
  busy: boolean;
  onConnect: (type: AuthType) => void;
}) {
  return (
    <div className="connect-card">
      <div>
        <span className="connect-eyebrow">PROVIDER SETUP</span>
        <p>Connect {provider.name} with Pi’s built-in sign-in.</p>
      </div>
      <div className="connect-actions">
        {provider.authMethods.map((method) => (
          <button key={method} className="connect-button" disabled={busy} onClick={() => onConnect(method)}>
            {busy ? "Connecting…" : method === "oauth" ? "Sign in" : "Add API key"}
          </button>
        ))}
        {!provider.authMethods.length && <span className="muted-copy">No interactive sign-in available</span>}
      </div>
    </div>
  );
}

function AuthPromptDialog({
  request,
  onSubmit,
  onCancel,
}: {
  request: AuthPromptRequest;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState("");
  const prompt = request.prompt;
  const kind = getPromptKind(prompt);
  const message = prompt.message;
  const placeholder = "placeholder" in prompt ? prompt.placeholder : undefined;

  return (
    <div className="dialog-backdrop">
      <form className="auth-dialog" onSubmit={(event) => { event.preventDefault(); onSubmit(value); }}>
        <div className="dialog-kicker">{request.providerId} · SIGN IN</div>
        <h2>{message}</h2>
        {prompt.type === "select" ? (
          <div className="auth-options">
            {prompt.options.map((option) => (
              <button className="auth-option" type="button" key={option.id} onClick={() => onSubmit(option.id)}>
                <span>{option.label}</span>
                {option.description && <small>{option.description}</small>}
              </button>
            ))}
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
        <div className="dialog-actions">
          <button className="quiet-button" type="button" onClick={onCancel}>Cancel</button>
          {kind !== "select" && <button className="primary-button" type="submit" disabled={!value.trim()}>Continue</button>}
        </div>
      </form>
    </div>
  );
}
