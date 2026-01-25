"use strict";

Object.defineProperty(exports, "__esModule", {
    value: true
});
if (!process.isMainFrame) {
    throw new Error('IgniteNative preload script should only be loaded in main frames');
}
if (window.opener === null) {
    const { contextBridge } = require('electron');
    const IgniteNative = {
        isRenderer: process.type === 'renderer',
    };
    contextBridge.exposeInMainWorld('IgniteNative', IgniteNative);
}