import { execFile } from "node:child_process";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import {
  app,
  BrowserWindow,
  globalShortcut,
  ipcMain,
  screen,
  shell,
} from "electron";
import { PiAgent } from "@side/pi-agent";
import type { SelectionAnchor, SelectionOptions } from "../shared/contracts";
import type { AuthType, ChatSendRequest, PiAgentEvent } from "@side/pi-agent";

const panelWidth = 430;
const panelHeight = 650;
const minimumPanelWidth = 180;
const maximumPanelWidth = 560;
const minimumExpandedPanelHeight = 480;
const dockPanelGap = 0;
const hoverRevealHeight = 22;
const pollPanelHoverInterval = 60;
const pollDockGeometryInterval = 1200;
const execFileAsync = promisify(execFile);

type DockGeometry = {
  accessibilityTrusted: boolean;
  orientation: "bottom" | "left" | "right" | null;
  autoHide: boolean | null;
  dockRect: { x: number; y: number; width: number; height: number } | null;
};

let panelWindow: BrowserWindow | null = null;
let piAgent: PiAgent | null = null;
let isQuitting = false;
let dockGeometry: DockGeometry | null = null;
let isReadingDockGeometry = false;
let isPanelExpanded = false;
let isPanelHovered = false;
let isPointerInsidePanel = false;

function getPiAgent(): PiAgent {
  if (!piAgent) throw new Error("Pi agent is not ready yet.");
  return piAgent;
}

function sendToPanel(channel: string, payload: unknown): void {
  if (panelWindow && !panelWindow.isDestroyed()) {
    panelWindow.webContents.send(channel, payload);
  }
}

async function openTrustedExternalUrl(value: string): Promise<void> {
  const url = new URL(value);
  const isLocalHttpCallback = url.protocol === "http:"
    && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.protocol !== "https:" && !isLocalHttpCallback) {
    throw new Error("Only HTTPS authentication links can be opened.");
  }
  await shell.openExternal(url.toString());
}

function handlePiAgentEvent(event: PiAgentEvent): void {
  if (event.type === "chat_event") {
    sendToPanel("chat:event", event.event);
  } else if (event.type === "auth_prompt") {
    sendToPanel("auth:prompt", event.request);
  } else {
    sendToPanel("auth:event", event.notification);
    if (event.notification.event.type === "auth_url") {
      void openTrustedExternalUrl(event.notification.event.url).catch(() => undefined);
    }
  }
}

function isChatSendRequest(value: unknown): value is ChatSendRequest {
  if (!value || typeof value !== "object") return false;
  const request = value as Partial<ChatSendRequest>;
  return typeof request.requestId === "string"
    && typeof request.providerId === "string"
    && typeof request.modelId === "string"
    && typeof request.text === "string";
}

let selectionWindow: BrowserWindow | undefined;
let selectionOptions: SelectionOptions | undefined;
let selectionResult: string | undefined;
let isPointerInsideSelection = false;

