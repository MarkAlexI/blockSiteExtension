/**
 * Closes all tabs whose URL contains the given blockURL string.
 * @param {string} blockURL — The full or partial URL used to match and close tabs.
 */
export function closeTabsMatchingRule(blockURL) {
  if (!blockURL || blockURL.trim() === '') return;

  chrome.tabs.query({}, (tabs) => {
    tabs.forEach((tab) => {
      try {
        const tabUrl = tab.url || '';

        if (tabUrl.includes(blockURL)) {
          chrome.tabs.remove(tab.id);
        }
      } catch (e) {
        console.log(e);
      }
    });
  });
}