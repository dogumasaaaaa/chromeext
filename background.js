// Hardcoded Credentials
const KOOFR_EMAIL = "lo.t.st.upidk.aely@gmail.com";
const KOOFR_PASS = "2eio48c7cr7akj6b"; 
const KOOFR_WEBDAV_URL = "https://app.koofr.net/dav/Koofr";

const authHeader = "Basic " + btoa(KOOFR_EMAIL + ":" + KOOFR_PASS);
let lastDetectedVideo = null;

// An aggressive regular expression to match videos (even with query parameters)
const videoRegex = /\.(mp4|mkv|webm|mov|avi|mp3|m4a|ts)(\?.*)?$/i;

chrome.webRequest.onBeforeRequest.addListener(
  function(details) {
    // Ignore internal extension requests
    if (details.initiator && details.initiator.includes(chrome.runtime.id)) return;

    // Check if type is media, or if the URL clearly points to a video file extension
    if (details.type === "media" || videoRegex.test(details.url)) {
      
      let urlObj = new URL(details.url);
      let filename = urlObj.pathname.split('/').pop() || `video_${Date.now()}.mp4`;
      
      // Clean up filename from query strings if any
      filename = filename.split('?')[0];
      if (!filename.includes('.')) filename += '.mp4';

      lastDetectedVideo = {
        url: details.url,
        filename: decodeURIComponent(filename)
      };

      console.log("Captured Video URL:", details.url);

      // Instantly notify popup if it's active
      chrome.runtime.sendMessage({ action: "videoDetected", data: lastDetectedVideo }).catch(() => {
        // Suppress errors when popup UI is closed
      });
    }
  },
  { urls: ["<all_urls>"] } // Listen to all traffic
);

// Handle messaging
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "getLastVideo") {
    sendResponse(lastDetectedVideo);
  } 
  
  if (message.action === "uploadToKoofr") {
    uploadVideoToKoofr(message.url, message.filename);
    sendResponse({ status: "Starting..." });
  }
});

// WebDAV Direct Upload Logic
async function uploadVideoToKoofr(videoUrl, filename) {
  try {
    const response = await fetch(videoUrl);
    if (!response.ok) throw new Error("Failed to fetch target video data.");
    
    const videoBlob = await response.blob();
    const destinationUrl = `${KOOFR_WEBDAV_URL}/${encodeURIComponent(filename)}`;

    const uploadResponse = await fetch(destinationUrl, {
      method: "PUT",
      headers: {
        "Authorization": authHeader,
        "Content-Type": videoBlob.type || "application/octet-stream"
      },
      body: videoBlob
    });

    if (uploadResponse.ok || uploadResponse.status === 201) {
      console.log("Uploaded successfully!");
    } else {
      throw new Error(`WebDAV Error: ${uploadResponse.status}`);
    }
  } catch (error) {
    console.error("Upload failed:", error);
  }
}