function showSelectionMenu(data: SelectionOptions, anchor: SelectionAnchor): Promise<string | undefined> {
  if (!panelWindow || panelWindow.isDestroyed() || selectionWindow || !data.options.length) {
    return Promise.resolve(undefined);
  }
  if (!anchor || ![anchor.x, anchor.y, anchor.width, anchor.height].every(Number.isFinite)) {
    return Promise.reject(new Error("Invalid selection anchor."));
  }
  const parent = panelWindow;
  const bounds = parent.getBounds();
  const area = screen.getDisplayMatching(bounds).workArea;
  const anchorX = bounds.x + Math.max(0, Math.min(anchor.x, bounds.width));
  const anchorY = bounds.y + Math.max(0, Math.min(anchor.y, bounds.height));
  const width = Math.min(280, area.width);
  const height = Math.min(260, Math.max(100, anchorY - area.y - 8));
  const popup = new BrowserWindow({
    title: data.title,
    x: Math.round(Math.max(area.x, Math.min(anchorX, area.x + area.width - width))),
    y: Math.round(Math.max(area.y, anchorY - height - 6)),
    width, height,
    show: false, frame: false, transparent: true, resizable: false,
    skipTaskbar: true, hasShadow: true, focusable: true,
    ...(process.platform === "darwin" ? { acceptFirstMouse: true } : {}),
    webPreferences: {
      preload: path.join(__dirname, "index.js"),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
    },
  });
  selectionWindow = popup;
  selectionOptions = data;
  selectionResult = undefined;
  isPointerInsideSelection = false;
  popup.setAlwaysOnTop(true, "floating");
  popup.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true });
  popup.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  popup.webContents.on("page-title-updated", (event) => event.preventDefault());
  popup.webContents.on("will-navigate", (event) => event.preventDefault());
  const close = () => { if (!popup.isDestroyed()) popup.close(); };
  popup.once("ready-to-show", () => {
    popup.show();
    app.focus({ steal: true });
    popup.focus();
    popup.webContents.focus();
  });
  popup.on("focus", () => popup.webContents.focus());
  popup.on("blur", () => { if (popup.isVisible()) close(); });
  parent.on("hide", close);
  const closeOnMove = () => {
    const current = parent.getBounds();
    if (current.x !== bounds.x || current.y !== bounds.y) close();
  };
  parent.on("move", closeOnMove);
  return new Promise((resolve, reject) => {
    popup.once("closed", () => {
      parent.removeListener("hide", close);
      parent.removeListener("move", closeOnMove);
      const result = selectionResult;
      selectionWindow = undefined;
      selectionOptions = undefined;
      selectionResult = undefined;
      isPointerInsideSelection = false;
      resolve(result);
    });
    const load = MAIN_WINDOW_VITE_DEV_SERVER_URL
      ? popup.loadURL(`${MAIN_WINDOW_VITE_DEV_SERVER_URL}?selection=1`)
      : popup.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`), { query: { selection: "1" } });
    void load.catch((error) => { reject(error); close(); });
  });
}

function registerIpcHandlers(): void {
  ipcMain.handle("catalog:get", () => getPiAgent().getCatalog());
  ipcMain.handle("selection:provider", (_event, selectedId: string, anchor: SelectionAnchor) =>
    showSelectionMenu({ title: "Provider", options: getPiAgent().getCatalog().providers, selectedId }, anchor));
  ipcMain.handle("selection:model", (_event, providerId: string, selectedId: string, anchor: SelectionAnchor) => {
    const provider = getPiAgent().getCatalog().providers.find((entry) => entry.id === providerId);
    return showSelectionMenu({ title: "Model", options: provider?.models ?? [], selectedId }, anchor);
  });
  ipcMain.handle("selection:options", (event) => {
    if (event.sender !== selectionWindow?.webContents || !selectionOptions) throw new Error("No selection is open.");
    return selectionOptions;
  });
  ipcMain.on("selection:choose", (event, id: string) => {
    if (event.sender !== selectionWindow?.webContents || !selectionOptions?.options.some((option) => option.id === id)) return;
    selectionResult = id;
    selectionWindow?.close();
  });
  ipcMain.on("selection:cancel", (event) => {
    if (event.sender === selectionWindow?.webContents) selectionWindow?.close();
  });
  ipcMain.handle("auth:login", async (_event, providerId: string, type: AuthType) => {
    await getPiAgent().login(providerId, type);
    sendToPanel("catalog:updated", getPiAgent().getCatalog());
  });
  ipcMain.handle("auth:logout", async (_event, providerId: string) => {
    await getPiAgent().logout(providerId);
    sendToPanel("catalog:updated", getPiAgent().getCatalog());
  });
  ipcMain.handle("auth:respond", (_event, id: string, value: string) => {
    getPiAgent().respondToAuthPrompt(id, value);
  });
  ipcMain.handle("auth:cancel", (_event, id: string) => {
    getPiAgent().cancelAuthPrompt(id);
  });
  ipcMain.handle("external:open", (_event, url: string) => openTrustedExternalUrl(url));
  ipcMain.on("chat:send", (_event, value: unknown) => {
    if (!isChatSendRequest(value) || value.text.length > 20_000) return;
    getPiAgent().sendMessage(value);
  });
  ipcMain.on("chat:stop", (_event, requestId: string) => {
    if (typeof requestId === "string") getPiAgent().stopMessage(requestId);
  });
  ipcMain.on("panel:toggle-size", () => {
    isPanelExpanded = !isPanelExpanded;
    positionPanel();
    updatePanelHoverState();
  });
  ipcMain.on("panel:hover-state:get", (event) => {
    event.sender.send("panel:hover-state", isPanelHovered);
  });
}

function getDockHelperPath(): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, "dock-geometry")
    : path.join(app.getAppPath(), "native", "dock-geometry");
}

async function refreshDockGeometry(requestPermission = false): Promise<void> {
  if (process.platform !== "darwin" || isReadingDockGeometry) return;
  isReadingDockGeometry = true;
  try {
    const { stdout } = await execFileAsync(
      getDockHelperPath(),
      requestPermission ? ["--request-permission"] : [],
      { timeout: 2500 },
    );
    dockGeometry = JSON.parse(stdout) as DockGeometry;
    positionPanel();
  } catch {
    // Keep the last valid Dock position during transient Accessibility failures.
  } finally {
    isReadingDockGeometry = false;
  }
}

function getDockDisplay(): Electron.Display {
  const rect = dockGeometry?.dockRect;
  if (rect) {
    return screen.getDisplayNearestPoint({
      x: rect.x + rect.width / 2,
      y: rect.y + rect.height / 2,
    });
  }
  return screen.getPrimaryDisplay();
}

function getDockOrientation(display: Electron.Display): "bottom" | "left" | "right" {
  const orientation = dockGeometry?.orientation;
  if (orientation === "bottom" || orientation === "left" || orientation === "right") {
    return orientation;
  }

  const rect = dockGeometry?.dockRect;
  if (!rect || rect.width >= rect.height) return "bottom";
  return rect.x + rect.width / 2 < display.bounds.x + display.bounds.width / 2
    ? "left"
    : "right";
}

function positionPanel(): void {
  if (!panelWindow) return;
  const display = getDockDisplay();
  const workArea = display.workArea;
  const bounds = display.bounds;
  const currentBounds = panelWindow.getBounds();
  let widthToUse = currentBounds.width || panelWidth;
  let heightToUse = currentBounds.height || panelHeight;
  const orientation = getDockOrientation(display);
  const dockRect = dockGeometry?.dockRect;

  let panelX = bounds.x + bounds.width - widthToUse;
  let panelY = workArea.y + workArea.height - heightToUse;
  let isDockAligned = false;
  if (orientation === "bottom" && dockRect) {
    const leftGap = Math.max(0, dockRect.x - bounds.x);
    const rightGap = Math.max(0, bounds.x + bounds.width - dockRect.x - dockRect.width);
      const useRightGap = rightGap >= leftGap;
      const availableSideWidth = (useRightGap ? rightGap : leftGap) - dockPanelGap;

    if (availableSideWidth >= minimumPanelWidth) {
      widthToUse = Math.min(availableSideWidth, maximumPanelWidth);
      panelX = useRightGap
        ? dockRect.x + dockRect.width + dockPanelGap
        : dockRect.x - dockPanelGap - widthToUse;
      const dockHeight = Math.max(1, Math.min(dockRect.height, bounds.height));
      const dockBottom = bounds.y + bounds.height;
      const collapsedPanelHeight = Math.min(dockHeight + 4, bounds.height);
      heightToUse = isPanelExpanded
        ? Math.max(dockHeight, dockBottom - bounds.y)
        : Math.min(collapsedPanelHeight + hoverRevealHeight, bounds.height);
      panelY = dockBottom - heightToUse;
      panelWindow.setMinimumSize(
        minimumPanelWidth,
        isPanelExpanded ? Math.min(minimumExpandedPanelHeight, heightToUse) : heightToUse,
      );
      panelWindow.setMaximumSize(maximumPanelWidth, bounds.height);
      isDockAligned = true;
    } else {
      heightToUse = Math.min(
        panelHeight + hoverRevealHeight,
        Math.max(1, dockRect.y - workArea.y + hoverRevealHeight),
      );
      panelY = dockRect.y - heightToUse;
      panelWindow.setMinimumSize(
        minimumPanelWidth,
        Math.min(minimumExpandedPanelHeight, heightToUse),
      );
    }
  } else if (orientation === "left" && dockRect) {
    panelX = dockRect.x + dockRect.width;
    heightToUse = panelHeight;
  } else if (orientation === "right" && dockRect) {
    panelX = dockRect.x - widthToUse;
    heightToUse = panelHeight;
  }

  if (isPanelExpanded) {
    heightToUse = Math.max(1, workArea.height);
    panelY = workArea.y;
  }

  panelX = Math.min(Math.max(panelX, bounds.x), bounds.x + bounds.width - widthToUse);
  if (!isDockAligned) {
    panelY = Math.min(
      Math.max(panelY, workArea.y),
      workArea.y + workArea.height - heightToUse,
    );
  }
  const nextBounds = {
    x: Math.round(panelX),
    y: Math.round(panelY),
    width: widthToUse,
    height: heightToUse,
  };
  if (
    currentBounds.x === nextBounds.x
    && currentBounds.y === nextBounds.y
    && currentBounds.width === nextBounds.width
    && currentBounds.height === nextBounds.height
  ) return;

  panelWindow.setHasShadow(isPanelExpanded || !isDockAligned);
  panelWindow.setBounds(nextBounds);
}

function togglePanel(): void {
  if (!panelWindow || panelWindow.isDestroyed()) return;
  if (panelWindow.isVisible()) {
    panelWindow.hide();
    return;
  }
  positionPanel();
  panelWindow.show();
  panelWindow.focus();
  sendToPanel("panel:focus", undefined);
}

function updatePanelHoverState(): void {
  if (selectionWindow && !selectionWindow.isDestroyed()) {
    const popup = selectionWindow;
    const bounds = popup.getBounds();
    const cursor = screen.getCursorScreenPoint();
    const isInside = popup.isVisible()
      && cursor.x >= bounds.x && cursor.x < bounds.x + bounds.width
      && cursor.y >= bounds.y && cursor.y < bounds.y + bounds.height;
    if (isInside && !isPointerInsideSelection) {
      app.focus({ steal: true });
      popup.focus();
      popup.webContents.focus();
    }
    isPointerInsideSelection = isInside;
    return;
  }
  if (!panelWindow || panelWindow.isDestroyed()) return;
  const bounds = panelWindow.getBounds();
  const cursor = screen.getCursorScreenPoint();
  const isHovered = panelWindow.isVisible()
    && cursor.x >= bounds.x
    && cursor.x < bounds.x + bounds.width
    && cursor.y >= bounds.y
    && cursor.y < bounds.y + bounds.height;
  if (isHovered && !isPointerInsidePanel) app.focus({ steal: true });
  if (isHovered && !panelWindow.isFocused()) panelWindow.focus();
  isPointerInsidePanel = isHovered;
  const shouldRevealControls = isHovered || isPanelExpanded;
  if (shouldRevealControls === isPanelHovered) return;
  isPanelHovered = shouldRevealControls;
  sendToPanel("panel:hover-state", isPanelHovered);
}

function createPanel(): void {
  panelWindow = new BrowserWindow({
    width: panelWidth,
    height: panelHeight,
    show: false,
    frame: false,
    transparent: true,
    enableLargerThanScreen: true,
    resizable: true,
    minWidth: minimumPanelWidth,
    minHeight: 44,
    maxWidth: 560,
    maxHeight: 1600,
    hasShadow: true,
    skipTaskbar: true,
    ...(process.platform === "darwin"
      ? { type: "panel" as const, acceptFirstMouse: true }
      : {}),
    webPreferences: {
      preload: path.join(__dirname, "index.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  panelWindow.setAlwaysOnTop(true, "floating");
  panelWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  panelWindow.setMenuBarVisibility(false);
  positionPanel();
  panelWindow.once("ready-to-show", () => panelWindow?.showInactive());
  panelWindow.on("resize", positionPanel);

  panelWindow.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  panelWindow.webContents.on("will-navigate", (event, targetUrl) => {
    const isDevUrl = MAIN_WINDOW_VITE_DEV_SERVER_URL
      && targetUrl.startsWith(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    if (!isDevUrl) event.preventDefault();
  });
  panelWindow.on("close", (event) => {
    if (!isQuitting) {
      event.preventDefault();
      panelWindow?.hide();
    }
  });
  panelWindow.on("closed", () => {
    panelWindow = null;
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    void panelWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    void panelWindow.loadFile(
      path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`),
    );
  }
}

app.on("before-quit", () => {
  isQuitting = true;
  piAgent?.dispose();
});

void app.whenReady().then(async () => {
  if (process.platform === "darwin") app.dock?.hide();

  const runtimeDirectory = path.join(app.getPath("userData"), "pi");
  await mkdir(runtimeDirectory, { recursive: true });
  piAgent = await PiAgent.create({
    runtimeDirectory,
    onEvent: handlePiAgentEvent,
  });

  registerIpcHandlers();
  await refreshDockGeometry(true);
  createPanel();
  setInterval(updatePanelHoverState, pollPanelHoverInterval);
  setInterval(() => void refreshDockGeometry(), pollDockGeometryInterval);
  screen.on("display-metrics-changed", positionPanel);
  screen.on("display-added", positionPanel);
  screen.on("display-removed", positionPanel);
  globalShortcut.register("CommandOrControl+Shift+Space", togglePanel);

  app.on("activate", () => {
    if (!panelWindow) createPanel();
    panelWindow?.show();
    panelWindow?.focus();
    sendToPanel("panel:focus", undefined);
  });
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
