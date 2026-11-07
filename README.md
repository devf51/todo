# Todo

เว็บจัดการ todo: ชื่องาน, วันกำหนดส่ง, ความสำคัญ, หมวดหมู่ และตัวกรอง (FastAPI + SQLite + React/Vite)

## รันตอนพัฒนา

```bash
cd backend && python3.14 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt
cd frontend && npm ci
cd backend && .venv/bin/uvicorn app.main:app --reload --port 8000   # เทอร์มินัล 1
cd frontend && npm run dev                                          # เทอร์มินัล 2 → http://localhost:5173
```

## รันเทสต์

```bash
cd backend && .venv/bin/pytest && .venv/bin/ruff check .
cd frontend && npm test && npm run build
cd e2e && npm ci && npx playwright install --with-deps chromium && npx playwright test
```

## Deploy บน VPS (Docker)

```bash
docker compose up -d --build
```

- หน้าเว็บ + API อยู่ที่ `http://127.0.0.1:8000` (compose bind แค่ `127.0.0.1` ต้องเข้าผ่าน reverse proxy ด้านล่าง)
- ข้อมูลอยู่ที่ `/data/todo.db` ใน volume `todo-data` (`docker compose down` ไม่ลบ, `docker compose down -v` ลบ)
- container รันเป็น user ที่ไม่ใช่ root
- ตั้งค่า `STATIC_DIR` / `DATABASE_PATH` ผ่าน env ถ้าต้องการเปลี่ยน (ค่าใน image คือ `/app/static`, `/data/todo.db`)

### Reverse proxy (HTTPS + จำกัดขนาด body 64 KB)

Caddy (ออกใบรับรอง HTTPS ให้อัตโนมัติ):

```
todo.example.com {
    request_body {
        max_size 64KB
    }
    reverse_proxy 127.0.0.1:8000
}
```

nginx (ใส่ใบรับรองเอง เช่นด้วย certbot):

```
server {
    listen 443 ssl;
    server_name todo.example.com;
    client_max_body_size 64k;
    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
