const { ipcRenderer } = require('electron');
const fs = require('fs');
const path = require('path');

document.getElementById('chooseFolder').addEventListener('click', async () => {
    let userDataPath = await ipcRenderer.invoke('get-user-data-path');
    let selectedPath = await ipcRenderer.invoke('select-folder');

    if (selectedPath) {
        let configPath = path.join(userDataPath, 'config.json');
        fs.writeFileSync(configPath, JSON.stringify({ gamePath: selectedPath }, null, 2));

        window.location.href = "index.html";
    }
});
