const { app } = require('electron');

module.exports = {
  // Update URLs
  versionManifestUrl: 'https://ignite-chat.com/download/version.json',
  asarUrl: 'https://ignite-chat.com/download/app.asar',

  // Timeouts (milliseconds)
  versionCheckTimeout: 10000,  // 10 seconds
  downloadTimeout: 60000,       // 60 seconds

  // Validation
  minAsarSize: 100 * 1024,        // 100 KB
  maxAsarSize: 500 * 1024 * 1024, // 500 MB

  // ASAR magic bytes (little-endian)
  asarMagicBytes: '04000000',

  // Paths
  getAsarPath: () => app.getAppPath(),
  getDownloadPath: () => app.getAppPath() + '.download',
  getBackupPath: () => app.getAppPath() + '.backup',
};
