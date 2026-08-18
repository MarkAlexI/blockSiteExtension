function createOptionsTab(runtime, tabs) {
  const url = runtime.getURL('options/options.html');

  try {
    const result = tabs.create({ url });
    if (result && typeof result.catch === 'function') {
      result.catch(() => {});
    }
  } catch {
    // The update page can remain open if the browser cannot create the tab.
  }
}

export function openPrivacySettings({ runtime, tabs, storeTarget }) {
  if (!runtime || !tabs) return;

  // Edge for Android exposes openOptionsPage(), but it may complete without
  // opening the extension options UI. Open the packaged page directly there.
  if (storeTarget === 'edge') {
    createOptionsTab(runtime, tabs);
    return;
  }

  if (typeof runtime.openOptionsPage !== 'function') {
    createOptionsTab(runtime, tabs);
    return;
  }

  try {
    runtime.openOptionsPage(() => {
      if (runtime.lastError) {
        createOptionsTab(runtime, tabs);
      }
    });
  } catch {
    createOptionsTab(runtime, tabs);
  }
}
