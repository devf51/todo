branch: plan/todo-web
plan: approved
checkpoint: F1 pending
qa: yes
security: yes

# ภาพรวม

```
 browser ──HTTP──▶ ┌──────────────── container "todo" (port 8000) ────────────────┐
 (reverse proxy    │  uvicorn + FastAPI (backend/app)                             │
  + HTTPS ของ      │   ├─ /api/todos, /api/categories  ──SQL (parameterized)──▶  │──▶ /data/todo.db
  ผู้ใช้บน VPS)     │   └─ /  → static files (frontend/dist ที่ build แล้ว)          │    (SQLite, volume todo-data)
                   └──────────────────────────────────────────────────────────────┘

 dev: vite dev server :5173 ──proxy /api──▶ uvicorn :8000
```

- browser โหลดหน้าเว็บ (React build เป็น static) จาก `/` แล้วเรียก JSON API ใต้ `/api` ที่ origin เดียวกัน
- FastAPI validate input ทุกตัว แล้วอ่าน / เขียน SQLite ผ่าน `sqlite3` ของ Python ด้วย query แบบ parameter เท่านั้น
- ไม่มี login: ทุก request ได้สิทธิ์เท่ากัน (ผู้ใช้ยอมรับใน spec)
- ตอน dev รัน backend กับ vite แยกกัน vite proxy `/api` ไป backend ตอน production ใช้ container เดียว

# ส่วนประกอบ

| ส่วน | owner | หน้าที่ (หนึ่งอย่าง) |
|------|-------|----------------------|
| backend (`backend/app`) | backend | JSON API ของ todo และหมวด + เก็บข้อมูลใน SQLite + เสิร์ฟไฟล์หน้าเว็บที่ build แล้ว |
| frontend (`frontend/`) | frontend | หน้าเว็บหน้าเดียวที่เรียก API |
| e2e (`e2e/`) | devops (โครง) · qa (เทสต์) | ทดสอบหน้าเว็บ + API จริงด้วยกันผ่าน browser |
| Docker / CI | devops | build container เดียว, compose พร้อม volume, CI รันเทสต์ทุกส่วน |

# ภาษา, framework และเหตุผล

- backend: Python + FastAPI + `sqlite3` (stdlib) เพราะผู้ใช้เลือกแนวทาง A · pydantic validate input ที่รับจาก internet ได้ในตัว · ไม่ใช้ ORM เพราะมีแค่ 2 ตาราง SQL ตรงๆ สั้นกว่าและไม่มี dependency เพิ่ม · uvicorn เป็น ASGI server มาตรฐานของ FastAPI
- frontend: TypeScript + React + Vite เพราะ TypeScript เป็นภาษาเดียวที่ frontend ใช้ได้ · React ใช้กันแพร่หลายและ escape ข้อความให้อัตโนมัติ (กัน XSS) · Vite build เป็น static ให้ backend เสิร์ฟได้ · ไม่ใช้ router / state library เพราะมีหน้าเดียว
- programmer: ไม่มีงาน
- devops: Bash + YAML (Dockerfile, docker-compose, GitHub Actions) เพราะผู้ใช้ deploy ด้วย Docker บน VPS · e2e ใช้ Playwright (TypeScript) เพราะเป็นตัวที่ใช้กันแพร่หลายและรัน webServer ให้เองได้

# เวอร์ชัน

ตรวจจาก PyPI / npm registry / endoflife.date เมื่อ 2026-11-07

