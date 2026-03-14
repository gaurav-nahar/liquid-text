
### 💻 Frontend (React)

#### **Commands:**
```bash
cd frontend
npm install react react-dom axios konva react-konva react-rnd uuid react-pdf pdfjs-dist use-image web-vitals
npm start
```
*Runs on: http://localhost:3000*

#### **Core Libraries Used:**
- **`react` & `react-dom` (v19)**: Core UI framework.
- **`pdfjs-dist`**: The engine for rendering PDF pages and extracting text.
- **`konva` & `react-konva`**: Used for the interactive workspace canvas (drawing lines, handles, etc.).
- **`axios`**: For communicating with the Backend API.
- **`react-rnd`**: Handles the dragging and resizing of the "Editable Text Boxes".
- **`uuid`**: Generates unique IDs for snippets and connections.
- **`react-pdf`**: Additional PDF helper components.

---

###  Backend (FastAPI)


#### **Commands:**
cd backend

# 1. Setup Virtual Environment
python -m venv venv
venv\Scripts\activate  # Windows
# source venv/bin/activate # Mac/Linux

# 2. Install Libraries
pip install fastapi uvicorn sqlalchemy psycopg2-binary python-dotenv yoyo-migrations


# 3. Run Server
uvicorn main:app --reload
```
*Runs on: http://localhost:8000*

#### **Core Libraries Used:**
- **`fastapi`**: Modern, high-performance web framework for the API.
- **`uvicorn`**: The ASGI server implementation to run FastAPI.
- **`sqlalchemy`**: The ORM used to interact with the database using Python objects.
- **`psycopg2-binary`**: PostgreSQL adapter for Python.
- **`python-dotenv`**: For managing secret environment variables (like DB URLs).
- **`yoyo-migrations`**: Database migration tool to manage schema changes.

---

## 🛢️ Database Configuration
The system uses **PostgreSQL**. You must have a database named `liquidtext` created in your local PG Admin / Postgres server.

Edit the **`backend/.env`** file to match your credentials:
```env
DATABASE_URL=postgresql://USERNAME:PASSWORD@localhost:5432/liquidtext
```
123456GN

# From backend directory, with venv active
yoyo apply --database postgresql://postgres:123456GN@localhost/liquidtext ./src/yoyo



yoyo apply --database postgresql://postgres:123456GN@localhost/liquidtext ./src/yoyo
