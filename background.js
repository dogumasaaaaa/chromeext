// Default hardcoded credentials
const DEFAULT_CREDS = {
  email: "lo.t.st.upidk.aely@gmail.com",
  appPass: "2eio48c7cr7akj6b"
};

// Initialize default credentials if none exist
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(["email", "appPass"], (result) => {
    if (!result.email || !result.appPass) {
      chrome.storage.local.set(DEFAULT_CREDS);
    }
  });
});

// Sniff network traffic for .m3u8 links
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    if (details.url.includes(".m3u8")) {
      // Send the captured stream URL to the active tab's content script
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, {
            type: "M3U8_DETECTED",
            url: details.url
          }).catch(() => {/* Ignore errors from tabs without content scripts */});
        }
      });
    }
  },
  { urls: ["<all_urls>"] }
);

// Handle the upload process via WebDAV
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "UPLOAD_TO_WEBDAV") {
    chrome.storage.local.get(["email", "appPass"], async (creds) => {
      const email = creds.email || DEFAULT_CREDS.email;
      const pass = creds.appPass || DEFAULT_CREDS.appPass;
      
      // Generate unique random filename
      const randomName = "video_" + Math.random().toString(36).substring(2, 15) + ".mp4";
      const webdavUrl = `https://app.koofr.net/dav/Koofr/${randomName}`;
      
      // Basic Auth encoding
      const authHeader = "Basic " + btoa(email + ":" + pass);

      try {
        // Step 1: Fetch the target stream file data
        const videoData = await fetch(message.videoUrl).then(res => res.blob());

        // Step 2: Upload directly to Koofr via WebDAV PUT request
        const response = await fetch(webdavUrl, {
          method: "PUT",
          headers: {
            "Authorization": authHeader,
            "Content-Type": "video/mp4"
          },
          body: videoData
        });

        if (response.ok) {
          sendResponse({ success: true, fileName: randomName });
        } else {
          sendResponse({ success: false, error: `WebDAV Server responded with status ${response.status}` });
        }
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    });
    return true; // Keeps the message channel open for async response
  }
});
