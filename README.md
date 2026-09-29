# BhoomiTrace (SIH Problem Statement: SIH26013)

> **Automated Integration and Intelligent Harmonization of Multi-source Geospatial Data for Urban Land Record Management**

[![FastAPI](https://img.shields.io/badge/FastAPI-0.100+-009688.svg?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![React](https://img.shields.io/badge/React-18.2+-61DAFB.svg?logo=react&logoColor=black)](https://reactjs.org)
[![Leaflet](https://img.shields.io/badge/Leaflet-1.9+-199900.svg?logo=leaflet&logoColor=white)](https://leafletjs.com)
[![Python](https://img.shields.io/badge/Python-3.10+-3776AB.svg?logo=python&logoColor=white)](https://python.org)

---

## 📌 Problem & Solution Overview
In Indian urban land management (NAKSHA / DILRMP programs), land records are fragmented across legacy cadastral maps, high-resolution drone orthomosaics, and municipal tax registries. 

**BhoomiTrace** is an intelligent GeoAI harmonization layer that:
1. **Normalizes Projections**: Automatically reprojects multi-source spatial data to metric UTM / EPSG:3857.
2. **GeoAI Feature Extraction**: Integrates drone footprint contours with cadastral vectors.
3. **Automated Topology & Conflict Auditing**: Detects spatial overlaps, boundary gaps, and attribute discrepancies (via Levenshtein fuzzy string matching).
4. **Confidence Scoring**: Scores parcel alignment ($0.0$ to $1.0$).
5. **Human-in-the-Loop Adjudication**: Low-confidence records are routed to an administrative WebGIS panel where revenue officials review and commit legal decisions.
6. **OGC Interoperability**: Exports synchronized records into clean GeoJSON for municipal departmental use.

---

## 🏗️ Architecture Pipeline
[ Drone Orthomosaic / GeoTIFF ] ──> [ GeoAI Feature Extraction (U-Net) ]
[ Legacy Cadastral GeoJSON/SHP ] ──> [ CRS Normalization (EPSG:3857) ] ──> [ PostGIS / Spatial Joins ]
[ Municipal Tax Registry (CSV) ] ──> [ Fuzzy String Matcher ]         ──> [ Confidence Scoring Engine ]
│
┌───────────────┴───────────────┐
Score >= 0.85                      Score < 0.85
│                                   │
[ SYNCHRONIZED ]               [ WebGIS Review Queue ]
│                                   │
[ Master Export ] <──── [ Official Adjudication Modal ]
---
## 🚀 Running the Prototype Locally

### 📋 Prerequisites

Make sure the following are installed:

- Python 3.10+
- Node.js 18+
- npm
- Git
- PostgreSQL with PostGIS (if using the PostGIS database)
- Docker Desktop (optional, if using Docker)

---

### 1. Clone the Repository

```bash
git clone https://github.com/Nehal635/BhoomiTrace.git
cd BhoomiTrace
2. Backend Setup (FastAPI)

Open a terminal in the project root.

Create and activate the Python virtual environment

If the venv folder does not already exist:

python -m venv venv

On Windows PowerShell:

.\venv\Scripts\Activate.ps1

If PowerShell blocks activation, run:

Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser

Then activate again:

.\venv\Scripts\Activate.ps1
Install Python dependencies
pip install -r backend/requirements.txt
Start the FastAPI backend

From the project root:

uvicorn backend.app.main:app --reload

The backend will normally be available at:

http://127.0.0.1:8000

FastAPI interactive API documentation:

http://127.0.0.1:8000/docs
3. Frontend Setup (React)

Open a second terminal.

Navigate to the frontend:

cd frontend

Install the Node.js dependencies:

npm install

Start the React development server:

npm start

The frontend will normally open at:

http://localhost:3000
4. Run Both Services

BhoomiTrace requires both the backend and frontend to be running.

Terminal 1 — Backend
cd BhoomiTrace
.\venv\Scripts\Activate.ps1
uvicorn backend.app.main:app --reload
Terminal 2 — Frontend
cd BhoomiTrace\frontend
npm install
npm start

Then open:

http://localhost:3000
5. Database

BhoomiTrace uses spatial data and can work with PostgreSQL/PostGIS.

The repository includes:

docker-compose.yml
init.sql
bhoomitrace.db

If using the Docker-based database setup, make sure Docker Desktop is running and execute:

docker compose up -d

To stop the containers:

docker compose down
6. Sample Data

Sample geospatial data is available in:

sample_data/

The sample data can be used to test the geospatial processing, harmonization, topology checking, and confidence-scoring workflow.

🔄 System Workflow
Drone Orthomosaic / GeoTIFF
            │
            ▼
┌───────────────────────────────┐
│ GeoAI Feature Extraction      │
│ (U-Net / Building Footprints) │
└───────────────┬───────────────┘
                │
                ▼
      CRS Normalization
        EPSG:3857 / UTM
                │
                ▼
┌───────────────────────────────┐
│ Legacy Cadastral Data         │
│ GeoJSON / SHP                 │
└───────────────┬───────────────┘
                │
                ▼
       PostGIS Spatial Joins
                │
                ▼
┌───────────────────────────────┐
│ Municipal Tax Registry        │
│ CSV                           │
└───────────────┬───────────────┘
                │
                ▼
       Fuzzy Attribute Matching
                │
                ▼
       Confidence Scoring
                │
        ┌───────┴───────┐
        │               │
   Score >= 0.85    Score < 0.85
        │               │
        ▼               ▼
 SYNCHRONIZED       WEBGIS REVIEW
        │               │
        │        Official Adjudication
        │               │
        └───────┬───────┘
                ▼
        Master GeoJSON Export
