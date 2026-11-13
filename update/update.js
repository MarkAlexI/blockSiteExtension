import { getStoreConfig } from '../utils/storeTarget.js';
import { openPrivacySettings } from './privacySettings.js';

document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(location.search);
  const version = params.get('version') || '–';
  document.getElementById('version').textContent = version;
  
  const features = [
    "Focus protection stays in place if the browser temporarily cannot read saved session state."
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