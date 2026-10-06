import type {
  AuthEventNotification,
  AuthPromptRequest,
  AuthType,
  ChatEvent,
  ChatSendRequest,
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
  ModelOption,
  ProviderCatalog,
  ProviderOption,
} from "@side/pi-agent";

export interface SideApi {
  getCatalog(): Promise<ProviderCatalog>;
  showProviderMenu(selectedId: string): Promise<string | undefined>;
  showModelMenu(providerId: string, selectedId: string): Promise<string | undefined>;
  sendMessage(request: ChatSendRequest): void;
  stopMessage(requestId: string): void;
  login(providerId: string, type: AuthType): Promise<void>;
  logout(providerId: string): Promise<void>;
  respondToAuthPrompt(id: string, value: string): Promise<void>;
  cancelAuthPrompt(id: string): Promise<void>;
  openExternal(url: string): Promise<void>;
  togglePanelSize(): void;
  onChatEvent(callback: (event: ChatEvent) => void): () => void;
  onAuthPrompt(callback: (request: AuthPromptRequest) => void): () => void;
  onAuthEvent(callback: (notification: AuthEventNotification) => void): () => void;
  onPanelFocus(callback: () => void): () => void;
  onPanelHover(callback: (hovered: boolean) => void): () => void;
}

declare global {
  interface Window {
    side: SideApi;
  }
}
