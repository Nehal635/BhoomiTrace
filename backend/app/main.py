from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pathlib import Path
import json
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
GEOJSON_PATH = BASE_DIR / "sample_data" / "cadastral_legacy.geojson"

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
    """Resets the in-memory data store to initial conflicting test state."""
    DATA_STORE["records"] = run_harmonization()
    return {
        "status": "success",
        "message": "Demo reset to conflict state.",
        "records": DATA_STORE["records"]
    }

@app.post("/api/v1/harmonize/run")
def trigger_harmonization():
    DATA_STORE["records"] = run_harmonization()
    return {
        "status": "success",
        "parcels_processed": len(DATA_STORE["records"]),
        "results": DATA_STORE["records"]
    }

@app.get("/api/v1/parcels/geojson")
def get_parcels_geojson():
    try:
        with open(GEOJSON_PATH, "r", encoding="utf-8-sig") as f:
            geojson_data = json.load(f)

        for feature in geojson_data["features"]:
            pid = feature["properties"]["parcel_id"]
            matched = next((r for r in DATA_STORE["records"] if r["parcel_id"] == pid), None)
            if matched:
                feature["properties"]["status"] = matched["status"]
                feature["properties"]["confidence_score"] = matched["confidence_score"]
                feature["properties"]["conflict_type"] = matched["conflict_type"]
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
            record["harmonized_owner"] = req.approved_owner
            record["audit_notes"] = f"Action: {req.resolution_action} | Notes: {req.audit_notes}"
            return {"status": "success", "message": f"Parcel {req.parcel_id} successfully synchronized.", "updated_record": record}

    raise HTTPException(status_code=404, detail="Parcel not found")
