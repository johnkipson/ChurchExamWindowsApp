const express = require('express');
const cors = require('cors');
const { pool, init } = require('./db');
const { safeFileBase, buildDocxBuffer, buildXlsxBuffer } = require('./exporters');

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

// ---- Auth: every route except /health needs the API key ----
const API_KEY = process.env.API_KEY;
if (!API_KEY) console.warn('WARNING: API_KEY is not set — the API is open to anyone with the URL.');

app.get('/health', (req, res) => res.json({ ok: true }));

app.use((req, res, next) => {
  if (!API_KEY) return next();
  if (req.get('x-api-key') === API_KEY) return next();
  res.status(401).json({ error: 'Missing or wrong x-api-key header' });
});

// Wraps async handlers so errors reach the error middleware.
const h = (fn) => (req, res, next) => fn(req, res, next).catch(next);

function cleanName(v) {
  return typeof v === 'string' ? v.trim().replace(/\s+/g, ' ') : '';
}

function toDisplayDate(d) {
  // d is a JS Date (pg returns DATE as local midnight) → dd/mm/yyyy
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

function toIsoDate(d) {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

async function allPeople() {
  const { rows } = await pool.query('SELECT id, name FROM people ORDER BY lower(name), id');
  return rows;
}

// ---- People ----
// Write endpoints return the full sorted list, matching what the desktop app expects.

app.get('/people', h(async (req, res) => {
  res.json(await allPeople());
}));

app.post('/people', h(async (req, res) => {
  const name = cleanName(req.body.name);
  if (!name) return res.status(400).json({ error: 'name is required' });
  await pool.query('INSERT INTO people (name) VALUES ($1)', [name]);
  res.status(201).json(await allPeople());
}));

app.put('/people/:id', h(async (req, res) => {
  const name = cleanName(req.body.name);
  if (!name) return res.status(400).json({ error: 'name is required' });
  const r = await pool.query('UPDATE people SET name = $1 WHERE id = $2', [name, req.params.id]);
  if (r.rowCount === 0) return res.status(404).json({ error: 'person not found' });
  res.json(await allPeople());
}));

app.delete('/people/:id', h(async (req, res) => {
  const r = await pool.query('DELETE FROM people WHERE id = $1', [req.params.id]);
  if (r.rowCount === 0) return res.status(404).json({ error: 'person not found' });
  res.json(await allPeople());
}));

// ---- Exams & attendance ----

// Body: { title, date: "YYYY-MM-DD", presentIds: [1,2,3] }
app.post('/exams', h(async (req, res) => {
  const title = cleanName(req.body.title) || 'Exam Attendance';
  const date = req.body.date || toIsoDate(new Date());
  const ids = Array.isArray(req.body.presentIds) ? req.body.presentIds.map(Number).filter(Number.isInteger) : [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return res.status(400).json({ error: 'date must be YYYY-MM-DD' });
  if (ids.length === 0) return res.status(400).json({ error: 'presentIds must list at least one person id' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const { rows: [exam] } = await client.query(
      'INSERT INTO exams (title, exam_date, total_count) VALUES ($1, $2, (SELECT COUNT(*) FROM people)) RETURNING id',
      [title, date]
    );
    await client.query(
      `INSERT INTO attendance (exam_id, person_id, name)
       SELECT $1, id, name FROM people WHERE id = ANY($2::int[])
       ON CONFLICT DO NOTHING`,
      [exam.id, ids]
    );
    await client.query('COMMIT');
    res.status(201).json(await getExam(exam.id));
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}));

app.get('/exams', h(async (req, res) => {
  const { rows } = await pool.query(`
    SELECT e.id, e.title, e.exam_date, COUNT(a.name)::int AS present_count
    FROM exams e LEFT JOIN attendance a ON a.exam_id = e.id
    GROUP BY e.id ORDER BY e.exam_date DESC, e.id DESC
  `);
  res.json(rows.map((r) => ({ id: r.id, title: r.title, date: toIsoDate(r.exam_date), presentCount: r.present_count })));
}));

async function getExam(id) {
  const { rows: [exam] } = await pool.query('SELECT id, title, exam_date, total_count FROM exams WHERE id = $1', [id]);
  if (!exam) return null;
  const { rows } = await pool.query(
    'SELECT person_id, name FROM attendance WHERE exam_id = $1 ORDER BY lower(name)',
    [id]
  );
  return {
    id: exam.id,
    title: exam.title,
    date: toIsoDate(exam.exam_date),
    dateDisplay: toDisplayDate(exam.exam_date),
    totalCount: exam.total_count,
    present: rows.map((r) => ({ personId: r.person_id, name: r.name }))
  };
}

app.get('/exams/:id', h(async (req, res) => {
  const exam = await getExam(req.params.id);
  if (!exam) return res.status(404).json({ error: 'exam not found' });
  res.json(exam);
}));

app.delete('/exams/:id', h(async (req, res) => {
  const r = await pool.query('DELETE FROM exams WHERE id = $1', [req.params.id]);
  if (r.rowCount === 0) return res.status(404).json({ error: 'exam not found' });
  res.json({ deleted: true });
}));

// ---- Downloads: GET /exams/:id/export.docx or /exams/:id/export.xlsx ----

const FORMATS = {
  docx: { build: buildDocxBuffer, type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
  xlsx: { build: buildXlsxBuffer, type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
};

app.get('/exams/:id/export.:fmt', h(async (req, res) => {
  const fmt = FORMATS[req.params.fmt];
  if (!fmt) return res.status(400).json({ error: 'format must be docx or xlsx' });
  const exam = await getExam(req.params.id);
  if (!exam) return res.status(404).json({ error: 'exam not found' });

  const buffer = await fmt.build({
    title: exam.title,
    dateDisplay: exam.dateDisplay,
    presentNames: exam.present.map((p) => p.name),
    totalCount: exam.totalCount
  });
  const filename = safeFileBase(exam.title, exam.dateDisplay) + '.' + req.params.fmt;
  res.set('Content-Type', fmt.type);
  res.set('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(buffer);
}));

// ---- Errors ----
app.use((req, res) => res.status(404).json({ error: 'not found' }));
app.use((err, req, res, next) => {
  console.error(err);
  if (err.code === '22P02') return res.status(400).json({ error: 'invalid id' });
  res.status(500).json({ error: 'server error' });
});

const PORT = process.env.PORT || 3000;
init()
  .then(() => app.listen(PORT, '0.0.0.0', () => console.log(`API listening on port ${PORT}`)))
  .catch((e) => {
    console.error('Failed to start:', e.message);
    process.exit(1);
  });
