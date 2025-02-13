const { ipcRenderer } = require('electron');

ipcRenderer.on('init-progress', (event, data) => {
  const header = document.querySelector('h2');
  if (data.mode === 'uninstall') {
    header.textContent = 'Uninstalling mod...';
  } else {
    header.textContent = 'Installing mod...';
  }
});

ipcRenderer.on('progress-update', (event, data) => {
  const progressBar = document.getElementById('progressBar');
  const progressText = document.getElementById('progressText');
  progressBar.style.width = data.progress + '%';
  progressText.textContent = data.text + ' (' + data.progress + '%)';
});

ipcRenderer.on('progress-finished', (event, data) => {
  const progressText = document.getElementById('progressText');
  if (data.mode === 'uninstall') {
    progressText.textContent = 'Uninstallation completed.';
  } else {
    progressText.textContent = 'Installation completed.';
  }
});
