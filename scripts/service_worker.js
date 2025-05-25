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