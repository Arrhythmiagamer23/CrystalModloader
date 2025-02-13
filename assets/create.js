const { ipcRenderer } = require('electron');
const path = require('path');
const fs = require('fs');
const fsExtra = require('fs-extra');
const AdmZip = require('adm-zip');

let iconFilePath = null;
let dataFolderPath = null;

document.getElementById('selectIconButton').addEventListener('click', async () => {
  let filePath = await ipcRenderer.invoke('select-file', {
    filters: [{ name: 'PNG Image', extensions: ['png'] }]
  });
  if (filePath) {
    iconFilePath = filePath;
    const preview = document.getElementById('iconPreview');
    preview.src = filePath;
    preview.style.display = 'block';
  }
});

document.getElementById('selectDataFolderButton').addEventListener('click', async () => {
  let folderPath = await ipcRenderer.invoke('select-folder');
  if (folderPath) {
    dataFolderPath = folderPath;
    document.getElementById('dataFolderPath').textContent = folderPath;
  }
});

document.getElementById('createModButton').addEventListener('click', async () => {
  const modName = document.getElementById('modName').value.trim();
  const modAuthor = document.getElementById('modAuthor').value.trim();
  const modVersion = document.getElementById('modVersion').value.trim();
  const modGame = document.getElementById('modGame').value.trim();
  
  if (!iconFilePath) {
    alert("Please select an icon (PNG).");
    return;
  }
  if (!modName || !modAuthor || !modVersion || !modGame) {
    alert("Please fill in all mod information.");
    return;
  }
  if (!dataFolderPath) {
    alert("Please select the data folder.");
    return;
  }
  
  const defaultFileName = modName + '.rsm';
  let savePath = await ipcRenderer.invoke('save-file', {
    title: 'Save Mod File',
    defaultPath: defaultFileName,
    filters: [{ name: 'Rainbow Mod', extensions: ['rsm'] }]
  });
  if (!savePath) {
    alert("No save location selected. Aborting.");
    return;
  }
  
  try {
    const zip = new AdmZip();
    
    const iconData = fs.readFileSync(iconFilePath);
    zip.addFile("icon.png", iconData);
    
    const dataJson = {
      name: modName,
      author: modAuthor,
      version: modVersion,
      game: modGame
    };
    zip.addFile("data.json", Buffer.from(JSON.stringify(dataJson, null, 2), "utf-8"));
    
    function addFolderToZip(folderPath, zipFolderPath) {
      const items = fs.readdirSync(folderPath);
      items.forEach(item => {
        const fullPath = path.join(folderPath, item);
        const stats = fs.statSync(fullPath);
        if (stats.isDirectory()) {
          const folderEntry = path.join(zipFolderPath, item) + "/";
          zip.addFile(folderEntry, Buffer.alloc(0));
          addFolderToZip(fullPath, path.join(zipFolderPath, item));
        } else {
          const fileData = fs.readFileSync(fullPath);
          const filePathInZip = path.join(zipFolderPath, item);
          zip.addFile(filePathInZip, fileData);
        }
      });
    }
    addFolderToZip(dataFolderPath, "data");
    
    zip.writeZip(savePath);
    
    alert("Mod created successfully!");
    window.location.href = "index.html";
  } catch (error) {
    alert("Error creating mod file: " + error.message);
  }
});
