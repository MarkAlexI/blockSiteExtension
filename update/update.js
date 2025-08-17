document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(location.search);
  const version = params.get('version') || '–';
  document.getElementById('version').textContent = version;
  
  const features = [
    'We’ve made several improvements to stability and accessibility.',
    'The issue with closing tabs by rule has been fixed, and translations with placeholders now display correctly.',
    'We also improved the handling of localized messages in the settings page and added accessibility attributes to form inputs and table headers.'
  ];
  
  const ul = document.getElementById('features');
  features.forEach(item => {
    const li = document.createElement('li');
    li.textContent = item;
    ul.append(li);
  });
  
  document.getElementById('close-btn')
    .addEventListener('click', () => window.close());
});