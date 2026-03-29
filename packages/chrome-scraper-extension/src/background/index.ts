chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {})
})

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message?.type === 'EXTENSION_OPEN_URL' && typeof message.url === 'string') {
    chrome.tabs.create({ url: message.url }).then(() => sendResponse({ ok: true }))
    return true
  }

  if (
    message?.type === 'EXTENSION_DOWNLOAD_FILE' &&
    typeof message.url === 'string' &&
    typeof message.fileName === 'string'
  ) {
    chrome.downloads
      .download({
        url: message.url,
        filename: message.fileName,
        conflictAction: 'uniquify',
        saveAs: Boolean(message.saveAs),
      })
      .then((downloadId) => sendResponse({ ok: true, downloadId }))
      .catch((error: unknown) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : 'Could not start the download.',
        }),
      )
    return true
  }

  return false
})
