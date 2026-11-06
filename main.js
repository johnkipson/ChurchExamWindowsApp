const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const db = require('./src/apiClient');
const { safeFileBase, buildDocxBuffer, buildXlsxBuffer } = require('./src/exporters');

let mainWindow;

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 900,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.setMenuBarVisibility(false);
  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

ipcMain.handle('people:getAll', () => db.getAllPeople());
ipcMain.handle('people:add', (event, name) => db.addPerson(name));
ipcMain.handle('people:update', (event, id, name) => db.updatePerson(id, name));
ipcMain.handle('people:delete', (event, id) => db.deletePerson(id));
ipcMain.handle('exam:save', (event, payload) => db.saveExam(payload));

async function exportFile(buildBuffer, defaultExt, filters, payload) {
  const fname = safeFileBase(payload.title, payload.dateDisplay) + defaultExt;
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Save attendance file',
    defaultPath: fname,
    filters
  });
  if (canceled || !filePath) return { saved: false };
  const buffer = await buildBuffer(payload);
  fs.writeFileSync(filePath, buffer);
  return { saved: true, filePath };
}

ipcMain.handle('export:docx', (event, payload) =>
  exportFile(buildDocxBuffer, '.docx', [{ name: 'Word Document', extensions: ['docx'] }], payload)
);

ipcMain.handle('export:xlsx', (event, payload) =>
  exportFile(buildXlsxBuffer, '.xlsx', [{ name: 'Excel Workbook', extensions: ['xlsx'] }], payload)
);
