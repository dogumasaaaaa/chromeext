const DEFAULT_CREDS = {
  email: "lo.t.st.upidk.aely@gmail.com",
  appPass: "2eio48c7cr7akj6b"
};

// Initialize default variables if not found
chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(["email", "appPass"], (result) => {
    if (!result.email || !result.appPass) {
      chrome.storage.local.set(DEFAULT_CREDS);
    }
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "UPLOAD_TO_WEBDAV") {
    chrome.storage.local.get(["email", "appPass"], async (creds) => {
      const email = creds.email || DEFAULT_CREDS.email;
      const pass = creds.appPass || DEFAULT_CREDS.appPass;
      
      // Generate a randomized file handle string ending in custom .mp4 requirement
      const randomString = Math.random().toString(36).substring(2, 10) + "_" + Math.random().toString(36).substring(2, 10);
      const fileName = `grabbed_${randomString}.mp4`;
      const webdavUrl = `https://app.koofr.net/dav/Koofr/${fileName}`;
      
      const authHeader = "Basic " + btoa(email + ":" + pass);

      try {
        // Fetch raw target data streams
        const response = await fetch(message.videoUrl);
        if (!response.ok) throw new Error(`Could not fetch original video file source (Status ${response.status})`);
        
        const blobData = await response.blob();

        // Ship stream payload directly to Koofr storage structure
        const uploadResponse = await fetch(webdavUrl, {
          method: "PUT",
          headers: {
            "Authorization": authHeader,
            "Content-Type": "video/mp4"
          },
          body: blobData
        });

        if (uploadResponse.ok) {
          sendResponse({ success: true, fileName: fileName });
        } else {
          sendResponse({ success: false, error: `Koofr Server rejection code: ${uploadResponse.status}` });
        }
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
    });
    return true; // Keep asynchronous bridge pathway open
  }
});
