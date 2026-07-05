// Electron-hovedproces for Cardware Crash
const { app, BrowserWindow, Menu } = require("electron");
const path = require("path");

// electron-updater indlæses "blødt" — mangler den (fx i en usigneret dev-build),
// kører spillet bare uden opdateringstjek i stedet for at crashe.
let autoUpdater = null;
try { autoUpdater = require("electron-updater").autoUpdater; } catch (_) {}

if (!app.requestSingleInstanceLock()) app.quit();

function createWindow() {
  const win = new BrowserWindow({
    width: 1360, height: 840, minWidth: 980, minHeight: 640,
    backgroundColor: "#0c1811",
    autoHideMenuBar: true,
    icon: path.join(__dirname, "build", process.platform === "win32" ? "icon.ico" : "icon.png"),
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  win.loadFile(path.join(__dirname, "app", "index.html"));

  // F11 = fuldskærm
  win.webContents.on("before-input-event", (e, input) => {
    if (input.type === "keyDown" && input.key === "F11") {
      win.setFullScreen(!win.isFullScreen());
      e.preventDefault();
    }
  });
  return win;
}

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
  createWindow();

  // tjek for patches ved opstart (silent download, installeres ved næste luk)
  if (autoUpdater) {
    autoUpdater.autoDownload = true;
    autoUpdater.checkForUpdatesAndNotify().catch(() => {});
  }

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
