chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {})
})

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'EXTENSION_OPEN_URL' && typeof message.url === 'string') {
    chrome.tabs.create({ url: message.url }).then(() => sendResponse({ ok: true }))
    return true
  }

  return false
})
