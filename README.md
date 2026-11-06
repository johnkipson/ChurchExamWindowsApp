# Exam Attendance App

A desktop (Electron) app for taking exam attendance and exporting the present list to Word (.docx) or Excel (.xlsx).

The name list and every saved attendance now live in an online **Postgres database**, reached through an **Express API** (`api/` folder). Every computer running the app sees the same list.

```
Desktop app  ──HTTPS + x-api-key──▶  Express API (Render, free)  ──▶  Postgres (Neon, free)
```

---

## 1. Create the database (Neon, free)

1. Sign up at https://neon.com (no credit card).
2. Create a project. Pick the region closest to you (e.g. Singapore for India).
3. Click **Connect** and copy the connection string (`postgresql://...?sslmode=require`).

The tables are created and the 84 names are seeded automatically the first time the API starts.

## 2. Deploy the API (Render, free)

1. Push this whole folder to a GitHub repository.
2. At https://render.com: **New + → Blueprint** and pick the repo (it reads `render.yaml`).
   Or: **New + → Web Service**, Root Directory `api`, Build `npm install`, Start `npm start`, Instance type **Free**.
3. Set the environment variables:
   - `DATABASE_URL`: the Neon connection string
   - `API_KEY`: any long random string (keep it secret)
4. When it's live, open `https://<your-service>.onrender.com/health`. You should see `{"ok":true}`.

> The free Render service sleeps after 15 minutes without traffic. The first request afterwards takes up to a minute while it wakes. The app shows a loading message during that time.

## 3. Point the app at your API

Edit `config.json`:

```json
{
  "apiUrl": "https://<your-service>.onrender.com",
  "apiKey": "<the same API_KEY you set on Render>"
}
```

Then run it or build the installer:

```
npm install
npm start          # run
npm run dist       # Windows installer → dist/
```

`config.json` is bundled into the installer, so rebuild after changing it.

---

## Run the API locally

```
cd api
cp .env.example .env     # fill in DATABASE_URL and API_KEY
npm install
npm run dev
```

## API reference

Every route except `/health` needs the header `x-api-key: <API_KEY>`.

| Method | Path | Body | Returns |
|---|---|---|---|
| GET | `/health` | | `{ ok: true }` |
| GET | `/people` | | `[{ id, name }]` sorted by name |
| POST | `/people` | `{ name }` | the full updated list |
| PUT | `/people/:id` | `{ name }` | the full updated list |
| DELETE | `/people/:id` | | the full updated list |
| POST | `/exams` | `{ title, date: "YYYY-MM-DD", presentIds: [..] }` | the saved exam |
| GET | `/exams` | | `[{ id, title, date, presentCount }]` newest first |
| GET | `/exams/:id` | | `{ id, title, date, dateDisplay, totalCount, present: [{ personId, name }] }` |
| DELETE | `/exams/:id` | | `{ deleted: true }` |
| GET | `/exams/:id/export.docx` | | Word file download |
| GET | `/exams/:id/export.xlsx` | | Excel file download |

When you generate a Word or Excel file in the app, that attendance is also saved to the server as an exam record.

## Database tables

- `people (id, name, created_at)`
- `exams (id, title, exam_date, total_count, created_at)`
- `attendance (id, exam_id → exams, person_id → people, name)`. The name is copied in, so past records stay intact if a person is later removed.
