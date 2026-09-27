import React, { useEffect, useState, useRef } from 'react';
import L from 'leaflet';
import axios from 'axios';

function App() {
  const [parcels, setParcels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [baseMapType, setBaseMapType] = useState('satellite');
  const [aiDetectedCount, setAiDetectedCount] = useState(0);

  const [selectedParcel, setSelectedParcel] = useState(null);
  const [resolutionAction, setResolutionAction] = useState('TRIM_OVERLAP_BOUNDARY');
  const [auditNotes, setAuditNotes] = useState('Ground survey matched cadastral markers. Boundary overlap clipped.');

  const [showAuditModal, setShowAuditModal] = useState(false);
  const [auditLogs, setAuditLogs] = useState([]);

  const mapRef = useRef(null);
  const tileLayerRef = useRef(null);
  const cadastralLayerRef = useRef(null);
  const aiFootprintLayerRef = useRef(null);
  const fileInputRef = useRef(null);

  const baseMaps = {
    osm: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
  };

  const fetchParcels = async () => {
    try {
      const res = await axios.get('http://localhost:8000/api/v1/parcels/geojson');
      setParcels(res.data.features || []);

      if (mapRef.current) {
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
              <b>Details:</b> ${feature.properties.details}<br/>
              <b>Confidence:</b> ${feature.properties.confidence_score}
            `);
          }
        }).addTo(mapRef.current);

        mapRef.current.fitBounds(cadastralLayerRef.current.getBounds(), { padding: [60, 60] });
      }
      setLoading(false);
    } catch (err) {
      console.error("Error loading GeoJSON", err);
      setLoading(false);
    }
  };

  const runGeoAIExtraction = async () => {
    try {
      const res = await axios.post('http://localhost:8000/api/v1/geoai/extract');
      const footprints = res.data.data;
      setAiDetectedCount(footprints.features.length);

      if (mapRef.current) {
        if (aiFootprintLayerRef.current) mapRef.current.removeLayer(aiFootprintLayerRef.current);
        aiFootprintLayerRef.current = L.geoJSON(footprints, {
          style: { color: '#06b6d4', weight: 2, dashArray: '5, 5', fillOpacity: 0.35 }
        }).addTo(mapRef.current);
      }
      alert(`GeoAI Complete: ${footprints.features.length} building footprints detected.`);
    } catch (err) {
      alert("GeoAI execution failed: " + err.message);
    }
  };

  const fetchAuditLogs = async () => {
    try {
      const res = await axios.get('http://localhost:8000/api/v1/audit/logs');
      setAuditLogs(res.data.audit_trail || []);
      setShowAuditModal(true);
    } catch (err) {
      alert("Failed loading audit logs: " + err.message);
    }
  };

  useEffect(() => {
    if (!mapRef.current) {
      const map = L.map('map-container').setView([28.6141, 77.2095], 18);
      tileLayerRef.current = L.tileLayer(baseMaps.satellite, { attribution: 'ESRI World Imagery' }).addTo(map);
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

  const handleFileUpload = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    try {
      setLoading(true);
      await axios.post('http://localhost:8000/api/v1/ingest/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      alert(`File "${file.name}" ingested successfully!`);
      fetchParcels();
    } catch (err) {
      alert("Upload failed: " + err.message);
      setLoading(false);
    }
  };

  const submitResolution = async () => {
    if (!selectedParcel) return;
    try {
      const res = await axios.post('http://localhost:8000/api/v1/conflicts/resolve', {
        parcel_id: selectedParcel.properties.parcel_id,
        approved_owner: selectedParcel.properties.owner_name,
        resolution_action: resolutionAction,
        audit_notes: auditNotes
      });
      alert(res.data.message);
      setSelectedParcel(null);
      fetchParcels();
    } catch (err) {
      alert("Resolution error: " + err.message);
    }
  };

  const handleResetDemo = async () => {
    try {
      await axios.post('http://localhost:8000/api/v1/harmonize/reset');
      if (aiFootprintLayerRef.current && mapRef.current) {
        mapRef.current.removeLayer(aiFootprintLayerRef.current);
        aiFootprintLayerRef.current = null;
      }
      setAiDetectedCount(0);
      fetchParcels();
    } catch (err) {
      alert("Reset failed: " + err.message);
    }
  };

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
  const pendingCount = parcels.length - synchronizedCount;

  return (
    <div style={{ fontFamily: 'Segoe UI, sans-serif', backgroundColor: '#0f172a', minHeight: '100vh', color: '#f8fafc' }}>
      <header style={{ background: '#1e293b', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #334155' }}>
        <div>
          <h2 style={{ margin: 0, color: '#38bdf8' }}>BhoomiTrace — Intelligent Land Record Harmonization</h2>
          <small style={{ color: '#94a3b8' }}>SIH Problem Statement: SIH26013 | Urban Land Record Management</small>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          <input type="file" ref={fileInputRef} onChange={handleFileUpload} style={{ display: 'none' }} accept=".geojson,.json,.zip" />
          <button onClick={() => fileInputRef.current.click()} style={{ background: '#6366f1', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
            📁 Upload Land File
          </button>
          <button onClick={runGeoAIExtraction} style={{ background: '#0891b2', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
            🤖 Run GeoAI
          </button>
          <button onClick={fetchAuditLogs} style={{ background: '#8b5cf6', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
            📜 Audit Trail
          </button>
          <button onClick={() => switchBasemap(baseMapType === 'satellite' ? 'osm' : 'satellite')} style={{ background: '#475569', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '4px', cursor: 'pointer' }}>
            {baseMapType === 'satellite' ? '🛰️ Satellite' : '🗺️ Map'}
          </button>
          <button onClick={handleResetDemo} style={{ background: '#f59e0b', color: '#0f172a', border: 'none', padding: '8px 14px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
            🔄 Reset
          </button>
          <button onClick={exportGeoJSON} style={{ background: '#10b981', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>
            📥 Export
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
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: pendingCount > 0 ? '#f87171' : '#4ade80' }}>
            {pendingCount > 0 ? "705.81 m² (Active)" : "0.00 m² (Reconciled)"}
          </div>
        </div>
        <div style={{ background: '#1e293b', padding: '12px 16px', borderRadius: '6px', borderLeft: '4px solid #8b5cf6' }}>
          <small style={{ color: '#94a3b8' }}>GEOMETRIC AUTO-TRIM</small>
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#c084fc' }}>Active (Boolean Difference)</div>
        </div>
      </div>

      {/* Main Layout */}
      <div style={{ display: 'flex', padding: '0 24px 24px', gap: '20px' }}>
        <div style={{ flex: 2, background: '#1e293b', borderRadius: '8px', overflow: 'hidden', border: '1px solid #334155' }}>
          <div style={{ padding: '10px 16px', background: '#334155', fontSize: '13px', display: 'flex', justifyContent: 'space-between' }}>
            <span>🗺️ Spatial Cadastral Overlay</span>
            <span><b style={{ color: '#ef4444' }}>■</b> Conflict | <b style={{ color: '#22c55e' }}>■</b> Synchronized | <b style={{ color: '#06b6d4' }}>- -</b> GeoAI Footprint</span>
          </div>
          <div id="map-container" style={{ height: '520px' }}></div>
        </div>

        <div style={{ flex: 1, background: '#1e293b', borderRadius: '8px', border: '1px solid #334155', padding: '16px', maxHeight: '560px', overflowY: 'auto' }}>
          <h3 style={{ margin: '0 0 12px 0', borderBottom: '1px solid #334155', paddingBottom: '8px' }}>Auditing & Conflict Queue</h3>
          {loading && <p>Connecting to database...</p>}
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
              <div style={{ fontSize: '11px', color: '#94a3b8', marginTop: '2px' }}>{p.properties.details}</div>
              {p.properties.status === 'PENDING_REVIEW' && (
                <button
                  onClick={() => setSelectedParcel(p)}
                  style={{ marginTop: '8px', background: '#dc2626', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', width: '100%', fontWeight: 'bold' }}
                >
                  ⚖️ Audit & Auto-Trim Boundary
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Adjudication Modal */}
      {selectedParcel && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: '#1e293b', border: '1px solid #475569', borderRadius: '8px', padding: '24px', width: '480px', maxWidth: '90%' }}>
            <h3 style={{ margin: '0 0 16px', color: '#38bdf8' }}>Official Conflict Adjudication Panel</h3>
            <p style={{ fontSize: '13px', color: '#cbd5e1' }}>
              Resolving parcel <b>{selectedParcel.properties.parcel_id}</b> ({selectedParcel.properties.owner_name})
            </p>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '6px' }}>Adjudication Action</label>
              <select
                value={resolutionAction}
                onChange={(e) => setResolutionAction(e.target.value)}
                style={{ width: '100%', padding: '8px', background: '#0f172a', border: '1px solid #475569', color: '#fff', borderRadius: '4px' }}
              >
                <option value="TRIM_OVERLAP_BOUNDARY">Trim Boundary to Legal Cadastral Line (Auto-Trim Overlap)</option>
                <option value="ACCEPT_DRONE_SURVEY">Accept Newly Extracted Drone Footprint</option>
                <option value="CORRECT_REVENUE_NAME">Update Municipal Record Spelling Typo</option>
                <option value="SCHEDULE_FIELD_INSPECTION">Dispatch Surveyor for Ground Inspection</option>
              </select>
            </div>
            <div style={{ marginBottom: '18px' }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#94a3b8', marginBottom: '6px' }}>Official Audit Remark</label>
              <textarea
                rows="3"
                value={auditNotes}
                onChange={(e) => setAuditNotes(e.target.value)}
                style={{ width: '100%', padding: '8px', background: '#0f172a', border: '1px solid #475569', color: '#fff', borderRadius: '4px', boxSizing: 'border-box' }}
              ></textarea>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => setSelectedParcel(null)} style={{ background: '#475569', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}>Cancel</button>
              <button onClick={submitResolution} style={{ background: '#16a34a', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>Commit Decision</button>
            </div>
          </div>
        </div>
      )}

      {/* Audit History Modal */}
      {showAuditModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: '#1e293b', border: '1px solid #475569', borderRadius: '8px', padding: '24px', width: '700px', maxWidth: '95%', maxHeight: '80vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, color: '#a78bfa' }}>📜 Immutable Legal Audit Trail Log</h3>
              <button onClick={() => setShowAuditModal(false)} style={{ background: '#475569', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer' }}>✕</button>
            </div>
            {auditLogs.length === 0 ? (
              <p style={{ color: '#94a3b8' }}>No official audit decisions committed yet. Resolve a conflict to create the first record.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #475569', color: '#cbd5e1' }}>
                    <th style={{ padding: '8px' }}>Log #</th>
                    <th style={{ padding: '8px' }}>Parcel</th>
                    <th style={{ padding: '8px' }}>Action</th>
                    <th style={{ padding: '8px' }}>Notes</th>
                    <th style={{ padding: '8px' }}>Timestamp</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map(log => (
                    <tr key={log.id} style={{ borderBottom: '1px solid #334155' }}>
                      <td style={{ padding: '8px', color: '#94a3b8' }}>#{log.id}</td>
                      <td style={{ padding: '8px', fontWeight: 'bold', color: '#38bdf8' }}>{log.parcel_id}</td>
                      <td style={{ padding: '8px', color: '#4ade80' }}>{log.resolution_action}</td>
                      <td style={{ padding: '8px', color: '#cbd5e1' }}>{log.audit_notes}</td>
                      <td style={{ padding: '8px', color: '#94a3b8', fontSize: '11px' }}>{log.timestamp}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
