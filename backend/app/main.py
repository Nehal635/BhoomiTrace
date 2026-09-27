from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from pathlib import Path
import json, tempfile, os
import geopandas as gpd
from shapely.geometry import shape, mapping
from geoai.inference import extract_drone_footprints
from backend.app.core.database import SessionLocal, ParcelModel, AuditLogModel

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
AI_FOOTPRINTS_STORE = extract_drone_footprints(str(BASE_DIR / "sample_data" / "drone_ortho_sample.png"))

def init_db_data():
    db = SessionLocal()
    if db.query(ParcelModel).count() == 0:
        with open(BASE_DIR / "sample_data" / "cadastral_legacy.geojson", "r", encoding="utf-8-sig") as f:
            geojson = json.load(f)
        for feat in geojson["features"]:
            props = feat["properties"]
            db.add(ParcelModel(
                parcel_id=props["parcel_id"],
                owner_name=props["owner_name"],
                status="PENDING_REVIEW",
                confidence_score=0.61,
                conflict_type="BOUNDARY_OVERLAP",
                details="Spatial overlap detected with adjacent parcel.",
                geometry_json=json.dumps(feat["geometry"])
            ))
        db.commit()
    db.close()

init_db_data()

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
    return {"status": "healthy", "database": "persisted"}

@app.post("/api/v1/harmonize/reset")
def reset_demo():
    db = SessionLocal()
    db.query(ParcelModel).delete()
    db.query(AuditLogModel).delete()
    db.commit()
    db.close()
    init_db_data()
    return {"status": "success", "message": "Database reset to initial conflicting state."}

@app.get("/api/v1/parcels/geojson")
def get_parcels_geojson():
    db = SessionLocal()
    parcels = db.query(ParcelModel).all()
    features = []
    for p in parcels:
        features.append({
            "type": "Feature",
            "properties": {
                "parcel_id": p.parcel_id,
                "owner_name": p.owner_name,
                "status": p.status,
                "confidence_score": p.confidence_score,
                "conflict_type": p.conflict_type,
                "details": p.details,
                "color": "#ef4444" if p.status == "PENDING_REVIEW" else "#22c55e"
            },
            "geometry": json.loads(p.geometry_json)
        })
    db.close()
    return {"type": "FeatureCollection", "features": features}

@app.post("/api/v1/conflicts/resolve")
def resolve_conflict(req: ConflictResolutionRequest):
    """
    Executes geometric auto-trimming (Boolean difference) to reshape parcel geometry,
    synchronizes status, and logs legal audit action into the database.
    """
    db = SessionLocal()
    parcel = db.query(ParcelModel).filter(ParcelModel.parcel_id == req.parcel_id).first()
    if not parcel:
        db.close()
        raise HTTPException(status_code=404, detail="Parcel not found")

    trimmed_msg = ""
    # Geometric Auto-Trim Engine
    if req.resolution_action == "TRIM_OVERLAP_BOUNDARY":
        try:
            current_geom = shape(json.loads(parcel.geometry_json))
            other_parcels = db.query(ParcelModel).filter(ParcelModel.parcel_id != req.parcel_id).all()

            total_trimmed_sqm = 0.0
            for other in other_parcels:
                other_geom = shape(json.loads(other.geometry_json))
                if current_geom.intersects(other_geom):
                    intersection = current_geom.intersection(other_geom)
                    int_gdf = gpd.GeoSeries([intersection], crs="EPSG:4326").to_crs(epsg=3857)
                    area_sqm = int_gdf.area.iloc[0]
                    if area_sqm > 0.01:
                        total_trimmed_sqm += area_sqm
                        # Subtract overlapping area from current parcel
                        current_geom = current_geom.difference(other_geom)

            if total_trimmed_sqm > 0:
                parcel.geometry_json = json.dumps(mapping(current_geom))
                trimmed_msg = f" Auto-trimmed {round(total_trimmed_sqm, 2)} sq.m overlapping encroachment."
        except Exception as e:
            print(f"Geometric trim error: {e}")

    parcel.status = "SYNCHRONIZED"
    parcel.conflict_type = "NONE"
    parcel.confidence_score = 1.0
    parcel.owner_name = req.approved_owner
    parcel.details = f"Reconciled by official decision.{trimmed_msg}"

    # Record permanent audit log
    log = AuditLogModel(
        parcel_id=req.parcel_id,
        approved_owner=req.approved_owner,
        resolution_action=req.resolution_action,
        audit_notes=f"{req.audit_notes}{trimmed_msg}"
    )
    db.add(log)
    db.commit()
    db.close()
    return {"status": "success", "message": f"Parcel {req.parcel_id} synchronized.{trimmed_msg}"}

