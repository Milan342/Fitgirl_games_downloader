// Page Navigation System
let currentPage = "input";

function showPage(pageId) {
  // Hide all pages
  const pages = document.querySelectorAll(".page");
  pages.forEach((page) => {
    page.classList.remove("active");
  });

  // Remove active class from all nav buttons
  const navButtons = document.querySelectorAll(".nav-btn");
  navButtons.forEach((btn) => {
    btn.classList.remove("active");
  });

  // Show selected page
  document.getElementById(pageId + "Page").classList.add("active");

  // Update active nav button
  const activeBtn = document.querySelector(`[onclick="showPage('${pageId}')"]`);
  if (activeBtn) {
    activeBtn.classList.add("active");
  }

  currentPage = pageId;
}

function enableNavigation(pageId) {
  const navBtn = document.getElementById(pageId + "NavBtn");
  if (navBtn) {
    navBtn.disabled = false;
  }
}

function startNewSession() {
  // Reset all variables
  currentJobId = null;
  allResults = [];
  autoOpenInterval = null;
  countdownInterval = null;
  isAutoOpening = false;
  isPaused = false;
  currentLinkIndex = 0;

  // Reset form
  clearForm();

  // Reset navigation
  document.getElementById("progressNavBtn").disabled = true;
  document.getElementById("resultsNavBtn").disabled = true;
  document.getElementById("autoopenNavBtn").disabled = true;

  // Go to input page
  showPage("input");
}

// Global variables
let currentJobId = null;
let allResults = [];
let autoOpenInterval = null;
let countdownInterval = null;
let isAutoOpening = false;
let isPaused = false;
let currentLinkIndex = 0;
let delaySeconds = 60;

// Initialize when DOM is loaded
document.addEventListener("DOMContentLoaded", function () {
  document.getElementById("linkForm").addEventListener("submit", function (e) {
    e.preventDefault();
    startProcessing();
  });

  // Timer controls
  const delaySlider = document.getElementById("delaySlider");
  const delayValueSpan = document.getElementById("delayValue");

  delaySlider.addEventListener("input", function () {
    delaySeconds = parseInt(this.value);
    delayValueSpan.textContent = delaySeconds;
  });

  document
    .getElementById("startAutoOpenBtn")
    .addEventListener("click", startAutoOpen);
  document
    .getElementById("pauseAutoOpenBtn")
    .addEventListener("click", pauseAutoOpen);
  document
    .getElementById("stopAutoOpenBtn")
    .addEventListener("click", stopAutoOpen);
});

async function startProcessing() {
  const formData = new FormData(document.getElementById("linkForm"));

  try {
    // Navigate to progress page and enable its navigation
    enableNavigation("progress");
    showPage("progress");

    const response = await fetch("/process", {
      method: "POST",
      body: formData,
    });

    const data = await response.json();

    if (data.error) {
      alert(data.error);
      return;
    }

    currentJobId = data.job_id;
    startStatusUpdates();
  } catch (error) {
    alert("Error starting processing: " + error.message);
  }
}

function startStatusUpdates() {
  const eventSource = new EventSource(`/status/${currentJobId}`);

  eventSource.onmessage = function (event) {
    const data = JSON.parse(event.data);

    if (data.error) {
      alert(data.error);
      eventSource.close();
      return;
    }

    updateProgress(data);

    if (data.status === "completed") {
      eventSource.close();
      showResults(data);
    }
  };

  eventSource.onerror = function () {
    console.error("EventSource failed");
    eventSource.close();
  };
}

function updateProgress(data) {
  const percentage =
    data.total > 0 ? Math.round((data.processed / data.total) * 100) : 0;

  document.getElementById("progressFill").style.width = percentage + "%";
  document.getElementById("progressText").textContent =
    `Processing ${data.processed}/${data.total} links (${percentage}%)`;

  // Add new messages
  const logContainer = document.getElementById("logContainer");
  data.messages.forEach((message) => {
    const div = document.createElement("div");
    div.className = "log-message";

    if (message.includes("✓")) {
      div.className += " log-success";
    } else if (message.includes("✗") || message.includes("Error")) {
      div.className += " log-error";
    } else {
      div.className += " log-info";
    }

    div.textContent = message;
    logContainer.appendChild(div);
  });

  logContainer.scrollTop = logContainer.scrollHeight;
}