| ส่วน | ชื่อ | เวอร์ชัน |
|------|------|----------|
| backend | Python | 3.14.10 (Docker `python:3.14-slim`) |
| backend | fastapi | 0.162.0 |
| backend | uvicorn | 0.54.0 |
| backend | pydantic | 2.14.3 |
| backend | pytest | 9.2.0 |
| backend | httpx (สำหรับ TestClient) | 0.28.1 |
| backend | ruff | 0.17.4 |
| backend | pip-audit | 2.10.1 |
| frontend / e2e | Node.js | 24.22.2 LTS (Docker `node:24-slim`) |
| frontend | react, react-dom | 19.3.1 |
| frontend | @types/react, @types/react-dom | 19.3.0 |
| frontend | typescript | 7.0.2 |
| frontend | vite | 8.3.6 |
| frontend | @vitejs/plugin-react | 6.2.1 |
| frontend | vitest | 5.1.0 |
| frontend | jsdom | 31.0.0 |
| frontend | @testing-library/react | 16.3.3 |
| frontend | @testing-library/user-event | 14.6.8 |
| frontend | @testing-library/jest-dom | 7.0.1 |
| e2e | @playwright/test | 1.65.0 |

# คำสั่ง

| ส่วน | ติดตั้ง | เทสต์ทั้งชุด | lint / build | รัน |
|------|---------|--------------|--------------|-----|
| backend | `cd backend && python3.14 -m venv .venv && .venv/bin/pip install -r requirements-dev.txt` | `cd backend && .venv/bin/pytest` | `cd backend && .venv/bin/ruff check .` | `cd backend && .venv/bin/uvicorn app.main:app --reload --port 8000` |
| frontend | `cd frontend && npm ci` | `cd frontend && npm test` | `cd frontend && npm run build` | `cd frontend && npm run dev` (port 5173, proxy `/api` → `API_TARGET` ค่าเริ่มต้น `http://localhost:8000`) |
| e2e | `cd e2e && npm ci && npx playwright install --with-deps chromium` (ต้องติดตั้ง backend + frontend ก่อน) | `cd e2e && npx playwright test` | - | - |
| docker | - | `docker compose up -d --build && curl -fsS http://localhost:8000/api/todos && docker compose down` | `docker compose build` | `docker compose up -d --build` |

- `npm test` = `vitest run --passWithNoTests` · `npm run build` = `tsc -b && vite build`
- e2e: `playwright.config.ts` เปิด backend ที่ port 8001 (`DATABASE_PATH=e2e/.tmp/e2e.db` ลบทิ้งก่อนรันทุกครั้ง) และ vite ที่ port 5174 (`API_TARGET=http://localhost:8001`) เอง · CI รันด้วย `--pass-with-no-tests` จนกว่า qa จะเพิ่มเทสต์

# โครงสร้างโฟลเดอร์

```
backend/
  requirements.txt        runtime deps (pin)
  requirements-dev.txt    -r requirements.txt + pytest, httpx, ruff, pip-audit (pin)
  pyproject.toml          config ของ pytest (pythonpath = ["."]) และ ruff
  app/
    __init__.py
    main.py               create_app(), app = create_app(...) อ่าน env
    db.py                 connect(), init_db() — schema ทั้งหมด
    todos.py              router /api/todos + model ของ todo
    categories.py         router /api/categories + model ของหมวด
  tests/
    conftest.py           fixture client (TestClient + DB ชั่วคราวใน tmp_path)
    test_todos.py
    test_categories.py
    test_static.py
frontend/
  package.json, package-lock.json, tsconfig.json, vite.config.ts, index.html
  src/
    main.tsx, setupTests.ts
    api.ts, api.test.ts   ฟังก์ชันเรียก API ทั้งหมด + type
    App.tsx, App.test.tsx, App.css
    Categories.tsx, Categories.test.tsx
    Filters.tsx, Filters.test.tsx
e2e/
  package.json, package-lock.json, playwright.config.ts
  tests/<feature>.spec.ts (qa เขียน)
Dockerfile, .dockerignore, docker-compose.yml, README.md, .gitignore
.github/workflows/ci.yml
```

# ข้อมูล

SQLite ไฟล์เดียว path จาก env `DATABASE_PATH` (ค่าเริ่มต้น `todo.db` · ใน container `/data/todo.db` บน volume `todo-data`) ทุก connection ต้อง `PRAGMA foreign_keys = ON` · สร้างด้วย `CREATE TABLE IF NOT EXISTS` ตอน `create_app()`

