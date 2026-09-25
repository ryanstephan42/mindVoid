# mindVoid

**mindVoid** is a digital "thought dump" tool designed for capturing, connecting, and exploring ideas in an unstructured space. It provides a visual "void" where thoughts, notes, and reminders can float, allowing users to organize them naturally over time.

## 🌀 Concept

Traditional note-taking apps often force a hierarchical or linear structure. **mindVoid** rejects this by default. Thoughts are dumped into a floating 2D space (the "Void"), where they can be:
- **Created** via text or voice input.
- **Moved** freely to express relationships through spatial proximity.
- **Linked** together to form a network of ideas.
- **Organized** with drawing tools (rectangles, circles, lines, etc.).
- **Tagged** for action with a "Needs Action" glow.

## 🚀 Features

- **The Void Map:** An interactive, zoomable workspace powered by `reactflow` for spatial thinking.
- **Organization Tools:** 
  - **Standard Shapes:** Rectangle, Circle, Triangle, Line, Arrow.
  - **Freehand Tool:** Sketch naturally on the background.
  - **Text Labels:** Add titles and notes anywhere.
  - **Eraser:** Quickly remove drawings or thoughts.
- **Thought Modes:** 
  - **🧠 Thought Mode (Default):** Capturing and linking ideas. Background drawings are non-interactable.
  - **✎ Draw Mode:** Active tools for organizing the void.
- **Dynamic Editing:** Resize, relocate, and copy-paste (Ctrl+C / Ctrl+V) thoughts and drawings.
- **Voice-to-Thought:** Integrated Web Speech API for hands-free thought capturing.
- **Search & Quick Jump:** `Ctrl+K` to fuzzy-search every thought and fly the viewport straight to it.
- **Timeline:** Scrub a date window to fade the void down to what you were thinking about at the time.
- **Resurface:** Resurfaces thoughts you have not revisited, so the void composts instead of piling up.
- **Linking & Proximity:** Connect related thoughts by dragging them together or through manual edges.
- **Dual Perspective:** Switch between the visual **Void Map** and a structured **Table View**.
- **Action Mode:** Mark thoughts as needing action, visually highlighting them with a red glow.
- **Single-User Lock:** Optional password gate so a public deployment is not wide open.
- **Persistence:** All data is saved to a persistent SQLite database.

## 🛠️ Technology Stack

### Frontend
- **React 19:** Modern UI components and state management.
- **React Flow:** High-performance graph-based visualization for the "Void".
- **Tailwind CSS:** Responsive and clean design with dark-mode aesthetics.
- **Axios:** For robust API communication.
- **Vite:** Blazing fast development server and build tool.
- **Web Speech API:** Native browser speech recognition.

### Backend
- **FastAPI:** High-performance Python web framework for the REST API.
- **SQLAlchemy:** ORM for flexible and efficient database interactions.
- **SQLite:** A lightweight, serverless database for easy portability.
- **Uvicorn:** ASGI server for production-ready performance.

### Infrastructure
- **Docker & Docker Compose:** Containerized environment for easy setup and deployment.

## 📦 Getting Started

### Prerequisites
- Docker and Docker Compose

### Setup

1. **Clone the repository:**
   ```bash
   git clone <repository-url>
   cd mindvoid
   ```

2. **Launch the development stack with Docker Compose:**
   ```bash
   docker compose up --build
   ```
   This uses the development Docker targets, starts the Vite dev server, and stores SQLite data in a named Docker volume.

3. **Access the application:**
   - **Frontend:** [http://localhost:3003](http://localhost:3003)
   - **API Docs (Swagger):** [http://localhost:8000/docs](http://localhost:8000/docs)

4. **Run the production-style stack:**
   ```bash
   docker compose -f docker-compose.prod.yml up --build
   ```
   The production compose file builds the backend without reload and serves the built frontend through nginx, with `/api` proxied to the backend service.

## 🧑‍💻 Development without Docker

### Backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn main:app --reload
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

The Vite dev server runs on port `3003`. Requests to `/api` are proxied to the backend target configured by `VITE_PROXY_TARGET`.

## ⚙️ Configuration

Copy `.env.example` when you want a local starting point for configuration.

- `DATABASE_URL`: SQLAlchemy database URL. Docker defaults to `sqlite:////app/data/mindvoid.db` so the database persists in a named volume; the app fallback is `sqlite:///./mindvoid.db`.
- `CORS_ORIGINS`: Comma-separated list of allowed frontend origins for the FastAPI backend.
- `VITE_API_URL`: Frontend API base URL. Defaults to `/api` for Docker so nginx or Vite can proxy requests.
- `VITE_ALLOWED_HOSTS`: Comma-separated host allowlist for the Vite dev server.
- `VITE_PROXY_TARGET`: Backend target used by the Vite dev proxy for `/api`; defaults to `http://backend:8000` in Docker.
- `MINDVOID_PASSWORD`: Password required to open the void. **Leave unset and authentication is disabled entirely** — fine for localhost, unsafe for anything reachable from the internet.
- `MINDVOID_SECRET`: Key used to sign session tokens. If unset, a random one is generated at startup, so every restart signs everyone out. Set it explicitly in production.
- `MINDVOID_TOKEN_TTL_HOURS`: How long a login lasts, in hours. Defaults to `720` (30 days).

### 🔒 Enabling the lock

```bash
export MINDVOID_PASSWORD='something-long-and-private'
export MINDVOID_SECRET="$(python -c 'import secrets; print(secrets.token_urlsafe(32))')"
```

With these set, every `/thoughts`, `/links`, and `/drawings` endpoint requires a bearer token, and the frontend shows a login screen until you sign in. `GET /auth/status` stays public so the frontend knows whether to prompt.

This is a **single-user** lock: one shared password, no accounts. It exists to keep strangers out of your thoughts, not to support multiple people.

## 🧪 Testing

### Backend
```bash
cd backend
pytest
```

### Frontend
```bash
cd frontend
npm run lint
npm run build
```

GitHub Actions runs the backend tests and frontend lint/build checks on push and pull requests.

## 📖 Usage Tips

- **Connecting Thoughts:** Drag a thought close to another and hold it for a moment in **Thought Mode** to trigger an automatic link.
- **Removing Links:** Drag an already-linked pair together again to be prompted to remove the link.
- **Organizing:** Use the right-hand toolbar to switch between thought mode and drawing tools.
- **Editing Drawings:** While any drawing tool is active, you can select and resize existing shapes. Double-click text elements to edit them.
- **Shortcut:** Use `Ctrl+C` and `Ctrl+V` to duplicate thoughts or drawings.
- **Action Glow:** Right-click any thought node to toggle the "Needs Action" state.
- **Reset View:** Use the home icon in the top right to center all thoughts in the viewport.
- **Finding Things:** Press `Ctrl+K` (or `Cmd+K`) to search every thought. Arrow keys move the selection, `Enter` flies the viewport to it, `Escape` closes.
- **Time Travel:** Open the timeline to narrow the void to a date range. Thoughts outside the window fade rather than disappear, so the layout stays recognisable.
- **Resurfacing:** Open the resurface panel to review thoughts you have not looked at in a long while, and mark them still relevant, jump to them, or skip.
