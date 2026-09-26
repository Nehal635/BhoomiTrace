CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE IF NOT EXISTS cadastral_parcels (
    id SERIAL PRIMARY KEY,
    parcel_id VARCHAR(50) UNIQUE NOT NULL,
    owner_name VARCHAR(100),
    area_sqm NUMERIC,
    geom GEOMETRY(MultiPolygon, 3857)
);

CREATE TABLE IF NOT EXISTS extracted_features (
    id SERIAL PRIMARY KEY,
    feature_type VARCHAR(50),
    confidence_score FLOAT,
    geom GEOMETRY(MultiPolygon, 3857)
);

CREATE TABLE IF NOT EXISTS municipal_tax_records (
    id SERIAL PRIMARY KEY,
    tax_id VARCHAR(50) UNIQUE NOT NULL,
    parcel_ref VARCHAR(50),
    owner_tax_record VARCHAR(100),
    tax_status VARCHAR(20)
);

CREATE TABLE IF NOT EXISTS harmonized_records (
    id SERIAL PRIMARY KEY,
    parcel_id VARCHAR(50),
    harmonized_owner VARCHAR(100),
    confidence_score FLOAT,
    status VARCHAR(30) DEFAULT 'PENDING_REVIEW',
    conflict_type VARCHAR(50),
    geom GEOMETRY(MultiPolygon, 3857),
    audit_notes TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_cadastral_geom ON cadastral_parcels USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_extracted_geom ON extracted_features USING GIST(geom);
CREATE INDEX IF NOT EXISTS idx_harmonized_geom ON harmonized_records USING GIST(geom);
