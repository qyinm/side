import { contextBridge, ipcRenderer } from "electron";
import type { SideApi } from "../shared/contracts";

const sideApi: SideApi = {
  getCatalog: () => ipcRenderer.invoke("catalog:get"),
  sendMessage: (request) => ipcRenderer.send("chat:send", request),
  stopMessage: (requestId) => ipcRenderer.send("chat:stop", requestId),
  login: (providerId, type) => ipcRenderer.invoke("auth:login", providerId, type),
  logout: (providerId) => ipcRenderer.invoke("auth:logout", providerId),
  respondToAuthPrompt: (id, value) => ipcRenderer.invoke("auth:respond", id, value),
  cancelAuthPrompt: (id) => ipcRenderer.invoke("auth:cancel", id),
  openExternal: (url) => ipcRenderer.invoke("external:open", url),
  togglePanelSize: () => ipcRenderer.send("panel:toggle-size"),
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
  onPanelHover(callback) {
    const listener = (_event: Electron.IpcRendererEvent, hovered: boolean) => callback(hovered);
    ipcRenderer.on("panel:hover-state", listener);
    ipcRenderer.send("panel:hover-state:get");
    return () => ipcRenderer.removeListener("panel:hover-state", listener);
  },
};

contextBridge.exposeInMainWorld("side", sideApi);
