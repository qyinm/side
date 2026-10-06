import type {
  AuthEventNotification,
  AuthPromptRequest,
  AuthType,
  ChatEvent,
  ChatSendRequest,
  ChatSessionState,
  ProviderCatalog,
} from "@side/pi-agent";

export type {
  AuthEvent,
  AuthEventNotification,
  AuthPrompt,
  AuthPromptRequest,
  AuthType,
  ChatEvent,
  ChatSendRequest,
  ChatSessionState,
  ChatSessionSummary,
  ModelOption,
  ProviderCatalog,
  ProviderOption,
  ReasoningEffort,
} from "@side/pi-agent";

export interface SelectionAnchor { x: number; y: number; width: number; height: number }
export interface SelectionOptions {
  title: string;
  options: { id: string; name: string }[];
  selectedId: string;
}

export interface SideApi {
  getSessions(): Promise<ChatSessionState>;
  createSession(): Promise<ChatSessionState>;
  selectSession(id: string): Promise<ChatSessionState>;
  getCatalog(): Promise<ProviderCatalog>;
  showProviderMenu(selectedId: string, anchor: SelectionAnchor): Promise<string | undefined>;
  showModelMenu(providerId: string, selectedId: string, anchor: SelectionAnchor): Promise<string | undefined>;
  showReasoningMenu(providerId: string, modelId: string, selectedId: string, anchor: SelectionAnchor): Promise<string | undefined>;
  getSelectionOptions(): Promise<SelectionOptions>;
  chooseSelection(id: string): void;
  cancelSelection(): void;
  sendMessage(request: ChatSendRequest): void;
  stopMessage(requestId: string): void;
  login(providerId: string, type: AuthType): Promise<void>;
  logout(providerId: string): Promise<void>;
  respondToAuthPrompt(id: string, value: string): Promise<void>;
  cancelAuthPrompt(id: string): Promise<void>;
  openExternal(url: string): Promise<void>;
  expandPanel(): void;
  onChatEvent(callback: (event: ChatEvent) => void): () => void;
  onAuthPrompt(callback: (request: AuthPromptRequest) => void): () => void;
  onAuthEvent(callback: (notification: AuthEventNotification) => void): () => void;
  onPanelFocus(callback: () => void): () => void;
}

declare global {
  interface Window {
    side: SideApi;
  }
}
