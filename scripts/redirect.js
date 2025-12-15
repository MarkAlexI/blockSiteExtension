import Logger from '../utils/logger.js';

try {
  const url = new URL(window.location.href);
  const fromUrl = url.searchParams.get('from');
  const toUrl = url.searchParams.get('to');
  
  if (fromUrl && toUrl) {
    try {
      chrome.runtime.sendMessage({
        type: 'record_redirect',
        from: fromUrl,
        to: toUrl
      });
    } catch (error) {
      Logger.error('Error sending redirect record message:', error);
    }
    
    location.replace(toUrl);
    
  } else {
    Logger.warn('Redirect page called without "from" or "to" params.');
    location.replace(chrome.runtime.getURL("blocked.html"));
  }
} catch (error) {
  Logger.error('Error in redirect script:', error);
  location.replace(chrome.runtime.getURL("blocked.html"));
}