import { getStoreConfig } from '../utils/storeTarget.js';
import { openPrivacySettings } from './privacySettings.js';

document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(location.search);
  const version = params.get('version') || '–';
  document.getElementById('version').textContent = version;
  
  const features = [
    "🔔 A built-in Focus completion sound. The Focus Session sound setting now plays a short chime using your device's media volume.",
    "▶️ Listen before your next session. Open Settings → Basic Settings and use Listen to preview the sound.",
    "🎛️ Your sound preference stays yours. Turning the Focus sound off keeps the visual completion notification.",
    "⏰ Quiet recovery. Reopening the browser after an old session has expired won't play a stale sound."
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