```sql
CREATE TABLE IF NOT EXISTS categories (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT    NOT NULL UNIQUE            -- ตัดช่องว่างหน้าหลังก่อนบันทึก, 1–50 ตัวอักษร, ซ้ำแบบตรงตัว = ซ้ำ
);

CREATE TABLE IF NOT EXISTS todos (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT    NOT NULL,                                   -- ตัดช่องว่างหน้าหลัง, 1–200 ตัวอักษร
  done        INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0, 1)),
  due_date    TEXT    NULL,                                       -- 'YYYY-MM-DD' หรือ NULL
  priority    TEXT    NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  category_id INTEGER NULL REFERENCES categories(id) ON DELETE SET NULL
);
```

- todo มีหมวด 0 หรือ 1 หมวด (`category_id` เป็น NULL ได้) · ลบหมวดแล้ว SQLite ตั้ง `category_id = NULL` ให้เอง (`ON DELETE SET NULL`)
- การเรียงรายการ: `ORDER BY due_date IS NULL, due_date, id` (due_date เป็น ISO จึงเรียงแบบ text ได้ถูก)
- ไม่ทำ index เพิ่ม: ผู้ใช้คนเดียว ข้อมูลหลักร้อยถึงพันแถว
- ใช้ connection ใหม่ต่อ request (FastAPI dependency) แล้ว commit / close เมื่อจบ เลี่ยงปัญหา thread ของ `sqlite3`

# API หลัก

ทุก response เป็น JSON · error ใช้รูปแบบของ FastAPI `{"detail": ...}` (422 จาก validation, `detail` เป็นรายการ) · id ใน path และ `category_id` (query / body) ต้องเป็น int ในช่วง 1..9223372036854775807 ไม่งั้น → 422 (เลขเกิน int64 ทำให้ `sqlite3` โยน `OverflowError`) · PATCH: `title` / `done` / `priority` เป็น `null` → 422, body `{}` → 200 ค่าเดิม

`Todo = {id: int, title: string, done: bool, due_date: string|null, priority: "low"|"medium"|"high", category_id: int|null}` · `Category = {id: int, name: string}`

| method | path | ใช้กับฟีเจอร์ |
|--------|------|---------------|
| GET | `/api/todos` (+ `?status=all\|active\|done&category_id=<int>&priority=low\|medium\|high` ตั้งแต่ F4) | F1, F2, F4 |
| POST | `/api/todos` → 201 | F1, F2, F3 |
| PATCH | `/api/todos/{id}` (แก้บางส่วน: field ที่ไม่ส่ง = ไม่เปลี่ยน, ส่ง `null` ให้ `due_date` / `category_id` = ล้างค่า) | F1, F2, F3 |
| DELETE | `/api/todos/{id}` → 204 | F1 |
| GET | `/api/categories` | F3 |
| POST | `/api/categories` → 201 | F3 |
| PATCH | `/api/categories/{id}` | F3 |
| DELETE | `/api/categories/{id}` → 204 | F3 |
| GET | `/` และไฟล์ static (เมื่อตั้ง env `STATIC_DIR`) | F5 |

# Security

