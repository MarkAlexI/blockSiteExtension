import { storageUpdateHandler } from './storageUpdateHandler.js';

chrome.runtime.onInstalled.addListener(async ({ reason }) => {
  if (reason === 'install') {
    const { rules } = await chrome.storage.sync.get('rules');
    if (rules && Array.isArray(rules)) {
      const changes = {
        rules: {
          newValue: rules
        }
      };
      
      try {
        await storageUpdateHandler(changes);
        console.log('DNR правила створено під час install');
      } catch (e) {
        console.error('Помилка при створенні правил на install:', e);
      }
    }
  }
});

const showUpdates = (details) => {
  if (details.reason === 'update') {
    const version = chrome.runtime.getManifest().version;
    chrome.tabs.create({
      url: chrome.runtime.getURL(`update/update.html?version=${version}`)
    });
  }
};

chrome.runtime.onInstalled.addListener(showUpdates);