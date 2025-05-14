async function storageUpdateHandler(changes) {
  const template = changes.rules.newValue.slice();
  
  const newRules = template.map((rule, i) => {
    const filter = normalizeUrlFilter(rule.blockURL);
    const urlFilter = `||${filter}`;
    
    const base = {
      id: i + 1,
      condition: {
        urlFilter,
        resourceTypes: ["main_frame"]
      },
      priority: 100
    };
    
    base.action = rule.redirectURL ?
      { type: "redirect", redirect: { url: rule.redirectURL } } :
      { type: "block" };
    
    return base;
  });
  
  try {
    const oldRules = await chrome.declarativeNetRequest.getDynamicRules();
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: oldRules.map(rule => rule.id),
      addRules: newRules
    });
  } catch (e) {
    console.error("DNR update error:", e);
  }
}

chrome.storage.sync.onChanged.addListener(storageUpdateHandler);