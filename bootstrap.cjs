const { app, BrowserWindow } = require('electron');
const { join } = require('path');

const startCore = () => {
  const w = new BrowserWindow({
    width: 1200,
    height: 800,
    center: true,
    backgroundColor: '#2f3136',
    webPreferences: {
      preload: join(__dirname, "preload.js"),
    },
  });

  w.loadURL("https://app.ignite-chat.com")
};

const startUpdate = () => {
  // TODO: implement auto-updater here

  startCore();
};


module.exports = () => {
  app.whenReady().then(() => {
    startUpdate();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) startUpdate();
    });
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
};
