// Hardcoded Credentials (Replace the password with an App Password for safety!)
const KOOFR_EMAIL = "lo.t.st.upidk.aely@gmail.com";
const KOOFR_PASS = "2eio48c7cr7akj6b"; 
const KOOFR_WEBDAV_URL = "https://app.koofr.net/dav/Koofr";

// Generate Basic Auth Header
const authHeader = "Basic " + btoa(KOOFR_EMAIL + ":" + KOOFR_PASS);

let lastDetectedVideo = null;

// Listen for network requests that match common video formats
chrome.webRequest.onBeforeRequest.addListener(
  function(details) {
    if (details.type === "media" || details.url.match(/\.(mp4|mkv|webm|mov|avi)(\?.*)?$/i)) {
      // Avoid loops if we are the ones fetching the video
      if (details.initiator && details.initiator.includes(chrome.runtime.id)) return;

      // Extract a clean filename or fallback to a timestamp
      let urlObj = new URL(details.url);
      let filename = urlObj.pathname.split('/').pop() || `video_${Date.now()}.mp4`;
      if (!filename.includes('.')) filename += '.mp4';

      lastDetectedVideo = {
        url: details.url,
        filename: decodeURIComponent(filename)
      };

      // Notify the popup if it's currently open
      chrome.runtime.sendMessage({ action: "videoDetected", data: lastDetectedVideo }).catch(() => {
        // Dynamic catch to ignore errors when popup is closed
      });
    }
  },
  { urls: ["<all_urls>"] }
);

// Handle communication from the popup UI
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "getLastVideo") {
    sendResponse(lastDetectedVideo);
  } 
  
  if (message.action === "uploadToKoofr") {
    uploadVideoToKoofr(message.url, message.filename);
    sendResponse({ status: "Starting upload..." });
  }
});

// Fetch video and pipe it straight to Koofr via WebDAV PUT
async function uploadVideoToKoofr(videoUrl, filename) {
  try {
    console.log(`Fetching video from: ${videoUrl}`);
    const response = await fetch(videoUrl);
    if (!response.ok) throw new Error("Failed to fetch video source.");
    
    const videoBlob = await response.blob();
    const destinationUrl = `${KOOFR_WEBDAV_URL}/${encodeURIComponent(filename)}`;

    console.log(`Uploading to Koofr root as: ${filename}`);
    const uploadResponse = await fetch(destinationUrl, {
      method: "PUT",
      headers: {
        "Authorization": authHeader,
        "Content-Type": videoBlob.type || "application/octet-stream"
      },
      body: videoBlob
    });

    if (uploadResponse.ok || uploadResponse.status === 201) {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icon.png', // Fallback to a default if you add an icon later
        title: 'Koofr Upload Success',
        message: `${filename} saved successfully to your root directory!`
      });
    } else {
      throw new Error(`WebDAV server responded with status ${uploadResponse.status}`);
    }
  } catch (error) {
    console.error("Upload failed:", error);
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon.png',
      title: 'Koofr Upload Failed',
      message: error.message
    });
  }
}
