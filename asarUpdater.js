const https = require('https');
const fs = require('original-fs'); // Critical: Use original-fs to bypass Electron's ASAR filesystem
const { app } = require('electron');
const config = require('./updateConfig');

// Utility: Follow HTTP redirects
const followRedirects = (url, redirectCount = 0) => {
  if (redirectCount > 5) {
    throw new Error('Too many redirects');
  }

  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      const location = res.headers.location;
      if (location) {
        return followRedirects(location, redirectCount + 1)
          .then(resolve)
          .catch(reject);
      }
      resolve(res);
    });

    req.on('error', reject);
    req.setTimeout(config.downloadTimeout, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
  });
};

// Fetch version manifest
const fetchVersionManifest = () => {
  return new Promise((resolve, reject) => {
    const req = https.get(config.versionManifestUrl, (res) => {
      // Handle redirects
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchVersionManifest().then(resolve).catch(reject);
      }

      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }

      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error('Invalid JSON'));
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(config.versionCheckTimeout, () => {
      req.destroy();
      reject(new Error('Version check timeout'));
    });
  });
};

// Compare versions (semantic versioning)
const compareVersions = (current, remote) => {
  const currentParts = current.split('.').map(Number);
  const remoteParts = remote.split('.').map(Number);

  for (let i = 0; i < Math.max(currentParts.length, remoteParts.length); i++) {
    const c = currentParts[i] || 0;
    const r = remoteParts[i] || 0;

    if (r > c) return 1;  // Remote is newer
    if (r < c) return -1; // Remote is older
  }

  return 0; // Versions are equal
};

// Download ASAR file
const downloadAsar = async (asarUrl, downloadPath) => {
  const response = await followRedirects(asarUrl);

  return new Promise((resolve, reject) => {
    const fileStream = fs.createWriteStream(downloadPath);

    response.pipe(fileStream);

    fileStream.on('finish', () => {
      fileStream.close();
      resolve();
    });

    fileStream.on('error', (err) => {
      // Clean up on error
      try {
        fs.unlinkSync(downloadPath);
      } catch (e) {}
      reject(err);
    });

    response.on('error', reject);
  });
};

// Validate ASAR file
const validateAsar = (filePath) => {
  try {
    const stats = fs.statSync(filePath);

    // Size check
    if (stats.size < config.minAsarSize || stats.size > config.maxAsarSize) {
      console.error(`AsarUpdate: Invalid size ${stats.size} bytes`);
      return false;
    }

    // Magic bytes check
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(4);
    fs.readSync(fd, buffer, 0, 4, 0);
    fs.closeSync(fd);

    if (buffer.toString('hex') !== config.asarMagicBytes) {
      console.error(`AsarUpdate: Invalid magic bytes ${buffer.toString('hex')}`);
      return false;
    }

    // Check it's not an HTML error page
    const headerFd = fs.openSync(filePath, 'r');
    const headerBuffer = Buffer.alloc(100);
    fs.readSync(headerFd, headerBuffer, 0, 100, 0);
    fs.closeSync(headerFd);

    const headerStr = headerBuffer.toString('utf8');
    if (headerStr.includes('<html') || headerStr.includes('<!DOCTYPE')) {
      console.error('AsarUpdate: Downloaded file is HTML, not ASAR');
      return false;
    }

    return true;
  } catch (e) {
    console.error('AsarUpdate: Validation error:', e);
    return false;
  }
};

// Replace ASAR file with atomic backup/restore
const replaceAsar = (downloadPath, asarPath) => {
  const backupPath = config.getBackupPath();

  try {
    // Backup current ASAR
    if (fs.existsSync(asarPath)) {
      fs.copyFileSync(asarPath, backupPath);
    }

    // Replace with new ASAR
    fs.copyFileSync(downloadPath, asarPath);

    // Clean up download file
    fs.unlinkSync(downloadPath);

    // Remove backup on success
    if (fs.existsSync(backupPath)) {
      fs.unlinkSync(backupPath);
    }

    return true;
  } catch (e) {
    console.error('AsarUpdate: Replacement error:', e);

    // Restore from backup on failure
    if (fs.existsSync(backupPath)) {
      try {
        fs.copyFileSync(backupPath, asarPath);
        fs.unlinkSync(backupPath);
        console.log('AsarUpdate: Restored from backup');
      } catch (restoreErr) {
        console.error('AsarUpdate: Failed to restore backup:', restoreErr);
      }
    }

    // Clean up download file
    if (fs.existsSync(downloadPath)) {
      try {
        fs.unlinkSync(downloadPath);
      } catch (unlinkErr) {}
    }

    return false;
  }
};

// Main update function
module.exports = async () => {
  try {
    console.log('AsarUpdate: Checking for updates...');

    // Fetch version manifest
    const manifest = await fetchVersionManifest();
    const currentVersion = require('./package.json').version;

    console.log(`AsarUpdate: Current: ${currentVersion}, Remote: ${manifest.version}`);

    // Compare versions
    const comparison = compareVersions(currentVersion, manifest.version);

    if (comparison >= 0) {
      console.log('AsarUpdate: Already up to date');
      return 'no-update';
    }

    // Download new ASAR
    console.log('AsarUpdate: Downloading update...');
    const downloadPath = config.getDownloadPath();
    await downloadAsar(manifest.asarUrl || config.asarUrl, downloadPath);

    // Validate
    console.log('AsarUpdate: Validating...');
    if (!validateAsar(downloadPath)) {
      console.error('AsarUpdate: Validation failed');
      try {
        fs.unlinkSync(downloadPath);
      } catch (e) {}
      return 'failed';
    }

    // Replace ASAR
    console.log('AsarUpdate: Installing update...');
    const asarPath = config.getAsarPath();
    if (!replaceAsar(downloadPath, asarPath)) {
      console.error('AsarUpdate: Replacement failed');
      return 'failed';
    }

    // Restart app
    console.log('AsarUpdate: Update successful, restarting...');
    app.relaunch();
    app.quit();

    return 'restart';
  } catch (e) {
    console.error('AsarUpdate: Error:', e);
    return 'error';
  }
};
