const fs = require('fs');
const path = require('path');
const { ipcRenderer } = require('electron');

async function loadMods() {
  const userDataPath = await ipcRenderer.invoke('get-user-data-path');
  const configPath = path.join(userDataPath, 'config.json');

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const modListContainer = document.getElementById('modListContainer');
  const modsRegistryPath = path.join(config.gamePath, 'mods', 'mods.json');

  let mods = [];
  if (fs.existsSync(modsRegistryPath)) {
    try {
      mods = JSON.parse(fs.readFileSync(modsRegistryPath, 'utf8'));
    } catch (error) {
      console.error("Error reading mods registry:", error);
    }
  }

  if (mods.length === 0) {
    modListContainer.innerHTML = "<p>No mods installed yet.</p>";
    return;
  }

  mods.forEach(mod => {
    const modItem = document.createElement('div');
    modItem.classList.add('modItem');

    const modIcon = document.createElement('img');
    modIcon.classList.add('modIcon');
    modIcon.src = mod.icon;
    modIcon.alt = mod.modName;
    modItem.appendChild(modIcon);

    const modDetails = document.createElement('div');
    modDetails.classList.add('modDetails');

    const modName = document.createElement('h3');
    modName.textContent = mod.modName;
    modDetails.appendChild(modName);

    const modInfo = document.createElement('p');
    modInfo.textContent = `Author: ${mod.modAuthor} | Version: ${mod.modVersion}`;
    modDetails.appendChild(modInfo);

    const modCompatible = document.createElement('p');
    modCompatible.classList.add('modCompatible');
    modCompatible.textContent = `Compatible: ${mod.modGame}`;
    modDetails.appendChild(modCompatible);

    modItem.appendChild(modDetails);

    const deleteButton = document.createElement('button');
    deleteButton.classList.add('deleteButton');
    deleteButton.textContent = 'Uninstall';
    deleteButton.addEventListener('click', () => {
        console.log(`Uninstall mod: ${mod.modName}`);
        ipcRenderer.send('uninstall-mod', mod);
    });
    modItem.appendChild(deleteButton);

    modListContainer.appendChild(modItem);
  });
}

window.addEventListener('DOMContentLoaded', () => {
  loadMods();
});
