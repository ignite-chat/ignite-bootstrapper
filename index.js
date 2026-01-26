const { app } = require('electron');
const { join, basename } = require('path');
const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');

app.setAppUserModelId("com.squirrel.ignite.ignite");

// this should be placed at top of main.js to handle setup events quickly
if (handleSquirrelEvent()) {
    // squirrel event handled and app will exit in 1000ms, so don't do anything else
    return;
}

function handleSquirrelEvent() {
    if (process.argv.length === 1) {
        return false;
    }

    const path = require('path');

    const installAutoLaunch = function () {
        if (process.platform !== 'win32') {
            return;
        }

        const exec = app.getPath('exe');
        const appName = path.basename(exec, '.exe');
        const queuePrefix = ['HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', '/v', appName];
        const reg = (a, c) => require('child_process').execFile('reg.exe', a, c);

        // Add registry entry for auto launch
        reg(['add', ...queuePrefix, '/d', '"' + join(exec, '..', '..', 'Update.exe') + '" --processStart ' + basename(exec), '/f'], null);
    }

    const uninstallAutoLaunch = function () {
        if (process.platform !== 'win32') {
            return;
        }

        const exec = app.getPath('exe');
        const appName = path.basename(exec, '.exe');
        const queuePrefix = ['HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run', '/v', appName];
        const reg = (a, c) => require('child_process').execFile('reg.exe', a, c);

        // Remove registry entry for auto launch
        reg(['delete', ...queuePrefix, '/f'], null);
    }

    // --- Shortcut creation/removal ---
    function createDesktopShortcut() {
        if (process.platform !== 'win32') return;

        const exec = app.getPath('exe');
        const appName = path.basename(exec, '.exe');
        const updateExe = path.resolve(path.join(exec, '..', '..', 'Update.exe'));
        const processStartArg = '--processStart ' + path.basename(exec);
        const desktopDir = path.join(os.homedir(), 'Desktop');
        const shortcutPath = path.join(desktopDir, `${appName}.lnk`);
        const iconPath = path.resolve(path.join(exec, '..', '..', 'app.ico'));

        const vbsScript = `
Set oWS = WScript.CreateObject("WScript.Shell")
sLinkFile = "${shortcutPath.replace(/\\/g, '\\\\')}"
Set oLink = oWS.CreateShortcut(sLinkFile)
oLink.TargetPath = "${updateExe.replace(/\\/g, '\\\\')}"
oLink.Arguments = "${processStartArg}"
oLink.WorkingDirectory = "${path.dirname(updateExe).replace(/\\/g, '\\\\')}"
oLink.WindowStyle = 1
oLink.Description = "${appName}"
oLink.IconLocation = "${iconPath.replace(/\\/g, '\\\\')}"
oLink.Save
`;
        const vbsPath = path.join(os.tmpdir(), 'create_shortcut.vbs');
        fs.writeFileSync(vbsPath, vbsScript, 'utf16le');
        try {
            execSync(`cscript //nologo "${vbsPath}"`);
        } catch (err) {
            // ignore errors
        } finally {
            fs.unlinkSync(vbsPath);
        }
    }

    function removeDesktopShortcut() {
        if (process.platform !== 'win32') return;

        const exec = app.getPath('exe');
        const appName = path.basename(exec, '.exe');
        const desktopDir = path.join(os.homedir(), 'Desktop');
        const shortcutPath = path.join(desktopDir, `${appName}.lnk`);
        try {
            fs.unlinkSync(shortcutPath);
        } catch (e) {
            // ignore if not found
        }
    }
    // --- End shortcut creation/removal ---

    const squirrelEvent = process.argv[1];
    switch (squirrelEvent) {
        case '--squirrel-install':
        case '--squirrel-updated':
            installAutoLaunch();
            createDesktopShortcut();
            setTimeout(app.quit, 1000);
            return true;

        case '--squirrel-uninstall':
            uninstallAutoLaunch();
            removeDesktopShortcut();
            setTimeout(app.quit, 1000);
            return true;

        case '--squirrel-obsolete':
            app.quit();
            return true;
    }
}

// Start bootstrap
require('./bootstrap.cjs')();