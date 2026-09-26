from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pathlib import Path
import json
import geopandas as gpd
import pandas as pd
from rapidfuzz import fuzz
from backend.app.services.harmonization import run_harmonization

app = FastAPI(
    title="BhoomiTrace API",
    description="Intelligent Harmonization of Multi-source Geospatial Data for Urban Land Record Management (SIH26013)",
    version="1.0.0"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = Path("C:/Users/NEHAL/BhoomiTrace")
CURRENT_GEOJSON = None

DATA_STORE = {
    "records": run_harmonization()
}

class ConflictResolutionRequest(BaseModel):
    parcel_id: str
    approved_owner: str
    resolution_action: str
    audit_notes: str

@app.get("/")
def root():
    return {"project": "BhoomiTrace", "status": "online", "docs_url": "/docs"}

@app.get("/health")
def health():
    return {"status": "healthy"}

@app.post("/api/v1/harmonize/reset")
def reset_demo():
    global CURRENT_GEOJSON
    CURRENT_GEOJSON = None
    DATA_STORE["records"] = run_harmonization()
    return {"status": "success", "message": "Demo reset to initial test state."}

@app.post("/api/v1/ingest/upload")
async def upload_cadastral_file(file: UploadFile = File(...)):
    """Dynamic Ingestion: Uploads external GeoJSON, normalizes CRS, and detects overlaps."""
    global CURRENT_GEOJSON
    try:
        contents = await file.read()
        raw_geojson = json.loads(contents.decode("utf-8-sig"))
        gdf = gpd.GeoDataFrame.from_features(raw_geojson["features"])
        
        # CRS Normalization to EPSG:3857 for metric spatial calculations
        if gdf.crs is None or gdf.crs.to_epsg() != 3857:
            gdf.set_crs(epsg=4326, inplace=True, allow_override=True)
            gdf = gdf.to_crs(epsg=3857)

        results = []
        for i, parcel_a in gdf.iterrows():
            pid = parcel_a.get("parcel_id", f"P-{i+101}")
            owner = parcel_a.get("owner_name", "Unknown Owner")
            geom_a = parcel_a["geometry"]

            overlap_detected = False
            overlap_details = ""
            for j, parcel_b in gdf.iterrows():
                if i != j and geom_a.intersects(parcel_b["geometry"]):
                    area = geom_a.intersection(parcel_b["geometry"]).area
                    if area > 0.01:
                        overlap_detected = True
                        other_pid = parcel_b.get("parcel_id", f"P-{j+101}")
                        overlap_details = f"Overlaps with {other_pid} by {round(area, 2)} sq.m"

            confidence = 0.62 if overlap_detected else 0.95
            status = "PENDING_REVIEW" if overlap_detected else "SYNCHRONIZED"

            results.append({
                "parcel_id": pid,
                "owner_name": owner,
                "confidence_score": confidence,
                "status": status,
                "conflict_type": "BOUNDARY_OVERLAP" if overlap_detected else "NONE",
                "details": overlap_details if overlap_detected else "Geometry validated"
            })

        DATA_STORE["records"] = results
        CURRENT_GEOJSON = raw_geojson
        return {"status": "success", "parcels_ingested": len(results), "records": results}

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Ingestion failed: {str(e)}")

@app.get("/api/v1/parcels/geojson")
def get_parcels_geojson():
    global CURRENT_GEOJSON
    try:
        if CURRENT_GEOJSON:
            geojson_data = CURRENT_GEOJSON
        else:
            with open(BASE_DIR / "sample_data" / "cadastral_legacy.geojson", "r", encoding="utf-8-sig") as f:
                geojson_data = json.load(f)

        for feature in geojson_data["features"]:
            pid = feature["properties"]["parcel_id"]
            matched = next((r for r in DATA_STORE["records"] if r["parcel_id"] == pid), None)
            if matched:
                feature["properties"]["status"] = matched["status"]
                feature["properties"]["confidence_score"] = matched["confidence_score"]
                feature["properties"]["color"] = "#ef4444" if matched["status"] == "PENDING_REVIEW" else "#22c55e"

        return geojson_data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed loading GeoJSON: {str(e)}")

@app.post("/api/v1/conflicts/resolve")
def resolve_conflict(req: ConflictResolutionRequest):
    for record in DATA_STORE["records"]:
        if record["parcel_id"] == req.parcel_id:
            record["status"] = "SYNCHRONIZED"
            record["conflict_type"] = "NONE"
            record["confidence_score"] = 1.0
            record["audit_notes"] = f"Action: {req.resolution_action} | Notes: {req.audit_notes}"
            return {"status": "success", "message": f"Parcel {req.parcel_id} synchronized."}
    raise HTTPException(status_code=404, detail="Parcel not found")
