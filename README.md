# PenEcho Clone Scaffolding

This project is a React (Frontend) + Node.js/Express (Backend) scaffold inspired by PenEcho.

## Directory Layout

*   `frontend/` - React frontend built with Vite (port `5173` by default)
*   `backend/` - Node.js + Express backend (port `5000` by default)

## Getting Started

1.  **Install dependencies**:
    From the root folder, run:
    ```bash
    npm run install:all
    ```
    This will install packages in the root, `frontend/`, and `backend/`.

2.  **Configure environment variables**:
    Go to `backend/`, copy `.env.example` to `.env` and add your Google Gemini API key:
    ```env
    GEMINI_API_KEY=your_api_key_here
    ```

3.  **Start development servers**:
    Run:
    ```bash
    npm run dev
    ```
    This runs both the frontend Vite dev server and the backend Express server concurrently.
