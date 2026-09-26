import React, { useEffect, useState, useRef } from 'react';
import L from 'leaflet';
import axios from 'axios';

function App() {
  const [parcels, setParcels] = useState([]);
  const [loading, setLoading] = useState(true);
  const mapRef = useRef(null);
  const geojsonLayerRef = useRef(null);

  // Fetch GeoJSON with conflict statuses from FastAPI backend
  const fetchParcels = async () => {
    try {
      const res = await axios.get('http://localhost:8000/api/v1/parcels/geojson');
      setParcels(res.data.features || []);
      
      if (mapRef.current) {
        if (geojsonLayerRef.current) {
          mapRef.current.removeLayer(geojsonLayerRef.current);
        }
        geojsonLayerRef.current = L.geoJSON(res.data, {
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
              <b>Score:</b> ${feature.properties.confidence_score}
            `);
          }
        }).addTo(mapRef.current);
        
        mapRef.current.fitBounds(geojsonLayerRef.current.getBounds(), { padding: [50, 50] });
      }
      setLoading(false);
    } catch (err) {
      console.error("Error loading GeoJSON", err);
      setLoading(false);
    }
  };

  useEffect(() => {
    // Initialize Leaflet Map
    if (!mapRef.current) {
      const map = L.map('map-container').setView([28.6141, 77.2095], 17);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors'
      }).addTo(map);
      mapRef.current = map;
    }

    fetchParcels();
  }, []);

  // Quick Resolve Action
  const handleResolve = async (parcelId, owner) => {
    try {
      await axios.post('http://localhost:8000/api/v1/conflicts/resolve', {
        parcel_id: parcelId,
        approved_owner: owner,
        resolution_action: "VERIFIED_BY_OFFICIAL",
        audit_notes: "Approved via WebGIS verification portal."
      });
      fetchParcels(); // Refresh map
    } catch (err) {
      alert("Resolution failed: " + err.message);
    }
  };

  return (
    <div style={{ fontFamily: 'Segoe UI, sans-serif', backgroundColor: '#f8fafc', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header style={{ background: '#0f172a', color: '#fff', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ margin: 0 }}>BhoomiTrace - WebGIS Harmonization Dashboard</h2>
          <small style={{ color: '#94a3b8' }}>SIH26013 | Automated Integration of Urban Land Records</small>
        </div>
        <button onClick={fetchParcels} style={{ background: '#3b82f6', border: 'none', color: '#fff', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}>
          Refresh Layers
        </button>
      </header>

      <div style={{ display: 'flex', flex: 1, padding: '20px', gap: '20px' }}>
        {/* WebGIS Map Container */}
        <div style={{ flex: 2, background: '#fff', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #e2e8f0', fontWeight: 'bold' }}>
            Interactive Spatial Cadastral Overlay (Red: Conflict | Green: Synchronized)
          </div>
          <div id="map-container" style={{ flex: 1, minHeight: '550px' }}></div>
        </div>

        {/* Conflict Triage Queue Panel */}
        <div style={{ flex: 1, background: '#fff', borderRadius: '8px', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', padding: '16px' }}>
          <h3 style={{ marginTop: 0, borderBottom: '2px solid #e2e8f0', paddingBottom: '8px' }}>Conflict Audit & Triage Queue</h3>
          {loading && <p>Loading parcels from FastAPI...</p>}
          {parcels.map(p => (
            <div key={p.properties.parcel_id} style={{
              border: `1px solid ${p.properties.status === 'SYNCHRONIZED' ? '#bbf7d0' : '#fecaca'}`,
              backgroundColor: p.properties.status === 'SYNCHRONIZED' ? '#f0fdf4' : '#fef2f2',
              borderRadius: '6px',
              padding: '12px',
              marginBottom: '12px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <strong>Parcel: {p.properties.parcel_id}</strong>
                <span style={{
                  fontSize: '12px',
                  fontWeight: 'bold',
                  color: p.properties.status === 'SYNCHRONIZED' ? '#166534' : '#991b1b'
                }}>
                  {p.properties.status}
                </span>
              </div>
              <p style={{ margin: '6px 0', fontSize: '13px' }}>Owner: {p.properties.owner_name}</p>
              <p style={{ margin: '4px 0', fontSize: '12px', color: '#64748b' }}>
                Confidence Score: <b>{p.properties.confidence_score}</b>
              </p>
              {p.properties.status === 'PENDING_REVIEW' && (
                <button
                  onClick={() => handleResolve(p.properties.parcel_id, p.properties.owner_name)}
                  style={{ marginTop: '8px', background: '#dc2626', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
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