@app.get("/api/v1/audit/logs")
def get_audit_logs():
    db = SessionLocal()
    logs = db.query(AuditLogModel).order_by(AuditLogModel.id.desc()).all()
    results = [
        {
            "id": l.id,
            "parcel_id": l.parcel_id,
            "approved_owner": l.approved_owner,
            "resolution_action": l.resolution_action,
            "audit_notes": l.audit_notes,
            "timestamp": l.created_at.strftime("%Y-%m-%d %H:%M:%S UTC")
        }
        for l in logs
    ]
    db.close()
    return {"total_records": len(results), "audit_trail": results}

@app.post("/api/v1/geoai/extract")
def run_geoai_extraction():
    global AI_FOOTPRINTS_STORE
    AI_FOOTPRINTS_STORE = extract_drone_footprints(str(BASE_DIR / "sample_data" / "drone_ortho_sample.png"))
    return {"status": "success", "footprints_detected": len(AI_FOOTPRINTS_STORE["features"]), "data": AI_FOOTPRINTS_STORE}

@app.post("/api/v1/ingest/upload")
async def upload_cadastral_file(file: UploadFile = File(...)):
    try:
        contents = await file.read()
        filename = file.filename.lower()

        if filename.endswith(".zip"):
            with tempfile.NamedTemporaryFile(suffix=".zip", delete=False) as tmp:
                tmp.write(contents)
                tmp_path = tmp.name
            try:
                gdf = gpd.read_file(f"zip://{tmp_path}")
            finally:
                if os.path.exists(tmp_path):
                    os.remove(tmp_path)
            if gdf.crs is None:
                gdf.set_crs(epsg=4326, inplace=True)
            gdf_wgs84 = gdf.to_crs(epsg=4326)

        elif filename.endswith((".geojson", ".json")):
            raw = json.loads(contents.decode("utf-8-sig"))
            gdf_wgs84 = gpd.GeoDataFrame.from_features(raw["features"])
            if gdf_wgs84.crs is None:
                gdf_wgs84.set_crs(epsg=4326, inplace=True, allow_override=True)
        else:
            raise HTTPException(status_code=400, detail="Unsupported format.")

        gdf_metric = gdf_wgs84.to_crs(epsg=3857)

        db = SessionLocal()
        db.query(ParcelModel).delete()

        for i, row in gdf_metric.iterrows():
            pid = str(row.get("parcel_id", row.get("PARCEL_ID", f"P-{i+101}")))
            owner = str(row.get("owner_name", row.get("OWNER_NAME", "Registered Owner")))
            geom_a = row["geometry"]

            overlap = False
            overlap_details = ""
            for j, other in gdf_metric.iterrows():
                if i != j and geom_a.intersects(other["geometry"]):
                    area = geom_a.intersection(other["geometry"]).area
                    if area > 0.01:
                        overlap = True
                        other_pid = str(other.get("parcel_id", other.get("PARCEL_ID", f"P-{j+101}")))
                        overlap_details = f"Overlaps with {other_pid} by {round(area, 2)} sq.m"

            geom_geojson = json.loads(gpd.GeoSeries([gdf_wgs84.iloc[i]["geometry"]]).to_json())["features"][0]["geometry"]

            db.add(ParcelModel(
                parcel_id=pid,
                owner_name=owner,
                status="PENDING_REVIEW" if overlap else "SYNCHRONIZED",
                confidence_score=0.62 if overlap else 0.95,
                conflict_type="BOUNDARY_OVERLAP" if overlap else "NONE",
                details=overlap_details if overlap else "Validated",
                geometry_json=json.dumps(geom_geojson)
            ))

        db.commit()
        db.close()
        return {"status": "success", "parcels_persisted": len(gdf_metric)}

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Ingestion failed: {str(e)}")
