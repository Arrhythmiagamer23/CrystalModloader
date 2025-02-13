
const { app, BrowserWindow, dialog, Menu, ipcMain, shell } = require('electron');
const fs = require('fs');
const fsExtra = require('fs-extra');
const path = require('path');
const AdmZip = require('adm-zip');

const configPath = path.join(app.getPath('userData'), 'config.json');

function createWindow() {
  let win = new BrowserWindow({
    width: 852,
    height: 610,
    resizable: false,
    title: "Rainbow Modloader",
    icon: path.join(__dirname, 'assets/rainbow_icon.ico'),
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

    const menuTemplate = [
      {
        label: 'Actions',
        submenu: [
          {
            label: 'Install mod',
            click: async (menuItem, browserWindow) => {
              await addMod(browserWindow);
            }
          },
          {
            label: 'Create mod',
            click: (menuItem, browserWindow) => {
              browserWindow.loadFile('create.html');
            }
          },
          { type: 'separator' },
          {
            label: 'Change path',
            click: (menuItem, browserWindow) => {
              browserWindow.loadFile('setup.html');
            }
          },
          { type: 'separator' },
          { role: 'quit' }
        ]
      },
      {
        label: 'Help',
        submenu: [
          {
              label: 'SMATRS Discord',
              click() {
                  shell.openExternal('https://discord.com/invite/GBXUa7NF2J');
              }
          },
          {
              label: 'Github repository',
              click() {
                  shell.openExternal('https://github.com/Yawk36/RainbowModloader');
              }
          }
        ]
      }
    ];
    const menu = Menu.buildFromTemplate(menuTemplate);
    Menu.setApplicationMenu(menu);

  if (fs.existsSync(configPath)) {
    win.loadFile('index.html');
  } else {
    win.loadFile('setup.html');
  }

ipcMain.on('uninstall-mod', async (event, modInfo) => {
    const mainWindow = BrowserWindow.getFocusedWindow();
    await uninstallModWithProgress(modInfo, mainWindow);
  });
  

 ipcMain.handle('select-folder', async (event) => {
    let result = await dialog.showOpenDialog({
        properties: ['openDirectory']
    });

    return result.canceled ? null : result.filePaths[0];
 });

 ipcMain.handle('select-file', async (event, options) => {
  const result = await dialog.showOpenDialog({ properties: ['openFile'], ...options });
  return result.canceled ? null : result.filePaths[0];
 });

 ipcMain.handle('save-file', async (event, options) => {
  const result = await dialog.showSaveDialog(options);
  return result.canceled ? null : result.filePath;
 });

 ipcMain.handle('get-user-data-path', async () => {
  return app.getPath('userData');
 });

  if (fs.existsSync(configPath)) {
    win.loadFile('index.html');
  } else {
    win.loadFile('setup.html');
  }
}

async function backupWorlds() {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const gamePath = config.gamePath;
    const worldsPath = path.join(gamePath, 'data', 'worlds');
    const backupPath = path.join(gamePath, 'backup', 'data', 'worlds');
  
    if (!fs.existsSync(backupPath)) {
      fsExtra.ensureDirSync(backupPath);
      try {
        await fsExtra.copy(worldsPath, backupPath);
        console.log('Backup made correctly.');
      } catch (err) {
        console.error('Error making backup:', err);
      }
    } else {
      console.log('Backup already exists.');
    }
  }
  
  async function checkModConflicts(newMod, mainWindow) {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const modsRegistryPath = path.join(config.gamePath, 'mods', 'mods.json');
    if (!fs.existsSync(modsRegistryPath)) return null;
  
    const modsRegistry = JSON.parse(fs.readFileSync(modsRegistryPath, 'utf8'));
    let conflictingMod = null;
  
    for (let mod of modsRegistry) {
      for (let file of newMod.fileList) {
        if (mod.fileList.includes(file)) {
          conflictingMod = mod;
          break;
        }
      }
      if (conflictingMod) break;
    }
  
    if (conflictingMod) {
      const choice = dialog.showMessageBoxSync(mainWindow, {
        type: 'warning',
        buttons: ['Cancel Installation', `Uninstall ${conflictingMod.modName} & Continue`],
        title: 'Mod Conflict Detected',
        message: `The mod "${newMod.modName}" conflicts with "${conflictingMod.modName}". What would you like to do?`
      });
  
      if (choice === 1) {
        await uninstallModWithProgress(conflictingMod, mainWindow);
        return false;
      } else {
        return true;
      }
    }
  
    return false;
  }
  
async function addMod(browserWindow) {
  await backupWorlds();

  const result = await dialog.showOpenDialog(browserWindow, {
    properties: ['openFile'],
    filters: [{ name: 'Rainbow Mods', extensions: ['rsm'] }]
  });
  if (result.canceled || result.filePaths.length === 0) {
    return;
  }
  const modFilePath = result.filePaths[0];

  try {
    const modInfo = processModFile(modFilePath);

    saveModRegistry(modInfo);

    browserWindow.webContents.send('mod-added', modInfo);

    await installModWithProgress(modInfo, browserWindow);
  } catch (err) {
    dialog.showErrorBox('Error adding the mod', err.message);
  }
}

async function uninstallModWithProgress(modInfo, mainWindow) {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const totalFiles = modInfo.fileList.length;
    let completedFiles = 0;
  
    let progressWindow = new BrowserWindow({
      width: 610,
      height: 610,
      parent: mainWindow,
      modal: true,
      show: false,
      webPreferences: { nodeIntegration: true, contextIsolation: false }
    });
    progressWindow.loadFile('progress.html');
    progressWindow.once('ready-to-show', () => {
      progressWindow.webContents.send('init-progress', { mode: 'uninstall' });
      progressWindow.show();
    });
  
    for (let i = 0; i < totalFiles; i++) {
      let relativeFilePath = modInfo.fileList[i];
      let targetPath = path.join(config.gamePath, relativeFilePath);
  
      try {
        if (fs.existsSync(targetPath)) {
          fs.unlinkSync(targetPath);
        }
      } catch (err) {
        console.error(`Error deleting file ${relativeFilePath}: `, err);
      }
  
      completedFiles++;
      let progress = Math.round((completedFiles / (totalFiles * 2)) * 100);
      progressWindow.webContents.send('progress-update', { progress, text: `Deleting: ${relativeFilePath}` });
    }
  
    for (let i = 0; i < totalFiles; i++) {
      let relativeFilePath = modInfo.fileList[i];
  
      let backupRelativePath = relativeFilePath.replace(/^data\/worlds\//, '');
      
      let backupFilePath = path.join(config.gamePath, 'backup', backupRelativePath);
      let targetPath = path.join(config.gamePath, relativeFilePath);
  
      try {
        if (fs.existsSync(backupFilePath)) {
          fsExtra.ensureDirSync(path.dirname(targetPath));
          await fsExtra.copy(backupFilePath, targetPath, { overwrite: true });
        }
      } catch (err) {
        console.error(`Error restoring file ${relativeFilePath} from backup: `, err);
      }
  
      completedFiles++;
      let progress = Math.round((completedFiles / (totalFiles * 2)) * 100);
      progressWindow.webContents.send('progress-update', { progress, text: `Restoring: ${relativeFilePath}` });
    }
  
    try {
      fsExtra.removeSync(modInfo.modDir);
    } catch (err) {
      console.error(`Error removing mod folder: `, err);
    }
  
    const modsRegistryPath = path.join(config.gamePath, 'mods', 'mods.json');
    if (fs.existsSync(modsRegistryPath)) {
      let modsRegistry = JSON.parse(fs.readFileSync(modsRegistryPath, 'utf8'));
      modsRegistry = modsRegistry.filter(mod => mod.modName !== modInfo.modName);
      fs.writeFileSync(modsRegistryPath, JSON.stringify(modsRegistry, null, 2));
    }
  
    progressWindow.webContents.send('progress-finished', { mode: 'uninstall' });
    setTimeout(() => {
      progressWindow.close();
      mainWindow.loadFile('index.html');
    }, 1000);
  }
  

function processModFile(modFilePath) {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const zip = new AdmZip(modFilePath);
  const zipEntries = zip.getEntries();

  const dataJsonEntry = zipEntries.find(entry => entry.entryName === 'data.json');
  if (!dataJsonEntry) {
    throw new Error('data.json not found in the mod.');
  }
  const modData = JSON.parse(dataJsonEntry.getData().toString('utf8'));
  const modName = modData.name || path.basename(modFilePath, '.rsm');
  const modVersion = modData.version || '1.0';
  const modAuthor = modData.author || 'Unknown';
  const modGame = modData.game || 'Unknown';

  const modsDir = path.join(config.gamePath, 'mods');
  fsExtra.ensureDirSync(modsDir);
  const modDir = path.join(modsDir, modName);
  fsExtra.ensureDirSync(modDir);

  const iconEntry = zipEntries.find(entry => entry.entryName === 'icon.png');
  if (!iconEntry) {
    throw new Error('icon.png not found in the mod.');
  }
  const iconOutputPath = path.join(modDir, 'icon.png');
  fs.writeFileSync(iconOutputPath, iconEntry.getData());

  const dataOutputDir = path.join(modDir, 'data');
  fsExtra.ensureDirSync(dataOutputDir);
  zipEntries.forEach(entry => {
    if (entry.entryName.startsWith('data/')) {
      const relativePath = entry.entryName.substring('data/'.length);
      const fullOutputPath = path.join(dataOutputDir, relativePath);
      if (entry.isDirectory) {
        fsExtra.ensureDirSync(fullOutputPath);
      } else {
        fsExtra.ensureDirSync(path.dirname(fullOutputPath));
        fs.writeFileSync(fullOutputPath, entry.getData());
      }
    }
  });

  let fileList = [];
  function traverseDirectory(dir, relativeBase) {
    const items = fs.readdirSync(dir);
    items.forEach(item => {
      const fullPath = path.join(dir, item);
      const stats = fs.statSync(fullPath);
      if (stats.isDirectory()) {
        traverseDirectory(fullPath, path.join(relativeBase, item));
      } else {
        fileList.push(path.join(relativeBase, item));
      }
    });
  }
  traverseDirectory(dataOutputDir, 'data');

  return {
    modName,
    modVersion,
    modAuthor,
    modGame,
    icon: iconOutputPath,
    modDir,
    fileList,
    modFilePath
  };
}

function saveModRegistry(modInfo) {
   const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const modsRegistryPath = path.join(config.gamePath, 'mods', 'mods.json');
  let modsRegistry = [];
  if (fs.existsSync(modsRegistryPath)) {
    modsRegistry = JSON.parse(fs.readFileSync(modsRegistryPath, 'utf8'));
  }
  modsRegistry.push(modInfo);
  fs.writeFileSync(modsRegistryPath, JSON.stringify(modsRegistry, null, 2));
}
async function installModWithProgress(modInfo, mainWindow) {
  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

  const modsRegistryPath = path.join(config.gamePath, 'mods', 'mods.json');
  let installedMods = [];
  if (fs.existsSync(modsRegistryPath)) {
    try {
      installedMods = JSON.parse(fs.readFileSync(modsRegistryPath, 'utf8'));
    } catch (err) {
      console.error("Error reading mods registry:", err);
    }
  }

  let conflictingMods = new Set();
  for (let installedMod of installedMods) {
    if (installedMod.modName === modInfo.modName) continue;
    for (let file of modInfo.fileList) {
      if (installedMod.fileList && installedMod.fileList.includes(file)) {
        conflictingMods.add(installedMod.modName);
      }
    }
  }

  if (conflictingMods.size > 0) {
    let conflictsArray = Array.from(conflictingMods);
    let message = `The mod "${modInfo.modName}" conflicts with the following installed mod(s):\n\n`;
    message += conflictsArray.join(', ');
    message += `\n\nDo you want to uninstall the conflicting mods and continue installation, or cancel the installation of the new mod?`;

    let response = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      buttons: ['Cancel Installation', 'Uninstall Conflicting Mods and Continue'],
      defaultId: 0,
      title: 'Mod Conflict Detected',
      message: message
    });

    if (response.response === 0) {
      console.log('Installation cancelled due to conflict.');
      return;
    } else {
      for (let conflictModName of conflictsArray) {
        let conflictModInfo = installedMods.find(mod => mod.modName === conflictModName);
        if (conflictModInfo) {
          console.log(`Uninstalling conflicting mod: ${conflictModName}`);
          await uninstallModWithProgress(conflictModInfo, mainWindow);
          if (fs.existsSync(modsRegistryPath)) {
            try {
              installedMods = JSON.parse(fs.readFileSync(modsRegistryPath, 'utf8'));
            } catch (err) {
              console.error("Error re-reading mods registry:", err);
            }
          }
        }
      }
    }
  }

  const totalFiles = modInfo.fileList.length;
  let completedFiles = 0;

  let progressWindow = new BrowserWindow({
    width: 610,
    height: 610,
    parent: mainWindow,
    modal: true,
    show: false,
    webPreferences: { nodeIntegration: true, contextIsolation: false }
  });
  progressWindow.loadFile('progress.html');
  progressWindow.once('ready-to-show', () => {
    progressWindow.show();
  });

  for (let i = 0; i < totalFiles; i++) {
    let relativeFilePath = modInfo.fileList[i];
    let sourcePath = path.join(modInfo.modDir, relativeFilePath);
    let targetPath = path.join(config.gamePath, relativeFilePath);
    fsExtra.ensureDirSync(path.dirname(targetPath));
    try {
      await fsExtra.copy(sourcePath, targetPath, { overwrite: true });
    } catch (err) {
      console.error(`Error copying ${relativeFilePath}: `, err);
    }
    completedFiles++;
    let progress = Math.round((completedFiles / totalFiles) * 100);
    progressWindow.webContents.send('progress-update', { progress, text: `Copying: ${relativeFilePath}` });
  }

  progressWindow.webContents.send('progress-finished');
  setTimeout(() => {
    progressWindow.close();
    mainWindow.loadFile('index.html');
  }, 1000);
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

