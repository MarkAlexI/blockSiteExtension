import { getStoreConfig } from '../utils/storeTarget.js';
import { openPrivacySettings } from './privacySettings.js';

document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(location.search);
  const version = params.get('version') || '–';
  document.getElementById('version').textContent = version;
  
  const features = [
    "Switching between Always, Schedule and Daily Limit now keeps today's used time, including after a browser restart.",
    "Daily Limits start when you return to a tracked site from Settings, and pause when the page is hidden.",
    "Switching a disabled Always rule to a Daily Limit or schedule now applies the selected mode."
  ];
  
  const ul = document.getElementById('features');
  features.forEach(item => {
    const li = document.createElement('li');
    li.textContent = item;
    ul.append(li);
  });
  
  const store = getStoreConfig();
  document.getElementById('store_link')?.setAttribute('href', store.reviewUrl);
  
  document.getElementById('privacy-settings-btn')?.addEventListener('click', () => {
    openPrivacySettings({
      runtime: chrome.runtime,
      tabs: chrome.tabs,
      storeTarget: store.target
    });
  });

  document.getElementById('close-btn')
    .addEventListener('click', () => window.close());
});