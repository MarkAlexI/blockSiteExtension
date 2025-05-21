import { storageUpdateHandler } from './storageUpdateHandler.js';

chrome.storage.sync.onChanged.addListener(storageUpdateHandler);