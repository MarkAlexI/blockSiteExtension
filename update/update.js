document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(location.search);
  const version = params.get('version') || '–';
  document.getElementById('version').textContent = version;
  
  const features = [
    "🟢 Whitelist Feature: Create Pro exclusion rules that override your blacklist. Keep essential workspace sites accessible while maintaining your focus setup.",
    "🧠 Smart Conflict Validation: The rules engine now automatically detects overlapping sub-paths and blocks contradictory blacklist/whitelist entries to prevent loops.",
    "🎨 UI Visual Polish: Resolved table grid rendering bugs, fixed action button wrapping on mobile screens."
  ];
  
  const ul = document.getElementById('features');
  features.forEach(item => {
    const li = document.createElement('li');
    li.textContent = item;
    ul.append(li);
  });
  
  if (chrome.runtime.id === 'ilmfjlfmilmafofbanphijmbklbmolhi') {
    document.getElementById('store_link').setAttribute('href', 'https://microsoftedge.microsoft.com/addons/detail/ilmfjlfmilmafofbanphijmbklbmolhi');
  }
  
  document.getElementById('close-btn')
    .addEventListener('click', () => window.close());
});