document.addEventListener("DOMContentLoaded", () => {
  const statusDiv = document.getElementById("status");
  const videoInfo = document.getElementById("video-info");
  const filenameSpan = document.getElementById("filename");
  const uploadBtn = document.getElementById("upload-btn");
  const progressContainer = document.getElementById("progress-container");
  const progressBar = document.getElementById("progress-bar");
  const progressText = document.getElementById("progress-text");

  let activeVideo = null;

  chrome.runtime.sendMessage({ action: "getLastVideo" }, (response) => {
    if (response) displayVideo(response);
  });

  chrome.runtime.onMessage.addListener((message) => {
    if (message.action === "videoDetected") {
      displayVideo(message.data);
    }
    if (message.action === "uploadProgress") {
      progressContainer.style.display = "block";
      progressBar.style.width = `${message.percent}%`;
      progressText.innerText = `${message.step}: ${message.percent}%`;
      statusDiv.innerText = message.statusMsg || "Processing...";
    }
    if (message.action === "uploadComplete") {
      statusDiv.innerText = "Upload Complete!";
      uploadBtn.disabled = false;
      setTimeout(() => { progressContainer.style.display = "none"; }, 2000);
    }
  });

  function displayVideo(video) {
    activeVideo = video;
    statusDiv.innerText = "Video Stream Intercepted!";
    videoInfo.style.display = "block";
    filenameSpan.innerText = video.filename;
    uploadBtn.disabled = false;
  }

  uploadBtn.addEventListener("click", () => {
    if (activeVideo) {
      uploadBtn.disabled = true;
      progressContainer.style.display = "block";
      chrome.runtime.sendMessage({
        action: "uploadToKoofr",
        url: activeVideo.url,
        filename: activeVideo.filename
      });
    }
  });
});