- **authentication / authorization:** ไม่มี ทุกคนบน internet ที่รู้ URL อ่าน / แก้ / ลบได้ทุกอย่าง ผู้ใช้ยอมรับใน spec (ข้อจำกัด) · CSRF ไม่เป็นประเด็นเพราะไม่มี session ให้ขโมย
- **ข้อมูลอ่อนไหว:** ไม่มีตามที่ผู้ใช้ยอมรับ (ข้อมูลเป็นสาธารณะโดยปริยาย) · ไม่มี secret ในระบบ ไม่มีไฟล์ `.env`
- **input เข้ามาทาง:** JSON body, query string, path id ของ `/api/*` → validate ด้วย pydantic ทุกตัว (ความยาว, enum, รูปแบบวันที่จริง, ชนิดข้อมูล) ก่อนถึง DB · SQL ใช้ placeholder `?` เท่านั้น ห้ามประกอบ SQL จาก input (ORDER BY เป็นค่าคงที่, ชื่อคอลัมน์ใน `UPDATE ... SET` และเงื่อนไข `WHERE` ของตัวกรองมาจาก whitelist คงที่ในโค้ด ไม่ใช่ key จาก body / query)
- **output:** frontend แสดงข้อความผ่าน JSX ปกติเท่านั้น ห้ามใช้ `dangerouslySetInnerHTML` (กัน stored XSS เพราะใครก็เขียนข้อมูลได้)
- **CORS:** ไม่เปิด (หน้าเว็บกับ API origin เดียวกัน)
- **container:** รันเป็น user ที่ไม่ใช่ root · compose bind `127.0.0.1:8000` เท่านั้น ให้ reverse proxy ของผู้ใช้เป็นทางเข้าเดียว · HTTPS และจำกัดขนาด body (แนะนำ 64 KB) ตั้งที่ proxy README มีตัวอย่าง Caddy / nginx
- **CI / dependency:** workflow ใช้ `permissions: contents: read` · CI รัน `pip-audit -r requirements.txt` และ `npm audit --omit=dev`
- **ความเสี่ยงที่ยอมรับ:** ไม่มี rate limit / เพดานจำนวนข้อมูล (อยู่ใน "ข้อเสนอเพิ่มเติม" ของ spec) · หน้า `/docs` ของ FastAPI เปิดสาธารณะ · base image ใช้ tag ไม่ pin digest

# Error

| เกิดอะไร | ระบบทำอะไร |
|----------|-------------|
| input ไม่ผ่าน validation (ชื่อว่าง / ยาวเกิน, วันที่ผิด, priority / status ผิด, ชนิดผิด, id นอกช่วง int64, `null` ใน field ที่ห้าม null) | 422 `{detail: [...]}` ไม่แตะ DB |
| id ของ todo / หมวดไม่มี | 404 `{detail: "todo not found"}` / `{detail: "category not found"}` |
| `category_id` ใน body ของ todo ชี้หมวดที่ไม่มี | 422 `{detail: "category not found"}` |
| ชื่อหมวดซ้ำ (สร้าง / เปลี่ยนชื่อ) | 409 `{detail: "category name already exists"}` (จับ `sqlite3.IntegrityError` ของ UNIQUE) |
| DB เขียนไม่ได้ (disk เต็ม, permission) | 500 และ uvicorn log stack trace · ไม่มีข้อมูลบันทึกครึ่งๆ เพราะแต่ละ request เป็น transaction เดียว |
| `STATIC_DIR` ตั้งไว้แต่ไม่มีโฟลเดอร์ | app start ไม่ขึ้น (fail ตั้งแต่ต้น ไม่เงียบ) |
| frontend เรียก API ไม่สำเร็จ / ได้ status ไม่ใช่ 2xx | แสดงข้อความใน `role="alert"` · ไม่ล้างค่าที่ผู้ใช้พิมพ์ในฟอร์ม · ไม่เปลี่ยนรายการบนจอจนกว่า server ตอบสำเร็จ (ไม่ทำ optimistic update) |

# การทดสอบ

- **backend:** pytest + `fastapi.testclient.TestClient` เทสต์ผ่าน HTTP interface เท่านั้น · fixture `client` ใน `conftest.py` สร้าง `create_app(str(tmp_path / "test.db"))` ใหม่ทุกเทสต์ (DB ไฟล์ชั่วคราว แยกกันทุกเทสต์) · ตรวจผลใน DB ผ่าน `GET` ของ API
- **frontend:** vitest + jsdom + Testing Library · stub `fetch` ด้วย `vi.stubGlobal` · `api.test.ts` ตรวจ method / URL / body / การ throw `ApiError` · `*.test.tsx` ตรวจการกดและสิ่งที่เห็นบนจอผ่าน role / label ภาษาไทย
- **e2e (qa):** Playwright รัน backend จริง (DB ใหม่ทุกครั้งที่ `e2e/.tmp/e2e.db`) + vite dev · หนึ่งไฟล์ต่อฟีเจอร์ `e2e/tests/F<n>.spec.ts` ตาม acceptance criteria ฝั่งหน้าเว็บ
- **docker:** T11 รัน compose จริง ตรวจ `/`, `/api/todos` และข้อมูลอยู่รอดหลัง `down` / `up`

