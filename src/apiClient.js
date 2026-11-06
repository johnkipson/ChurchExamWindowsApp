// Talks to the hosted Express API instead of a local SQLite file.
// Settings come from config.json in the project root.
const path = require('path');
const fs = require('fs');

const configPath = path.join(__dirname, '..', 'config.json');
let config = { apiUrl: 'http://localhost:3000', apiKey: '' };
if (fs.existsSync(configPath)) {
  config = { ...config, ...JSON.parse(fs.readFileSync(configPath, 'utf8')) };
}
const BASE = config.apiUrl.replace(/\/+$/, '');

// Free hosts sleep when idle and can take ~60s to wake, so allow a long timeout.
async function request(method, urlPath, body) {
  const res = await fetch(BASE + urlPath, {
    method,
    headers: { 'content-type': 'application/json', 'x-api-key': config.apiKey },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(90000)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Server returned ${res.status}`);
  return data;
}

module.exports = {
  getAllPeople: () => request('GET', '/people'),
  addPerson: (name) => request('POST', '/people', { name }),
  updatePerson: (id, name) => request('PUT', `/people/${id}`, { name }),
  deletePerson: (id) => request('DELETE', `/people/${id}`),
  saveExam: ({ title, date, presentIds }) => request('POST', '/exams', { title, date, presentIds })
};
