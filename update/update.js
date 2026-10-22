import { getStoreConfig } from '../utils/storeTarget.js';
import { openPrivacySettings } from './privacySettings.js';

document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(location.search);
  const version = params.get('version') || '–';
  document.getElementById('version').textContent = version;
  
  const features = [
    "✨ A familiar look, with more clarity. Richer blues, deeper greens and clearer text make your everyday controls easier to read.",
    "🧊 A lighter touch of glass. Settings keep a soft, layered look, with a solid fallback that stays readable without blur.",
    "⌨️ Follow your focus. Clearer keyboard outlines help you see which control is ready for your next action.",
    "🌿 Your routines stay yours. Your saved rules, schedules and Pro access carry on as before."
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