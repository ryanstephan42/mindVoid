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
- **Linking & Proximity:** Connect related thoughts by dragging them together or through manual edges.
- **Dual Perspective:** Switch between the visual **Void Map** and a structured **Table View**.
- **Action Mode:** Mark thoughts as needing action, visually highlighting them with a red glow.
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

2. **Launch with Docker Compose:**
   ```bash
   docker-compose up --build
   ```

3. **Access the application:**
   - **Frontend:** [http://localhost:3003](http://localhost:3003)
   - **API Docs (Swagger):** [http://localhost:8000/docs](http://localhost:8000/docs)

## 📖 Usage Tips

- **Connecting Thoughts:** Drag a thought close to another and hold it for a moment in **Thought Mode** to trigger an automatic link.
- **Organizing:** Use the right-hand toolbar to switch between thought mode and drawing tools.
- **Editing Drawings:** While any drawing tool is active, you can select and resize existing shapes. Double-click text elements to edit them.
- **Shortcut:** Use `Ctrl+C` and `Ctrl+V` to duplicate thoughts or drawings.
- **Action Glow:** Right-click any thought node to toggle the "Needs Action" state.
- **Reset View:** Use the home icon in the top right to center all thoughts in the viewport.
