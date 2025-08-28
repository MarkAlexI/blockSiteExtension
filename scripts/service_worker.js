import { normalizeUrlFilter } from './normalizeUrlFilter.js';

function createDnrRuleFromStored(storedRule) {
  const filter = normalizeUrlFilter(storedRule.blockURL);
  const urlFilter = `||${filter}`;
  const action = storedRule.redirectURL ?
    { type: "redirect", redirect: { url: storedRule.redirectURL } } :
    { type: "redirect", redirect: { url: chrome.runtime.getURL("blocked.html") } };
  
  return {
    id: storedRule.id,
    condition: { urlFilter, resourceTypes: ["main_frame"] },
    priority: 100,
    action
  };
}

async function syncDnrFromStorage() {
  try {
    const { rules: storedRules } = await chrome.storage.sync.get('rules');
    if (!storedRules || !storedRules.length) return;
    
    const dnrRules = await chrome.declarativeNetRequest.getDynamicRules();
    
    const missing = storedRules.filter(sr => !dnrRules.some(dr => dr.id === sr.id));
    if (missing.length) {
      const addRules = missing.map(sr => createDnrRuleFromStored(sr));
      await chrome.declarativeNetRequest.updateDynamicRules({ addRules });
    }
    
    const extra = dnrRules.filter(dr => !storedRules.some(sr => sr.id === dr.id));
    if (extra.length) {
      const removeRuleIds = extra.map(dr => dr.id);
      await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds });
    }
  } catch (e) {
    console.error("DNR sync error:", e);
  }
}

const showUpdates = (details) => {
  chrome.storage.sync.get(['settings'], ({ settings }) => {
    const showNotifications = settings?.showNotifications === true;
    
    if (details.reason === 'update' && showNotifications === true) {
      const version = chrome.runtime.getManifest().version;
      chrome.tabs.create({
        url: chrome.runtime.getURL(`update/update.html?version=${version}`)
      });
    }
  });
};

chrome.runtime.onStartup.addListener(syncDnrFromStorage);
chrome.runtime.onInstalled.addListener(syncDnrFromStorage);
chrome.runtime.onInstalled.addListener(showUpdates);