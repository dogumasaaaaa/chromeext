document.addEventListener("DOMContentLoaded", () => {
  const statusDiv = document.getElementById("status");
  const videoInfo = document.getElementById("video-info");
  const filenameSpan = document.getElementById("filename");
  const uploadBtn = document.getElementById("upload-btn");

  let activeVideo = null;

  // Ask background script for the latest intercepted video
  chrome.runtime.sendMessage({ action: "getLastVideo" }, (response) => {
    if (response) {
      displayVideo(response);
    }
  });

  // Listen for real-time updates if the user keeps the popup open while a video plays
  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === "videoDetected") {
      displayVideo(message.data);
    }
  });

  function displayVideo(video) {
    activeVideo = video;
    statusDiv.innerText = "Video Stream Captured!";
    videoInfo.style.display = "block";
    filenameSpan.innerText = video.filename;
    uploadBtn.disabled = false;
  }

  uploadBtn.addEventListener("click", () => {
    if (activeVideo) {
      statusDiv.innerText = "Uploading straight to Koofr... you can close this popup.";
      uploadBtn.disabled = true;
      chrome.runtime.sendMessage({
        action: "uploadToKoofr",
        url: activeVideo.url,
        filename: activeVideo.filename
      });
    }
  });
});