# การตัดสินใจสำคัญ

- แนวทาง A (container เดียว, FastAPI + React, SQLite) — ผู้ใช้เลือกใน spec
- `sqlite3` stdlib แทน SQLAlchemy เพราะมี 2 ตาราง ไม่ต้องการ ORM / migration tool
- สร้าง schema ครบทั้ง 2 ตาราง (รวมคอลัมน์ของ F2, F3) ตั้งแต่ T2 เพราะไม่มี migration tool: DB ที่ผู้ใช้ใช้ลอง checkpoint F1 จะใช้ต่อกับ F2–F4 ได้โดยไม่ต้องลบ · API ของ F1 ส่ง field เหล่านี้กลับเป็นค่าเริ่มต้นไปก่อน · shortcut: เปลี่ยน schema หลัง release ต้องเพิ่ม migration
- Python 3.14 แทน 3.15 เพราะ 3.15 เพิ่งออก library ที่มี native extension (pydantic-core) อาจยังไม่มี wheel ครบ · Node 24 LTS แทน 26 เพราะ 26 เพิ่งเข้า LTS (2026-10-28) · TypeScript 7.0.2 คือ tag `latest` บน npm ถ้า toolchain (vite / vitest / `tsc -b`) ใช้กับ 7 ไม่ได้ devops ลดเป็น 6.x ล่าสุดได้ โดยแก้ตาราง "เวอร์ชัน" และบันทึกเหตุผลที่นี่
- ชื่อหมวดซ้ำ = ตรงกันทุกตัวอักษรหลังตัดช่องว่าง (ไม่สนตัวพิมพ์เล็กใหญ่ไม่ได้ทำ เพราะ spec ไม่ได้ขอ)
- `category_id` ที่ไม่มีอยู่ใน filter `GET /api/todos?category_id=` ได้ 200 `[]` (ไม่ใช่ error) เพราะเป็นการค้น ไม่ใช่การอ้างถึง
- งาน backend / frontend ทุกชิ้นแตะไฟล์ชุดเดียวกัน จึงเรียงต่อกันด้วย `depends_on` (ทำทีละชิ้น ไม่ขนาน)
- ไม่มีงาน programmer: ทุกส่วนเป็น service หรือหน้าเว็บ
- qa: yes เพราะมี backend + frontend ต้องทำงานด้วยกัน และมีหน้าจอให้ผู้ใช้กด
- security: yes เพราะรับ input จาก network และเปิดบน internet โดยไม่มี login (ใครก็เขียนข้อมูลได้ → ต้องตรวจ validation, SQL injection, stored XSS, container)
- รับข้อ "ควรแก้" จากตรวจ design รอบ 1 (ผล: ผ่าน) เข้าแผนก่อนอนุมัติ: ช่วง id 1..2^63-1 (T2 / T6 / T8), PATCH `null` / `{}` + whitelist คอลัมน์ (T2 / T4), compose bind `127.0.0.1` + ตัวอย่าง proxy จำกัด body 64 KB (T11), CI `permissions: contents: read` + `pip-audit` / `npm audit` (T1) · ไม่รับ: pin digest ของ base image (เพิ่มภาระอัปเดต ผู้ใช้คนเดียว)
- checkpoint F1 เพราะเล็กที่สุดที่เห็นทั้งทาง: API + DB + หน้าเว็บ ครบหนึ่งรอบ
