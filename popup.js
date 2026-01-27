/**
 * FC26 SBC Solver - Popup Script
 */

document.addEventListener("DOMContentLoaded", function () {
  // Open EA FC Web App button
  const openWebAppBtn = document.getElementById("openWebApp");
  if (openWebAppBtn) {
    openWebAppBtn.addEventListener("click", function () {
      chrome.tabs.create({
        url: "https://www.ea.com/fifa/ultimate-team/web-app/",
      });
    });
  }
});
