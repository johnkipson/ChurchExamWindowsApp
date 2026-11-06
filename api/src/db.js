const { Pool } = require('pg');
const seedNames = require('./seedNames');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env or set it in your host.');
  process.exit(1);
}

// Hosted Postgres (Neon, Supabase, Render) needs SSL; a local database usually doesn't.
const isLocal = /localhost|127\.0\.0\.1/.test(process.env.DATABASE_URL);

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: isLocal ? false : { rejectUnauthorized: false },
  max: 5
});

// Creates tables if they don't exist and seeds the name list once.
async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS people (
      id         SERIAL PRIMARY KEY,
      name       TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS exams (
      id         SERIAL PRIMARY KEY,
      title      TEXT NOT NULL,
      exam_date  DATE NOT NULL,
      total_count INTEGER NOT NULL DEFAULT 0,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- Name is copied in so old attendance stays readable if a person is later removed.
    CREATE TABLE IF NOT EXISTS attendance (
      id         SERIAL PRIMARY KEY,
      exam_id    INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
      person_id  INTEGER REFERENCES people(id) ON DELETE SET NULL,
      name       TEXT NOT NULL,
      UNIQUE (exam_id, person_id)
    );
  `);

  const { rows } = await pool.query('SELECT COUNT(*)::int AS n FROM people');
  if (rows[0].n === 0) {
    await pool.query(
      'INSERT INTO people (name) SELECT unnest($1::text[])',
      [seedNames]
    );
    console.log(`Seeded ${seedNames.length} names.`);
  }
}

module.exports = { pool, init };
