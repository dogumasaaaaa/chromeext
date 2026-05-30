// Hardcoded Credentials
const KOOFR_EMAIL = "lo.t.st.upidk.aely@gmail.com";
const KOOFR_PASS = "2eio48c7cr7akj6b"; 
const KOOFR_WEBDAV_URL = "https://app.koofr.net/dav/Koofr";

const authHeader = "Basic " + btoa(KOOFR_EMAIL + ":" + KOOFR_PASS);
let lastDetectedVideo = null;

// Catch both direct video files AND m3u8 streaming playlist manifests
const videoRegex = /\.(mp4|mkv|webm|mov|avi|m3u8)(\?.*)?$/i;

chrome.webRequest.onBeforeRequest.addListener(
  function(details) {
    if (details.initiator && details.initiator.includes(chrome.runtime.id)) return;

    // Filter out obvious advertisement domain patterns to avoid picking up ads
    if (details.url.includes("ads") || details.url.includes("popunder") || details.url.includes("analytics")) return;

    if (details.type === "media" || videoRegex.test(details.url)) {
      let urlObj = new URL(details.url);
      
      // Determine a proper filename
      let filename = urlObj.pathname.split('/').pop().split('?')[0] || `video_${Date.now()}`;
      
      // If it's an m3u8 playlist, change the save extension to .mp4 for storage
      if (filename.endsWith('.m3u8')) {
        filename = filename.replace('.m3u8', '.mp4');
      } else if (!filename.includes('.')) {
        filename += '.mp4';
      }

      lastDetectedVideo = {
        url: details.url,
        filename: decodeURIComponent(filename)
      };

      console.log("Target Found:", details.url);

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
    sendResponse({ status: "Processing..." });
  }
});

// Route the execution based on whether it is a standard video link or an HLS playlist
async function handleVideoProcessing(videoUrl, filename) {
  if (videoUrl.includes('.m3u8')) {
    console.log("HLS stream detected. Starting segment compilation...");
    await downloadAndAssembleHLS(videoUrl, filename);
  } else {
    console.log("Direct file stream detected. Processing direct upload...");
    await uploadDirectFile(videoUrl, filename);
  }
}

// HLS Stream Assembler Engine
async function downloadAndAssembleHLS(playlistUrl, filename) {
  try {
    // 1. Fetch the text manifest file
    const response = await fetch(playlistUrl);
    if (!response.ok) throw new Error("Failed to grab stream playlist data.");
    const text = await response.text();

    // 2. Parse out the segment links
    const baseUrl = playlistUrl.substring(0, playlistUrl.lastIndexOf("/") + 1);
    const lines = text.split("\n");
    const segmentUrls = [];

    for (let line of lines) {
      line = line.trim();
      if (line && !line.startsWith("#")) {
        // Construct absolute URLs for segments if they are relative paths
        if (line.startsWith("http://") || line.startsWith("https://")) {
          segmentUrls.push(line);
        } else {
          segmentUrls.push(baseUrl + line);
        }
      }
    }

    if (segmentUrls.length === 0) throw new Error("No video data payload sections found in manifest.");
    console.log(`Compiling ${segmentUrls.length} video chunks...`);

    // 3. Sequentially download every binary segment chunk
    const chunkBuffers = [];
    for (let i = 0; i < segmentUrls.length; i++) {
      console.log(`Downloading chunk ${i + 1}/${segmentUrls.length}`);
      const segResponse = await fetch(segmentUrls[i]);
      if (segResponse.ok) {
        const buffer = await segResponse.arrayBuffer();
        chunkBuffers.push(buffer);
      }
    }

    // 4. Merge all arrays into one cohesive binary video blob
    const finalBlob = new Blob(chunkBuffers, { type: "video/mp4" });
    console.log("Video compilation successful. Pushing to Koofr...");
    
    await uploadBlobToKoofr(finalBlob, filename);

  } catch (err) {
    console.error("HLS compilation routine encountered an issue:", err);
    showNotification("Compilation Failed", err.message);
  }
}

// Standard file downloader handler
async function uploadDirectFile(videoUrl, filename) {
  try {
    const response = await fetch(videoUrl);
    if (!response.ok) throw new Error("Resource unreachable.");
    const blob = await response.blob();
    await uploadBlobToKoofr(blob, filename);
  } catch (err) {
    console.error(err);
    showNotification("Direct Upload Failed", err.message);
  }
}

// Pushes completed chunks/blobs up to Koofr root
async function uploadBlobToKoofr(blob, filename) {
  const destinationUrl = `${KOOFR_WEBDAV_URL}/${encodeURIComponent(filename)}`;
  
  const uploadResponse = await fetch(destinationUrl, {
    method: "PUT",
    headers: {
      "Authorization": authHeader,
      "Content-Type": "video/mp4"
    },
    body: blob
  });

  if (uploadResponse.ok || uploadResponse.status === 201) {
    showNotification("Success!", `${filename} compiled and sent to Koofr.`);
  } else {
    showNotification("WebDAV Rejection", `Server status response code: ${uploadResponse.status}`);
  }
}

function showNotification(title, message) {
  chrome.notifications.create({
    type: 'basic',
    iconUrl: 'icon.png',
    title: title,
    message: message
  }).catch(() => {});
}
