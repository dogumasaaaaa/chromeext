// Hardcoded Credentials
const KOOFR_EMAIL = "lo.t.st.upidk.aely@gmail.com";
const KOOFR_PASS = "2eio48c7cr7akj6b"; 
const KOOFR_WEBDAV_URL = "https://app.koofr.net/dav/Koofr/"; // Fixed: Added trailing slash for WebDAV compliance

const authHeader = "Basic " + btoa(KOOFR_EMAIL + ":" + KOOFR_PASS);
let lastDetectedVideo = null;

const videoRegex = /\.(mp4|mkv|webm|mov|avi|m3u8)(\?.*)?$/i;

chrome.webRequest.onBeforeRequest.addListener(
  function(details) {
    if (details.initiator && details.initiator.includes(chrome.runtime.id)) return;
    if (details.url.includes("ads") || details.url.includes("popunder") || details.url.includes("analytics")) return;

    if (details.type === "media" || videoRegex.test(details.url)) {
      let urlObj = new URL(details.url);
      let segments = urlObj.pathname.split('/').filter(Boolean);
      let uniqueName = `video_${Date.now()}`;

      if (segments.length >= 2) {
        let quality = segments[segments.length - 1].split('.')[0]; 
        let id = segments[segments.length - 2]; 
        
        if (id !== 'gifs' && id !== 'v2' && id !== 'videos') {
          uniqueName = `${id}_${quality}_${Date.now()}`;
        } else {
          uniqueName = `${segments[segments.length - 1].split('.')[0]}_${Date.now()}`;
        }
      }

      let filename = `${uniqueName}.mp4`;

      lastDetectedVideo = {
        url: details.url,
        filename: decodeURIComponent(filename)
      };

      console.log("Unique Target Found:", filename);

      chrome.runtime.sendMessage({ action: "videoDetected", data: lastDetectedVideo }).catch(() => {});
    }
  },
  { urls: ["<all_urls>"] }
);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "getLastVideo") {
    sendResponse(lastDetectedVideo);
  } 
  if (message.action === "uploadToKoofr") {
    handleVideoProcessing(message.url, message.filename);
    sendResponse({ status: "Processing started" });
  }
});

async function handleVideoProcessing(videoUrl, filename) {
  if (videoUrl.includes('.m3u8')) {
    await downloadAndAssembleHLS(videoUrl, filename);
  } else {
    await uploadDirectFile(videoUrl, filename);
  }
}

// HLS Compiler
async function downloadAndAssembleHLS(playlistUrl, filename) {
  try {
    const response = await fetch(playlistUrl, { credentials: "include" });
    if (!response.ok) throw new Error("Server rejected request. Try reloading the video page.");
    const text = await response.text();

    const baseUrl = playlistUrl.substring(0, playlistUrl.lastIndexOf("/") + 1);
    const lines = text.split("\n");
    const segmentUrls = [];

    for (let line of lines) {
      line = line.trim();
      if (line && !line.startsWith("#")) {
        segmentUrls.push(line.startsWith("http") ? line : baseUrl + line);
      }
    }

    if (segmentUrls.length === 0) throw new Error("No video segments found.");
    
    const chunkBuffers = [];
    for (let i = 0; i < segmentUrls.length; i++) {
      const segResponse = await fetch(segmentUrls[i], { credentials: "include" });
      if (!segResponse.ok) throw new Error(`Chunk validation error at chunk ${i + 1}`);
      
      const buffer = await segResponse.arrayBuffer();
      chunkBuffers.push(buffer);

      let percent = Math.round(((i + 1) / segmentUrls.length) * 100);
      sendProgress("Downloading", percent, `Fetching segment ${i+1}/${segmentUrls.length}`);
    }

    const finalBlob = new Blob(chunkBuffers, { type: "video/mp4" });
    if (finalBlob.size === 0) throw new Error("Assembled binary structural asset is empty.");

    await uploadBlobToKoofr(finalBlob, filename);

  } catch (err) {
    sendProgress("Error", 0, err.message);
    showNotification("Process Faulted", err.message);
  }
}

// Direct Downloader
async function uploadDirectFile(videoUrl, filename) {
  try {
    sendProgress("Downloading", 10, "Fetching secured video data...");
    
    const response = await fetch(videoUrl, { 
      method: "GET",
      credentials: "include" 
    });
    
    if (!response.ok) throw new Error(`Server returned code ${response.status}. Link expired.`);
    
    const blob = await response.blob();
    if (blob.size === 0) throw new Error("Target file returned zero data bytes.");
    
    sendProgress("Downloading", 100, "Asset locked in memory.");
    await uploadBlobToKoofr(blob, filename);
  } catch (err) {
    sendProgress("Error", 0, err.message);
    showNotification("Direct Fetch Failed", err.message);
  }
}

// Fixed WebDAV Direct Uploader Engine
async function uploadBlobToKoofr(blob, filename) {
  const destinationUrl = `${KOOFR_WEBDAV_URL}${encodeURIComponent(filename)}`;
  sendProgress("Uploading to Cloud", 20, "Initiating handshake...");

  try {
    // We add an explicit Controller signal to catch unhandled platform timeouts
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 seconds timeout guard

    const uploadResponse = await fetch(destinationUrl, {
      method: "PUT",
      headers: {
        "Authorization": authHeader,
        "Content-Type": "video/mp4",
        "Content-Length": blob.size.toString() // Explicitly state package size to bypass proxy filters
      },
      body: blob,
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (uploadResponse.ok || uploadResponse.status === 201) {
      sendProgress("Uploading to Cloud", 100, "Finalized.");
      chrome.runtime.sendMessage({ action: "uploadComplete" }).catch(() => {});
      showNotification("Success!", `${filename} uploaded to Koofr.`);
    } else {
      throw new Error(`WebDAV Rejection Code: ${uploadResponse.status}`);
    }
  } catch (e) {
    let errorMsg = e.name === 'AbortError' ? "Upload timed out by network constraints." : e.message;
    sendProgress("Error", 0, errorMsg);
  }
}

function sendProgress(step, percent, statusMsg) {
  chrome.runtime.sendMessage({
    action: "uploadProgress",
    step: step,
    percent: percent,
    statusMsg: statusMsg
  }).catch(() => {});
}

function showNotification(title, message) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icon.png',
    title: title,
    message: message
  }).catch(() => {});
}
