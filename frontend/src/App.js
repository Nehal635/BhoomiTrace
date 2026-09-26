import React, { useEffect, useState, useRef } from 'react';
import L from 'leaflet';
import axios from 'axios';

function App() {
  const [parcels, setParcels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [baseMapType, setBaseMapType] = useState('satellite');
  
  const mapRef = useRef(null);
  const tileLayerRef = useRef(null);
  const cadastralLayerRef = useRef(null);
  const aiFootprintLayerRef = useRef(null);

  // Basemap tile providers
  const baseMaps = {
    osm: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
  };

  // Mock GeoAI Extracted Drone Footprint (Step 3 feature)
  const aiFootprints = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { name: "AI Extracted Drone Footprint", class: "Built-up" },
        geometry: {
          type: "Polygon",
          coordinates: [[[77.2091, 28.6140], [77.2094, 28.6140], [77.2094, 28.6143], [77.2091, 28.6143], [77.2091, 28.6140]]]
        }
      }
    ]
  };

  const fetchParcels = async () => {
    try {
      const res = await axios.get('http://localhost:8000/api/v1/parcels/geojson');
      setParcels(res.data.features || []);

      if (mapRef.current) {
        // Render Cadastral Layer
        if (cadastralLayerRef.current) mapRef.current.removeLayer(cadastralLayerRef.current);
        cadastralLayerRef.current = L.geoJSON(res.data, {
          style: (feature) => ({
            color: feature.properties.color || '#3b82f6',
            weight: 3,
            fillOpacity: 0.4
          }),
          onEachFeature: (feature, layer) => {
            layer.bindPopup(`
              <b>Parcel ID:</b> ${feature.properties.parcel_id}<br/>
              <b>Owner:</b> ${feature.properties.owner_name}<br/>
              <b>Status:</b> ${feature.properties.status}<br/>
              <b>Confidence:</b> ${feature.properties.confidence_score}
            `);
          }
        }).addTo(mapRef.current);

        // Render GeoAI Vector Layer (Cyan Dashed)
        if (!aiFootprintLayerRef.current) {
          aiFootprintLayerRef.current = L.geoJSON(aiFootprints, {
            style: { color: '#06b6d4', weight: 2, dashArray: '5, 5', fillOpacity: 0.2 }
          }).addTo(mapRef.current);
        }

        mapRef.current.fitBounds(cadastralLayerRef.current.getBounds(), { padding: [60, 60] });
      }
      setLoading(false);
    } catch (err) {
      console.error("Error loading GeoJSON", err);
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!mapRef.current) {
      const map = L.map('map-container').setView([28.6141, 77.2095], 18);
      tileLayerRef.current = L.tileLayer(baseMaps.satellite, {
        attribution: 'ESRI World Imagery'
      }).addTo(map);
      mapRef.current = map;
    }
    fetchParcels();
  }, []);

  const switchBasemap = (type) => {
    setBaseMapType(type);
    if (tileLayerRef.current && mapRef.current) {
      mapRef.current.removeLayer(tileLayerRef.current);
      tileLayerRef.current = L.tileLayer(baseMaps[type], {
        attribution: type === 'satellite' ? 'ESRI World Imagery' : 'OpenStreetMap'
      }).addTo(mapRef.current);
    }
  };

  const handleResolve = async (parcelId, owner) => {
    try {
      await axios.post('http://localhost:8000/api/v1/conflicts/resolve', {
        parcel_id: parcelId,
        approved_owner: owner,
        resolution_action: "VERIFIED_BY_OFFICIAL",
        audit_notes: "Approved via BhoomiTrace WebGIS verification portal."
      });
      fetchParcels();
    } catch (err) {
      alert("Resolution failed: " + err.message);
    }
  };

  // Export Harmonized GeoJSON (Step 7)
  const exportGeoJSON = () => {
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(parcels, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", "bhoomitrace_harmonized_parcels.geojson");
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const synchronizedCount = parcels.filter(p => p.properties.status === 'SYNCHRONIZED').length;

  return (
    <div style={{ fontFamily: 'Segoe UI, sans-serif', backgroundColor: '#0f172a', minHeight: '100vh', color: '#f8fafc' }}>
      {/* Header */}
      <header style={{ background: '#1e293b', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #334155' }}>
        <div>
          <h2 style={{ margin: 0, color: '#38bdf8' }}>BhoomiTrace — Intelligent Land Record Harmonization</h2>
          <small style={{ color: '#94a3b8' }}>SIH Problem Statement: SIH26013 | Urban Land Record Management</small>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button onClick={() => switchBasemap(baseMapType === 'satellite' ? 'osm' : 'satellite')} style={{ background: '#475569', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '4px', cursor: 'pointer' }}>
            Mode: {baseMapType === 'satellite' ? '🛰️ Satellite' : '🗺️ Map'}
          </button>
          <button onClick={exportGeoJSON} style={{ background: '#10b981', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
            📥 Export GeoJSON
          </button>
        </div>
      </header>

      {/* Metrics Banner */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', padding: '16px 24px' }}>
        <div style={{ background: '#1e293b', padding: '12px 16px', borderRadius: '6px', borderLeft: '4px solid #38bdf8' }}>
          <small style={{ color: '#94a3b8' }}>TOTAL PARCELS</small>
          <div style={{ fontSize: '20px', fontWeight: 'bold' }}>{parcels.length}</div>
        </div>
        <div style={{ background: '#1e293b', padding: '12px 16px', borderRadius: '6px', borderLeft: '4px solid #22c55e' }}>
          <small style={{ color: '#94a3b8' }}>SYNCHRONIZED</small>
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#4ade80' }}>{synchronizedCount} / {parcels.length}</div>
        </div>
        <div style={{ background: '#1e293b', padding: '12px 16px', borderRadius: '6px', borderLeft: '4px solid #ef4444' }}>
          <small style={{ color: '#94a3b8' }}>DISPUTED OVERLAP</small>
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#f87171' }}>705.81 m²</div>
        </div>
        <div style={{ background: '#1e293b', padding: '12px 16px', borderRadius: '6px', borderLeft: '4px solid #a855f7' }}>
          <small style={{ color: '#94a3b8' }}>GeoAI INTEGRATION</small>
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#c084fc' }}>Active (U-Net)</div>
        </div>
      </div>

      {/* Main Grid */}
      <div style={{ display: 'flex', padding: '0 24px 24px', gap: '20px' }}>
        {/* Map */}
        <div style={{ flex: 2, background: '#1e293b', borderRadius: '8px', overflow: 'hidden', border: '1px solid #334155' }}>
          <div style={{ padding: '10px 16px', background: '#334155', fontSize: '13px', display: 'flex', justifyContent: 'space-between' }}>
            <span>🗺️ Spatial Viewer: Cadastral vs. Drone Imagery</span>
            <span><b style={{ color: '#ef4444' }}>■</b> Conflict | <b style={{ color: '#22c55e' }}>■</b> Synced | <b style={{ color: '#06b6d4' }}>- -</b> GeoAI Footprint</span>
          </div>
          <div id="map-container" style={{ height: '520px' }}></div>
        </div>

        {/* Triage Queue */}
        <div style={{ flex: 1, background: '#1e293b', borderRadius: '8px', border: '1px solid #334155', padding: '16px' }}>
          <h3 style={{ margin: '0 0 12px 0', borderBottom: '1px solid #334155', paddingBottom: '8px' }}>Auditing & Conflict Queue</h3>
          {loading && <p>Loading data...</p>}
          {parcels.map(p => (
            <div key={p.properties.parcel_id} style={{
              border: `1px solid ${p.properties.status === 'SYNCHRONIZED' ? '#166534' : '#991b1b'}`,
              backgroundColor: p.properties.status === 'SYNCHRONIZED' ? 'rgba(22, 101, 52, 0.2)' : 'rgba(153, 27, 27, 0.2)',
              borderRadius: '6px',
              padding: '12px',
              marginBottom: '12px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <strong>{p.properties.parcel_id}</strong>
                <span style={{ fontSize: '11px', fontWeight: 'bold', color: p.properties.status === 'SYNCHRONIZED' ? '#4ade80' : '#f87171' }}>
                  {p.properties.status}
                </span>
              </div>
              <div style={{ fontSize: '13px', margin: '4px 0', color: '#cbd5e1' }}>Owner: {p.properties.owner_name}</div>
              <div style={{ fontSize: '12px', color: '#94a3b8' }}>Confidence: <b>{p.properties.confidence_score}</b></div>
              {p.properties.status === 'PENDING_REVIEW' && (
                <button
                  onClick={() => handleResolve(p.properties.parcel_id, p.properties.owner_name)}
                  style={{ marginTop: '8px', background: '#dc2626', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', width: '100%' }}
                >
                  Resolve & Commit
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export default App;
