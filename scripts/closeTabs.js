/**
 * Closes tabs matching the blockURL.
 * Prevents browser window closure if all tabs match.
 * @param {string} blockURL - URL pattern to match
 */
export async function closeTabsMatchingRule(blockURL) {
  if (!blockURL || blockURL.trim() === '') return;
  
  const tabs = await chrome.tabs.query({});
  const tabsToRemoveIds = [];
  
  for (const tab of tabs) {
    try {
      if (tab.url && tab.url.toLowerCase().includes(blockURL.toLowerCase())) {
        tabsToRemoveIds.push(tab.id);
      }
    } catch (e) {
      console.warn("Error checking tab:", tab, e);
    }
  }
  
  if (tabsToRemoveIds.length === 0) return;
  
  const allTabsWillBeClosed = tabs.length === tabsToRemoveIds.length;
  
  if (allTabsWillBeClosed) {
    await chrome.tabs.create({});
  }
  
  await chrome.tabs.remove(tabsToRemoveIds);
}