const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getAllPeople: () => ipcRenderer.invoke('people:getAll'),
  addPerson: (name) => ipcRenderer.invoke('people:add', name),
  updatePerson: (id, name) => ipcRenderer.invoke('people:update', id, name),
  deletePerson: (id) => ipcRenderer.invoke('people:delete', id),
  saveExam: (payload) => ipcRenderer.invoke('exam:save', payload),
  exportDocx: (payload) => ipcRenderer.invoke('export:docx', payload),
  exportXlsx: (payload) => ipcRenderer.invoke('export:xlsx', payload)
});
