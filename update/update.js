import { getStoreConfig } from '../utils/storeTarget.js';
import { openPrivacySettings } from './privacySettings.js';

document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(location.search);
  const version = params.get('version') || '–';
  document.getElementById('version').textContent = version;
  
  const features = [
    "⌨️ Navigate Settings with your keyboard. Expand sections with Enter or Space and move through their controls with Tab.",
    "🔎 Clearer names for controls. Rule categories, blocking modes and search fields are easier to identify with assistive technology.",
    "⬆️ Return to the top. A named scroll button brings you back to a visible action, with a clear keyboard focus.",
    "💾 Keep your entries. Collapsing a Settings section preserves your unsaved entries when you open it again."
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