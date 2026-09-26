import json
import geopandas as gpd
import pandas as pd
from rapidfuzz import fuzz
from shapely.geometry import shape

def run_harmonization():
    # 1. Load legacy cadastral GeoJSON
    cadastral_path = "sample_data/cadastral_legacy.geojson"
    gdf = gpd.read_file(cadastral_path)

    # 2. CRS Normalization (EPSG:4326 -> EPSG:3857 for metric spatial calculations)
    if gdf.crs.to_epsg() != 3857:
        gdf = gdf.to_crs(epsg=3857)

    # 3. Load Municipal Tax Table
    tax_df = pd.read_csv("sample_data/municipal_tax.csv")

    results = []

    # 4. Topology Check (Detect Overlaps between adjacent parcels)
    for i, parcel_a in gdf.iterrows():
        pid_a = parcel_a['parcel_id']
        geom_a = parcel_a['geometry']
        owner_cadastral = parcel_a['owner_name']

        # Find matching tax record
        tax_row = tax_df[tax_df['parcel_ref'] == pid_a]
        owner_tax = tax_row.iloc[0]['owner_tax_record'] if not tax_row.empty else "N/A"

        # Attribute Alignment (Fuzzy match ratio: 0 to 100)
        attr_similarity = fuzz.token_sort_ratio(owner_cadastral, owner_tax) / 100.0

        # Spatial conflict check against all other parcels
        overlap_detected = False
        overlap_details = ""
        for j, parcel_b in gdf.iterrows():
            if i != j and geom_a.intersects(parcel_b['geometry']):
                intersection_area = geom_a.intersection(parcel_b['geometry']).area
                if intersection_area > 0.01:
                    overlap_detected = True
                    overlap_details = f"Overlaps with {parcel_b['parcel_id']} by {round(intersection_area, 2)} sq.m"

        # 5. Composite Confidence Scoring Algorithm
        # Weights: 60% Spatial Integrity + 40% Attribute Agreement
        spatial_score = 0.4 if overlap_detected else 1.0
        confidence_score = round((spatial_score * 0.6) + (attr_similarity * 0.4), 2)

        # Triage Flagging
        if confidence_score >= 0.85:
            status = "SYNCHRONIZED"
            conflict_type = "NONE"
        else:
            status = "PENDING_REVIEW"
            if overlap_detected and attr_similarity < 0.90:
                conflict_type = "SPATIAL_AND_ATTRIBUTE_CONFLICT"
            elif overlap_detected:
                conflict_type = "BOUNDARY_OVERLAP"
            else:
                conflict_type = "ATTRIBUTE_MISMATCH"

        results.append({
            "parcel_id": pid_a,
            "cadastral_owner": owner_cadastral,
            "tax_owner": owner_tax,
            "attribute_similarity": round(attr_similarity, 2),
            "confidence_score": confidence_score,
            "status": status,
            "conflict_type": conflict_type,
            "details": overlap_details if overlap_detected else "Consistent geometry"
        })

    return results
