import { contextBridge, ipcRenderer } from "electron";
import type { SideApi } from "../shared/contracts";

const sideApi: SideApi = {
  getSessions: () => ipcRenderer.invoke("sessions:get"),
  createSession: () => ipcRenderer.invoke("sessions:create"),
  selectSession: (id) => ipcRenderer.invoke("sessions:select", id),
  getCatalog: () => ipcRenderer.invoke("catalog:get"),
  showProviderMenu: (selectedId, anchor) => ipcRenderer.invoke("selection:provider", selectedId, anchor),
  showModelMenu: (providerId, selectedId, anchor) => ipcRenderer.invoke("selection:model", providerId, selectedId, anchor),
  showReasoningMenu: (providerId, modelId, selectedId, anchor) => ipcRenderer.invoke("selection:reasoning", providerId, modelId, selectedId, anchor),
  getSelectionOptions: () => ipcRenderer.invoke("selection:options"),
  chooseSelection: (id) => ipcRenderer.send("selection:choose", id),
  cancelSelection: () => ipcRenderer.send("selection:cancel"),
  sendMessage: (request) => ipcRenderer.send("chat:send", request),
  stopMessage: (requestId) => ipcRenderer.send("chat:stop", requestId),
  login: (providerId, type) => ipcRenderer.invoke("auth:login", providerId, type),
  logout: (providerId) => ipcRenderer.invoke("auth:logout", providerId),
  respondToAuthPrompt: (id, value) => ipcRenderer.invoke("auth:respond", id, value),
  cancelAuthPrompt: (id) => ipcRenderer.invoke("auth:cancel", id),
  openExternal: (url) => ipcRenderer.invoke("external:open", url),
  expandPanel: () => ipcRenderer.send("panel:expand"),
  onChatEvent(callback) {
    const listener = (_event: Electron.IpcRendererEvent, payload: Parameters<typeof callback>[0]) => callback(payload);
    ipcRenderer.on("chat:event", listener);
    return () => ipcRenderer.removeListener("chat:event", listener);
  },
  onAuthPrompt(callback) {
    const listener = (_event: Electron.IpcRendererEvent, payload: Parameters<typeof callback>[0]) => callback(payload);
    ipcRenderer.on("auth:prompt", listener);
    return () => ipcRenderer.removeListener("auth:prompt", listener);
  },
  onAuthEvent(callback) {
    const listener = (_event: Electron.IpcRendererEvent, payload: Parameters<typeof callback>[0]) => callback(payload);
    ipcRenderer.on("auth:event", listener);
    return () => ipcRenderer.removeListener("auth:event", listener);
  },
  onPanelFocus(callback) {
    const listener = () => callback();
    ipcRenderer.on("panel:focus", listener);
    return () => ipcRenderer.removeListener("panel:focus", listener);
  },
};

contextBridge.exposeInMainWorld("side", sideApi);
