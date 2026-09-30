import { getStoreConfig } from '../utils/storeTarget.js';
import { openPrivacySettings } from './privacySettings.js';

document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(location.search);
  const version = params.get('version') || '–';
  document.getElementById('version').textContent = version;
  
  const features = [
    "🕘 Make room for focus. Choose your days and times, and let Pro start your focus sessions for you. One less thing to remember.",
    "🌿 Plans change. That’s okay. Skip your next scheduled session without losing the routine you’ve built.",
    "🧳 Take your setup with you. Recent improvements make restoring your saved rules safer when you move to another browser or device.",
    "💡 A little help, when you need it. Find the User Guide right from the extension, with practical tips to help you make it your own."
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