function showResults(data) {
  allResults = data.results || [];
  currentLinkIndex = 0; // Reset for auto-open

  // Navigate to results page and enable its navigation
  enableNavigation("results");
  if (allResults.length > 0) {
    enableNavigation("autoopen");
  }
  showPage("results");

  // Update summary
  document.getElementById("successCount").textContent = data.results_count || 0;
  document.getElementById("errorCount").textContent = data.errors_count || 0;
  document.getElementById("totalCount").textContent = data.total || 0;

  // Show results
  const resultsList = document.getElementById("resultsList");
  resultsList.innerHTML = "";

  // Successful results with better organization
  if (allResults.length > 0) {
    const successHeader = document.createElement("div");
    successHeader.style.cssText =
      "background: #1e1e2e; padding: 15px; margin-bottom: 10px; border-radius: 8px; border-left: 4px solid #28a745; font-weight: bold; color: #28a745;";
    successHeader.textContent = `✅ Successfully Extracted Links (${allResults.length})`;
    resultsList.appendChild(successHeader);

    allResults.forEach((result, index) => {
      const div = document.createElement("div");
      div.className = "result-item success";
      div.style.position = "relative";
      div.innerHTML = `
                <div class="original-url">📄 Source #${index + 1}: ${result.original}</div>
                <div class="download-url success">
                    <a href="${result.download_url}" target="_blank">${result.download_url}</a>
                    <button onclick="openSingleLink('${result.download_url}')" style="float: right; background: #28a745; color: white; border: none; padding: 5px 10px; border-radius: 5px; cursor: pointer; margin-left: 10px;">Open</button>
                </div>
            `;
      resultsList.appendChild(div);
    });
  }

  // Errors with better organization
  if (data.errors && data.errors.length > 0) {
    const errorHeader = document.createElement("div");
    errorHeader.style.cssText =
      "background: #1e1e2e; padding: 15px; margin: 20px 0 10px 0; border-radius: 8px; border-left: 4px solid #dc3545; font-weight: bold; color: #dc3545;";
    errorHeader.textContent = `❌ Failed Extractions (${data.errors.length})`;
    resultsList.appendChild(errorHeader);

    data.errors.forEach((error, index) => {
      const div = document.createElement("div");
      div.className = "result-item error";
      div.innerHTML = `
                <div class="original-url">📄 Failed #${index + 1}: ${error.original}</div>
                <div class="download-url error">❌ ${error.error}</div>
            `;
      resultsList.appendChild(div);
    });
  }
}

function clearForm() {
  document.getElementById("linkForm").reset();
}

function downloadResults() {
  if (allResults.length === 0) {
    alert("No successful results to download");
    return;
  }

  const content = allResults.map((result) => result.download_url).join("\n");
  const blob = new Blob([content], { type: "text/plain" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `fitgirl_download_links_${new Date().getTime()}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Auto-Open Functions
function startAutoOpen() {
  if (allResults.length === 0) {
    alert("No links to open!");
    return;
  }

  isAutoOpening = true;
  isPaused = false;

  // Update UI
  document.getElementById("startAutoOpenBtn").style.display = "none";
  document.getElementById("pauseAutoOpenBtn").style.display = "inline-flex";
  document.getElementById("stopAutoOpenBtn").style.display = "inline-flex";
  document.getElementById("autoOpenStatus").style.display = "block";

  updateAutoOpenStatus("Starting auto-open...");

  // Start the auto-open process
  openNextLink();
}

function pauseAutoOpen() {
  isPaused = !isPaused;
  const pauseBtn = document.getElementById("pauseAutoOpenBtn");

  if (isPaused) {
    clearInterval(autoOpenInterval);
    clearInterval(countdownInterval);
    pauseBtn.innerHTML = "▶️ Resume";
    updateAutoOpenStatus("Paused");
    document.getElementById("countdown").textContent = "--";
  } else {
    pauseBtn.innerHTML = "⏸️ Pause";
    updateAutoOpenStatus("Resumed");
    openNextLink();
  }
}

function stopAutoOpen() {
  isAutoOpening = false;
  isPaused = false;
  clearInterval(autoOpenInterval);
  clearInterval(countdownInterval);

  // Reset UI
  document.getElementById("startAutoOpenBtn").style.display = "inline-flex";
  document.getElementById("pauseAutoOpenBtn").style.display = "none";
  document.getElementById("stopAutoOpenBtn").style.display = "none";
  document.getElementById("pauseAutoOpenBtn").innerHTML = "⏸️ Pause";

  updateAutoOpenStatus("Stopped");
  document.getElementById("countdown").textContent = "--";
  document.getElementById("currentLinkText").textContent = "None";
}

function openNextLink() {
  if (!isAutoOpening || isPaused || currentLinkIndex >= allResults.length) {
    if (currentLinkIndex >= allResults.length) {
      updateAutoOpenStatus("All links opened!");
      stopAutoOpen();
    }
    return;
  }

  const currentResult = allResults[currentLinkIndex];

  // Open the link
  window.open(currentResult.download_url, "_blank");

  // Update status
  updateAutoOpenStatus(
    `Opened link ${currentLinkIndex + 1} of ${allResults.length}`,
  );
  document.getElementById("currentLinkText").textContent =
    currentResult.download_url;

  currentLinkIndex++;

  // If there are more links, set up the timer for the next one
  if (currentLinkIndex < allResults.length && isAutoOpening) {
    startCountdown();
  } else {
    updateAutoOpenStatus("All links opened!");
    stopAutoOpen();
  }
}

function startCountdown() {
  let timeLeft = delaySeconds;
  document.getElementById("countdown").textContent = timeLeft;

  countdownInterval = setInterval(() => {
    timeLeft--;
    document.getElementById("countdown").textContent = timeLeft;

    if (timeLeft <= 0) {
      clearInterval(countdownInterval);
      if (isAutoOpening && !isPaused) {
        openNextLink();
      }
    }
  }, 1000);
}

function updateAutoOpenStatus(status) {
  document.getElementById("statusText").textContent = status;
  document.getElementById("linkProgress").textContent =
    `${currentLinkIndex} / ${allResults.length}`;
}

function openSingleLink(url) {
  window.open(url, "_blank");
}
