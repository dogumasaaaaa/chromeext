const DEFAULT_CREDS = {
  email: "lo.t.st.upidk.aely@gmail.com",
  appPass: "2eio48c7cr7akj6b"
};

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.local.get(["email", "appPass"], (result) => {
    if (!result.email || !result.appPass) {
      chrome.storage.local.set(DEFAULT_CREDS);
    }
  });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "UPLOAD_TO_WEBDAV") {
    handleStreamProcessing(message.videoUrl)
      .then((data) => sendResponse({ success: true, fileName: data.fileName }))
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true; 
  }
});

async function handleStreamProcessing(targetUrl) {
  const creds = await chrome.storage.local.get(["email", "appPass"]);
  const email = creds.email || DEFAULT_CREDS.email;
  const pass = creds.appPass || DEFAULT_CREDS.appPass;
  
  const randomString = Math.random().toString(36).substring(2, 10);
  const fileName = `stream_${randomString}.mp4`;
  const webdavUrl = `https://app.koofr.net/dav/Koofr/${fileName}`;
  const authHeader = "Basic " + btoa(email + ":" + pass);

  let finalBlob;

  // Case 1: The URL is an M3U8 streaming playlist
  if (targetUrl.includes(".m3u8")) {
    const playlistResponse = await fetch(targetUrl);
    if (!playlistResponse.ok) throw new Error("Failed to download the .m3u8 index playlist.");
    const playlistText = await playlistResponse.text();

    // Parse the lines to extract segment paths
    const lines = playlistText.split("\n");
    const segmentUrls = [];
    
    // Resolve relative segment paths based on the master playlist's base directory
    const urlObj = new URL(targetUrl);
    const baseUrl = urlObj.href.substring(0, urlObj.href.lastIndexOf("/") + 1);

    for (let line of lines) {
      line = line.trim();
      if (line && !line.startsWith("#")) {
        if (line.startsWith("http://") || line.startsWith("https://")) {
          segmentUrls.push(line);
        } else {
          segmentUrls.push(baseUrl + line);
        }
      }
    }

    if (segmentUrls.length === 0) throw new Error("No video data segments found inside this M3U8 file.");

    // Download each segment and accumulate the raw video chunks
    const chunkBuffers = [];
    for (let i = 0; i < segmentUrls.length; i++) {
      const segmentRes = await fetch(segmentUrls[i]);
      if (segmentRes.ok) {
        const buffer = await segmentRes.arrayBuffer();
        chunkBuffers.push(buffer);
      }
    }

    finalBlob = new Blob(chunkBuffers, { type: "video/mp4" });
  } 
  // Case 2: Standard standalone video format file (.mp4, etc.)
  else {
    const response = await fetch(targetUrl);
    if (!response.ok) throw new Error(`Target file source unreachable (Status ${response.status})`);
    finalBlob = await response.blob();
  }

  // Ship the consolidated binary file to Koofr
  const uploadResponse = await fetch(webdavUrl, {
    method: "PUT",
    headers: {
      "Authorization": authHeader,
      "Content-Type": "video/mp4"
    },
    body: finalBlob
  });

  if (!uploadResponse.ok) {
    throw new Error(`Koofr server rejected upload with status code: ${uploadResponse.status}`);
  }

  return { fileName };
}
