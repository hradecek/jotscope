// Jotscope does all of its work in the popup - there is no background
// behaviour, no network, and no message handling. This no-op listener simply
// keeps a valid (idle) MV3 service worker registered for the extension.
chrome.runtime.onInstalled.addListener(() => {});
