# Campus Space — working prototype

A responsive, client-only PWA prototype for discovering **scheduled-available** campus rooms and contributing anonymized timetable data.

## Run locally

```bash
cd campus-space
python3 -m http.server 4173
```

Open `http://localhost:4173` in a browser. The app also works by opening `index.html`, but the service worker/PWA shell is enabled when served over HTTP.

## Prototype behavior

- Uses a deterministic demo dataset for Blocks 25–30 and the demo date 23 Sep 2026.
- Calculates room availability using the overlap rule: `existing_start < requested_end && existing_end > requested_start`.
- Upload accepts CSV with columns: `room_id,date,start_time,end_time,status,course`.
- Uploads are stored only in browser `localStorage` until the student explicitly contributes them.
- Contributions are anonymized, stored locally for this prototype, and shown as **community signals** pending review. They never override official timetable availability.
- No backend, authentication, or external database is connected in this prototype.
