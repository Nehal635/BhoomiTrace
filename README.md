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

### 1. Start the Backend API (FastAPI)
```bash
# In first terminal:
.\venv\Scripts\Activate.ps1
uvicorn backend.app.main:app --reload
