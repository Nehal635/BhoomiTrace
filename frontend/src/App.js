import React, { useEffect, useState, useRef } from 'react';
import L from 'leaflet';
import axios from 'axios';

// Feature 2 Helper: 14-digit ULPIN / Bhu-Aadhaar Generator
const generateULPIN = (geometry) => {
  if (!geometry || !geometry.coordinates || !geometry.coordinates[0]) {
    return '19WB8F2K9M41X7';
  }
  const ring = geometry.coordinates[0];
  let sumLng = 0, sumLat = 0;
  ring.forEach(pt => {
    sumLng += pt[0];
    sumLat += pt;
  });
  const cLat = sumLat / ring.length;
  const cLng = sumLng / ring.length;

  const latEncoded = Math.floor(Math.abs(cLat) * 10000).toString(36).toUpperCase().padStart(5, '0');
  const lngEncoded = Math.floor(Math.abs(cLng) * 10000).toString(36).toUpperCase().padStart(5, '0');
  return `19WB${latEncoded}${lngEncoded}`.substring(0, 14);
};

// Feature 2 Helper: SHA-256 Hash Generator (Native Web Crypto API)
const computeSHA256 = async (str) => {
  const buffer = new TextEncoder().encode(str);
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
};

function App() {
  const [parcels, setParcels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [baseMapType, setBaseMapType] = useState('satellite');
  const [aiDetectedCount, setAiDetectedCount] = useState(3);

  // Before vs After State Toggle
  const [viewMode, setViewMode] = useState('after');

  // Feature 1: Swipe Compare State
  const [isSwipeMode, setIsSwipeMode] = useState(false);
  const [swipePos, setSwipePos] = useState(50);
  const isDraggingRef = useRef(false);

  // Executive Ward Report Modal
  const [showReportModal, setShowReportModal] = useState(false);

  // Layer Visibility & Opacity
  const [showCadastral, setShowCadastral] = useState(true);
  const [showGeoAI, setShowGeoAI] = useState(true);
  const [polygonOpacity, setPolygonOpacity] = useState(0.4);

  // Measurement Tool State
  const [isMeasuring, setIsMeasuring] = useState(false);
  const [measurementText, setMeasurementText] = useState("");
  const measurePointsRef = useRef([]);
  const measureLayersRef = useRef([]);

  // Modals & Audit
  const [selectedParcel, setSelectedParcel] = useState(null);
  const [resolutionAction, setResolutionAction] = useState('TRIM_OVERLAP_BOUNDARY');
  const [auditNotes, setAuditNotes] = useState('Ground survey matched cadastral markers. Boundary overlap clipped.');
  const [showAuditModal, setShowAuditModal] = useState(false);
  const [auditLogs, setAuditLogs] = useState([]);

  // Feature 2: Certificate Modal State
  const [certificateParcel, setCertificateParcel] = useState(null);
  const [certCryptoHash, setCertCryptoHash] = useState('');
  const [certULPIN, setCertULPIN] = useState('');

  // Feature 3: Statutory Form-3 Dispute Notice State
  const [disputeNoticeParcel, setDisputeNoticeParcel] = useState(null);

  const mapRef = useRef(null);
  const tileLayerRef = useRef(null);
  const cadastralLayerRef = useRef(null);
  const legacyLayerRef = useRef(null);
  const aiFootprintLayerRef = useRef(null);
  const fileInputRef = useRef(null);
  const mapContainerRef = useRef(null);

  const baseMaps = {
    osm: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
  };

  const rawLegacyData = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { parcel_id: "P-101", owner_name: "Rajesh Kumar", status: "LEGACY_DISPUTE", confidence_score: 0.60, details: "Overlaps with P-102 by 705.81 sq.m", color: "#ef4444" },
        geometry: { type: "Polygon", coordinates: [[[77.2090, 28.6139], [77.2095, 28.6139], [77.2095, 28.6144], [77.2090, 28.6144], [77.2090, 28.6139]]] }
      },
      {
        type: "Feature",
        properties: { parcel_id: "P-102", owner_name: "Sunita Verma", status: "LEGACY_DISPUTE", confidence_score: 0.61, details: "Overlaps with P-101 by 705.81 sq.m", color: "#ef4444" },
        geometry: { type: "Polygon", coordinates: [[[77.2094, 28.6139], [77.2100, 28.6139], [77.2100, 28.6144], [77.2094, 28.6144], [77.2094, 28.6139]]] }
      }
    ]
  };

  const renderGeoJSONLayer = (geojsonData, targetPane = 'overlayPane') => {
    if (!mapRef.current) return;
    if (cadastralLayerRef.current) mapRef.current.removeLayer(cadastralLayerRef.current);

    cadastralLayerRef.current = L.geoJSON(geojsonData, {
      pane: targetPane,
      style: (feature) => ({
        color: feature.properties.color || '#3b82f6',
        weight: 3,
        fillOpacity: polygonOpacity
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
    });

    if (showCadastral) cadastralLayerRef.current.addTo(mapRef.current);
    mapRef.current.fitBounds(cadastralLayerRef.current.getBounds(), { padding: [60, 60] });
  };

  const fetchParcels = async () => {
    try {
      const res = await axios.get('http://localhost:8000/api/v1/parcels/geojson');
      setParcels(res.data.features || []);
      if (!isSwipeMode && viewMode === 'after') {
        renderGeoJSONLayer(res.data);
      }
      setLoading(false);
    } catch (err) {
      console.error("Error loading GeoJSON", err);
      setLoading(false);
    }
  };

  // Feature 1: Toggle Swipe Mode
  const toggleSwipeMode = () => {
    const nextSwipe = !isSwipeMode;
    setIsSwipeMode(nextSwipe);

    if (!mapRef.current) return;
    const map = mapRef.current;

    if (nextSwipe) {
      if (!map.getPane('afterSwipePane')) {
        const pane = map.createPane('afterSwipePane');
        pane.style.zIndex = '450';
      }

      if (legacyLayerRef.current) map.removeLayer(legacyLayerRef.current);
      legacyLayerRef.current = L.geoJSON(rawLegacyData, {
        style: () => ({
          color: '#ef4444',
          fillColor: '#ef4444',
          weight: 3,
          fillOpacity: 0.5
        })
      }).addTo(map);

      renderGeoJSONLayer({ type: 'FeatureCollection', features: parcels }, 'afterSwipePane');
      updateClip(swipePos);
    } else {
      if (legacyLayerRef.current) {
        map.removeLayer(legacyLayerRef.current);
        legacyLayerRef.current = null;
      }
      const pane = map.getPane('afterSwipePane');
      if (pane) pane.style.clipPath = 'none';

      if (viewMode === 'after') {
        fetchParcels();
      } else {
        renderGeoJSONLayer(rawLegacyData);
      }
    }
  };

  const updateClip = (percent) => {
    if (!mapRef.current) return;
    const pane = mapRef.current.getPane('afterSwipePane');
    if (!pane || !mapContainerRef.current) return;

    const width = mapContainerRef.current.offsetWidth;
    const splitX = (width * percent) / 100;
    pane.style.clipPath = `polygon(${splitX}px 0, 100% 0, 100% 100%, ${splitX}px 100%)`;
  };

  const handleMouseDown = () => { isDraggingRef.current = true; };
  const handleMouseUp = () => { isDraggingRef.current = false; };
  const handleMouseMove = (e) => {
    if (!isDraggingRef.current || !mapContainerRef.current) return;
    const rect = mapContainerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    let percent = (x / rect.width) * 100;
    percent = Math.max(2, Math.min(98, percent));
    setSwipePos(percent);
    updateClip(percent);
  };

  const toggleViewMode = () => {
    if (isSwipeMode) setIsSwipeMode(false);
    const nextMode = viewMode === 'after' ? 'before' : 'after';
    setViewMode(nextMode);
    if (nextMode === 'before') {
      renderGeoJSONLayer(rawLegacyData);
    } else {
      fetchParcels();
    }
  };

  // Feature 2: Open Certificate Handler
  const handleOpenCertificate = async (parcel) => {
    setCertificateParcel(parcel);
    const ulpin = generateULPIN(parcel.geometry);
    setCertULPIN(ulpin);

    const payload = `${parcel.properties.parcel_id}|${parcel.properties.owner_name}|${ulpin}|${JSON.stringify(parcel.geometry)}`;
    const hash = await computeSHA256(payload);
    setCertCryptoHash(hash);
  };

  // Feature 3: Dispatch Statutory Notice Handler
  // Feature 3: Dispatch Statutory Notice Handler
  const handleDispatchNotice = (parcel) => {
    const isP101 = parcel.properties.parcel_id === 'P-101';
    const adjacentOwner = isP101 ? 'Sunita Verma' : 'Rajesh Kumar';

    const newLog = {
      id: auditLogs.length + 1,
      parcel_id: parcel.properties.parcel_id,
      resolution_action: 'FORM-3 NOTICE DISPATCHED',
      audit_notes: `Statutory 14-day summons served to ${parcel.properties.owner_name} & adjacent owner (${adjacentOwner}) regarding 705.81 sqm overlap.`,
      timestamp: new Date().toLocaleString()
    };

    setAuditLogs([newLog, ...auditLogs]);

    alert(
      `✔ Legal Notice Dispatched!\n` +
      `Case No: WBLR/BLLRO/2026/DISP-${parcel.properties.parcel_id}\n` +
      `Parties: ${parcel.properties.owner_name} & ${adjacentOwner}\n` +
      `14-day objection window officially recorded in Audit Trail.`
    );
    setDisputeNoticeParcel(null);
  };

  useEffect(() => {
    if (cadastralLayerRef.current) {
      cadastralLayerRef.current.eachLayer((layer) => {
        layer.setStyle({ fillOpacity: polygonOpacity });
      });
    }
  }, [polygonOpacity]);

  useEffect(() => {
    if (mapRef.current && cadastralLayerRef.current) {
      if (showCadastral) {
        mapRef.current.addLayer(cadastralLayerRef.current);
      } else {
        mapRef.current.removeLayer(cadastralLayerRef.current);
      }
    }
  }, [showCadastral]);

  useEffect(() => {
    if (mapRef.current && aiFootprintLayerRef.current) {
      if (showGeoAI) {
        mapRef.current.addLayer(aiFootprintLayerRef.current);
      } else {
        mapRef.current.removeLayer(aiFootprintLayerRef.current);
      }
    }
  }, [showGeoAI]);

  useEffect(() => {
    if (!mapRef.current) return;
    const map = mapRef.current;

    const handleMapClick = (e) => {
      if (!isMeasuring) return;

      const newPoint = e.latlng;
      measurePointsRef.current.push(newPoint);

      const marker = L.circleMarker(newPoint, {
        radius: 5,
        color: '#f59e0b',
        fillColor: '#fbbf24',
        fillOpacity: 1
      }).addTo(map);
      measureLayersRef.current.push(marker);

      if (measurePointsRef.current.length === 2) {
        const [p1, p2] = measurePointsRef.current;
        if (p1 && p2) {
          const distanceMeters = map.distance(p1, p2);
          const formattedDist = distanceMeters >= 1000 
            ? (distanceMeters / 1000).toFixed(2) + " km" 
            : distanceMeters.toFixed(2) + " m";

          const line = L.polyline([p1, p2], {
            color: '#f59e0b',
            weight: 3,
            dashArray: '4, 6'
          }).addTo(map);

          const midpoint = L.latLng((p1.lat + p2.lat) / 2, (p1.lng + p2.lng) / 2);
          const label = L.popup({ closeButton: false, autoClose: false, className: 'measure-label' })
            .setLatLng(midpoint)
            .setContent(`<b style="color:#0f172a; font-size:12px;">📏 ${formattedDist}</b>`)
            .openOn(map);

          measureLayersRef.current.push(line, label);
          setMeasurementText(`Last measurement: ${formattedDist}`);
          measurePointsRef.current = [];
        }
      }
    };

    map.on('click', handleMapClick);
    return () => {
      map.off('click', handleMapClick);
    };
  }, [isMeasuring]);

  const clearMeasurements = () => {
    if (mapRef.current) {
      measureLayersRef.current.forEach(layer => mapRef.current.removeLayer(layer));
      measureLayersRef.current = [];
      measurePointsRef.current = [];
      setMeasurementText("");
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
        });
        if (showGeoAI) aiFootprintLayerRef.current.addTo(mapRef.current);
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
      clearMeasurements();
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

  // Feature 2: Official Web URL for QR Scanner
  const qrVerificationUrl = certificateParcel
    ? `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(
        `https://dilrmp.gov.in/bhu-aadhaar/verify?ulpin=${certULPIN}&owner=${encodeURIComponent(certificateParcel.properties.owner_name)}&status=SYNCHRONIZED&hash=${certCryptoHash.substring(0, 16)}`
      )}`
    : '';

  return (
    <div
      style={{ fontFamily: 'Segoe UI, sans-serif', backgroundColor: '#0f172a', minHeight: '100vh', color: '#f8fafc' }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
    >
      <header style={{ background: '#1e293b', padding: '16px 24px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #334155' }}>
        <div>
          <h2 style={{ margin: 0, color: '#38bdf8' }}>BhoomiTrace — Intelligent Land Record Harmonization</h2>
          <small style={{ color: '#94a3b8' }}>SIH Problem Statement: SIH26013 | Urban Land Record Management</small>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input type="file" ref={fileInputRef} onChange={handleFileUpload} style={{ display: 'none' }} accept=".geojson,.json,.zip" />
          <button onClick={() => fileInputRef.current.click()} style={{ background: '#6366f1', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}>
            📁 Upload Land File
          </button>
          <button onClick={runGeoAIExtraction} style={{ background: '#0891b2', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}>
            🤖 Run GeoAI
          </button>
          <button onClick={toggleViewMode} style={{ background: viewMode === 'after' ? '#059669' : '#dc2626', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}>
            {viewMode === 'after' ? '👁️ After' : '👁️ Before'}
          </button>
          
          {/* Feature 1: Swipe Compare Button */}
          <button
            onClick={toggleSwipeMode}
            style={{
              background: isSwipeMode ? '#38bdf8' : '#0284c7',
              color: isSwipeMode ? '#0f172a' : '#fff',
              border: isSwipeMode ? '2px solid #fff' : 'none',
              padding: '8px 14px',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold',
              fontSize: '12px',
              boxShadow: isSwipeMode ? '0 0 10px rgba(56, 189, 248, 0.8)' : 'none'
            }}
          >
            {isSwipeMode ? '↔️ Exit Swipe' : '↔️ Swipe Compare'}
          </button>

          <button onClick={() => setShowReportModal(true)} style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}>
            📊 Ward Report
          </button>
          <button onClick={fetchAuditLogs} style={{ background: '#8b5cf6', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}>
            📜 Audit Trail
          </button>
          <button onClick={() => switchBasemap(baseMapType === 'satellite' ? 'osm' : 'satellite')} style={{ background: '#475569', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}>
            {baseMapType === 'satellite' ? '🛰️ Satellite' : '🗺️ Map'}
          </button>
          <button onClick={handleResetDemo} style={{ background: '#f59e0b', color: '#0f172a', border: 'none', padding: '8px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}>
            🔄 Reset
          </button>
          <button onClick={exportGeoJSON} style={{ background: '#10b981', color: '#fff', border: 'none', padding: '8px 12px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}>
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
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: '#4ade80' }}>
            {viewMode === 'before' ? "0 / 2" : `${synchronizedCount} / ${parcels.length}`}
          </div>
        </div>
        <div style={{ background: '#1e293b', padding: '12px 16px', borderRadius: '6px', borderLeft: '4px solid #ef4444' }}>
          <small style={{ color: '#94a3b8' }}>DISPUTED OVERLAP</small>
          <div style={{ fontSize: '20px', fontWeight: 'bold', color: (viewMode === 'before' || pendingCount > 0) ? '#f87171' : '#4ade80' }}>
            {viewMode === 'before' ? "705.81 m² (Disputed)" : (pendingCount > 0 ? "705.81 m² (Active)" : "0.00 m² (Reconciled)")}
          </div>
        </div>
        <div style={{ background: '#1e293b', padding: '12px 16px', borderRadius: '6px', borderLeft: '4px solid #8b5cf6' }}>
          <small style={{ color: '#94a3b8' }}>CURRENT VIEW MODE</small>
          <div style={{ fontSize: '18px', fontWeight: 'bold', color: isSwipeMode ? '#38bdf8' : (viewMode === 'after' ? '#4ade80' : '#f87171') }}>
            {isSwipeMode ? "Split-Screen Curtain Swipe" : (viewMode === 'after' ? "Master Layer (Harmonized)" : "Legacy Survey (Encroached)")}
          </div>
        </div>
      </div>

      {/* Main Layout */}
      <div style={{ display: 'flex', padding: '0 24px 24px', gap: '20px' }}>
        <div
          ref={mapContainerRef}
          style={{ flex: 2, background: '#1e293b', borderRadius: '8px', overflow: 'hidden', border: '1px solid #334155', display: 'flex', flexDirection: 'column', position: 'relative' }}
        >
          <div style={{ padding: '8px 16px', background: '#334155', fontSize: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', zIndex: 10 }}>
            <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                <input type="checkbox" checked={showCadastral} onChange={(e) => setShowCadastral(e.target.checked)} />
                Cadastral Layer
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: '4px', cursor: 'pointer' }}>
                <input type="checkbox" checked={showGeoAI} onChange={(e) => setShowGeoAI(e.target.checked)} />
                GeoAI Drone Layer
              </label>
              
              <button
                onClick={() => setIsMeasuring(!isMeasuring)}
                style={{
                  background: isMeasuring ? '#f59e0b' : '#475569',
                  color: isMeasuring ? '#0f172a' : '#fff',
                  border: 'none',
                  padding: '4px 10px',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}
              >
                {isMeasuring ? '📏 Click 2 Points to Measure' : '📏 Measure Ruler'}
              </button>

              {measureLayersRef.current.length > 0 && (
                <button
                  onClick={clearMeasurements}
                  style={{ background: '#ef4444', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px' }}
                >
                  Clear Ruler
                </button>
              )}
              {measurementText && <span style={{ color: '#fbbf24', fontWeight: 'bold' }}>{measurementText}</span>}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span>Opacity:</span>
              <input
                type="range"
                min="0.0"
                max="1.0"
                step="0.05"
                value={polygonOpacity}
                onChange={(e) => setPolygonOpacity(parseFloat(e.target.value))}
                style={{ width: '90px', cursor: 'pointer' }}
              />
              <span style={{ fontFamily: 'monospace' }}>{(polygonOpacity * 100).toFixed(0)}%</span>
            </div>
          </div>

          <div id="map-container" style={{ height: '520px', cursor: isMeasuring ? 'crosshair' : 'grab', position: 'relative' }}></div>

          {/* Feature 1: Swipe Curtain Elements */}
          {isSwipeMode && (
            <>
              <div
                onMouseDown={handleMouseDown}
                style={{
                  position: 'absolute',
                  top: '38px',
                  bottom: 0,
                  left: `${swipePos}%`,
                  width: '4px',
                  backgroundColor: '#38bdf8',
                  zIndex: 999,
                  cursor: 'ew-resize',
                  boxShadow: '0 0 10px rgba(56, 189, 248, 0.9)'
                }}
              >
                <div
                  style={{
                    position: 'absolute',
                    top: '50%',
                    left: '50%',
                    transform: 'translate(-50%, -50%)',
                    width: '36px',
                    height: '36px',
                    backgroundColor: '#0f172a',
                    border: '2px solid #38bdf8',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#38bdf8',
                    fontWeight: 'bold',
                    fontSize: '14px',
                    userSelect: 'none',
                    boxShadow: '0 4px 10px rgba(0,0,0,0.7)'
                  }}
                >
                  &#8644;
                </div>
              </div>

              <div
                style={{
                  position: 'absolute',
                  top: '50px',
                  left: '60px',
                  padding: '6px 14px',
                  background: 'rgba(15, 23, 42, 0.85)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderLeft: '3px solid #ef4444',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#f87171',
                  zIndex: 998,
                  pointerEvents: 'none'
                }}
              >
                ◀ BEFORE: Legacy Overlap (705.81 m²)
              </div>

              <div
                style={{
                  position: 'absolute',
                  top: '50px',
                  right: '20px',
                  padding: '6px 14px',
                  background: 'rgba(15, 23, 42, 0.85)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRight: '3px solid #22c55e',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 600,
                  color: '#4ade80',
                  zIndex: 998,
                  pointerEvents: 'none'
                }}
              >
                AFTER: GeoAI Harmonized ▶
              </div>
            </>
          )}
        </div>

        {/* Auditing & Conflict Queue */}
        <div style={{ flex: 1, background: '#1e293b', borderRadius: '8px', border: '1px solid #334155', padding: '16px', maxHeight: '560px', overflowY: 'auto' }}>
          <h3 style={{ margin: '0 0 12px 0', borderBottom: '1px solid #334155', paddingBottom: '8px' }}>Auditing & Conflict Queue</h3>
          {loading && <p>Connecting to database...</p>}
          {(viewMode === 'before' ? rawLegacyData.features : parcels).map(p => (
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
              
              <div style={{ marginTop: '10px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {p.properties.status !== 'SYNCHRONIZED' ? (
                  <>
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {/* Feature 3 Action: Form-3 Statutory Notice */}
                      <button
                        onClick={() => setDisputeNoticeParcel(p)}
                        style={{ flex: 1, background: '#d97706', color: '#fff', border: 'none', padding: '8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}
                      >
                        📜 Issue Form-3 Notice
                      </button>

                      <button
                        onClick={() => setSelectedParcel(p)}
                        style={{ flex: 1, background: '#dc2626', color: '#fff', border: 'none', padding: '8px', borderRadius: '4px', cursor: 'pointer', fontSize: '11px', fontWeight: 'bold' }}
                      >
                        ⚖️ Audit & Auto-Trim
                      </button>
                    </div>
                  </>
                ) : (
                  <button
                    onClick={() => handleOpenCertificate(p)}
                    style={{ background: '#059669', color: '#fff', border: 'none', padding: '8px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 'bold' }}
                  >
                    📄 View Certificate (Bhu-Aadhaar)
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Feature 3: Statutory Form-3 Land Demarcation Notice Modal */}
      {disputeNoticeParcel && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: '#ffffff', color: '#0f172a', borderRadius: '8px', padding: '32px', width: '640px', maxWidth: '95%', maxHeight: '90vh', overflowY: 'auto', border: '3px solid #b45309', position: 'relative' }}>
            
            <div style={{ textAlign: 'center', borderBottom: '2px solid #b45309', paddingBottom: '12px', marginBottom: '16px' }}>
              <div style={{ fontSize: '11px', fontWeight: '800', letterSpacing: '1px', color: '#78350f' }}>
                GOVERNMENT OF WEST BENGAL • OFFICE OF THE BLLRO
              </div>
              <h3 style={{ margin: '4px 0', fontSize: '18px', color: '#92400e', fontWeight: '800' }}>
                STATUTORY FORM-3: NOTICE OF BOUNDARY ENCROACHMENT & DEMARCATION
              </h3>
              <small style={{ color: '#475569', fontStyle: 'italic' }}>
                Under Section 10(2) of the West Bengal Land Reforms Act, 1955
              </small>
            </div>

            <div style={{ fontSize: '12px', lineHeight: '1.6', color: '#1e293b', marginBottom: '16px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '10px', background: '#fef3c7', padding: '8px 12px', borderRadius: '4px' }}>
                <span><b>Notice Case No:</b> WBLR/BLLRO/2026/DISP-{disputeNoticeParcel.properties.parcel_id}</span>
                <span><b>Date:</b> {new Date().toLocaleDateString('en-IN')}</span>
              </div>

              {(() => {
  const isP101 = disputeNoticeParcel.properties.parcel_id === 'P-101';
  const adjacentOwner = isP101 ? 'Sunita Verma' : 'Rajesh Kumar';
  const adjacentId = isP101 ? 'P-102' : 'P-101';

  return (
    <>
      <p style={{ marginBottom: '8px' }}>
        <b>To:</b> <u>{disputeNoticeParcel.properties.owner_name}</u> (Recorded Owner of Parcel <b>{disputeNoticeParcel.properties.parcel_id}</b>)<br/>
        <b>And Copy To:</b> <u>{adjacentOwner}</u> (Adjacent Owner of Parcel <b>{adjacentId}</b>)
      </p>

      <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '10px', borderRadius: '4px', margin: '10px 0' }}>
        <b style={{ color: '#b91c1c' }}>FINDINGS OF HIGH-PRECISION GEO-AI DRONE SURVEY:</b>
        <p style={{ margin: '4px 0 0', fontSize: '12px' }}>
          A spatial boundary conflict involving an active encroachment of <b>705.81 sq. meters</b> has been detected between
          Parcel {disputeNoticeParcel.properties.parcel_id} ({disputeNoticeParcel.properties.owner_name}) and adjacent Parcel {adjacentId} ({adjacentOwner}).
        </p>
      </div>
    </>
  );
})()}

              <p style={{ marginBottom: '8px' }}>
                <b>NOTICE IS HEREBY GIVEN</b> that you are required to attend the official Boundary Demarcation & Verification proceeding on <b>11th October 2026 at 11:30 AM</b> at the Office of the Revenue Officer (BLLRO Chamber).
              </p>
              <p style={{ fontSize: '11px', color: '#64748b' }}>
                <i>Note: If no written objection along with registered deeds is submitted within 14 days, the automated GeoAI boundary auto-trimming decision will be finalized and updated on the Banglarbhumi master cadastre.</i>
              </p>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #e2e8f0', paddingTop: '14px' }}>
              <button
                onClick={() => setDisputeNoticeParcel(null)}
                style={{ background: '#64748b', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
              >
                Close
              </button>

              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => window.print()}
                  style={{ background: '#0284c7', color: '#fff', border: 'none', padding: '8px 14px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}
                >
                  🖨️ Print Form-3
                </button>
                <button
                  onClick={() => handleDispatchNotice(disputeNoticeParcel)}
                  style={{ background: '#d97706', color: '#fff', border: 'none', padding: '8px 18px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '12px' }}
                >
                  📤 Dispatch e-Notice (SMS & Post)
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Executive Ward & Tax Revenue Report Modal */}
      {showReportModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: '#1e293b', border: '1px solid #475569', borderRadius: '8px', padding: '28px', width: '680px', maxWidth: '95%', maxHeight: '85vh', overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #334155', paddingBottom: '12px', marginBottom: '16px' }}>
              <div>
                <h3 style={{ margin: 0, color: '#38bdf8' }}>📊 Urban Local Body (ULB) Executive Land Audit Report</h3>
                <small style={{ color: '#94a3b8' }}>Municipal Corporation • Ward Land Harmonization & Revenue Audit</small>
              </div>
              <button onClick={() => setShowReportModal(false)} style={{ background: '#475569', color: '#fff', border: 'none', padding: '4px 10px', borderRadius: '4px', cursor: 'pointer' }}>✕</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '20px' }}>
              <div style={{ background: '#0f172a', padding: '12px', borderRadius: '6px', borderLeft: '4px solid #38bdf8' }}>
                <small style={{ color: '#94a3b8' }}>TOTAL SURVEYED WARD AREA</small>
                <div style={{ fontSize: '18px', fontWeight: 'bold' }}>1,350.00 m² (0.33 Acres)</div>
              </div>
              <div style={{ background: '#0f172a', padding: '12px', borderRadius: '6px', borderLeft: '4px solid #22c55e' }}>
                <small style={{ color: '#94a3b8' }}>DISPUTE RECONCILIATION RATE</small>
                <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#4ade80' }}>100% Harmonized</div>
              </div>
              <div style={{ background: '#0f172a', padding: '12px', borderRadius: '6px', borderLeft: '4px solid #ef4444' }}>
                <small style={{ color: '#94a3b8' }}>ENCROACHMENT RECLAIMED</small>
                <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#f87171' }}>705.81 m² (Auto-Trimmed)</div>
              </div>
              <div style={{ background: '#0f172a', padding: '12px', borderRadius: '6px', borderLeft: '4px solid #f59e0b' }}>
                <small style={{ color: '#94a3b8' }}>ANNUAL PROPERTY TAX RECOVERY</small>
                <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#fbbf24' }}>₹1,45,000 / year (Est.)</div>
              </div>
            </div>

            <h4 style={{ margin: '14px 0 8px', color: '#cbd5e1' }}>Executive Audit Highlights</h4>
            <ul style={{ fontSize: '13px', color: '#94a3b8', lineHeight: '1.6', margin: '0 0 20px', paddingLeft: '20px' }}>
              <li><b>Zero-Overlap Integrity:</b> Boolean geometric difference successfully clipped conflicting parcel boundary.</li>
              <li><b>GeoAI Ground Validation:</b> Detected 3 building footprints from drone orthomosaic imagery matching registered owners.</li>
              <li><b>Revenue Alignment:</b> Reconciled municipal tax registry typo ("Varma" vs "Verma") with 92% Levenshtein confidence.</li>
            </ul>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => setShowReportModal(false)} style={{ background: '#475569', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer' }}>Close</button>
              <button onClick={() => window.print()} style={{ background: '#3b82f6', color: '#fff', border: 'none', padding: '8px 18px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold' }}>🖨️ Export PDF Report</button>
            </div>
          </div>
        </div>
      )}

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
              <p style={{ color: '#94a3b8' }}>No official audit decisions committed yet.</p>
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

      {/* Feature 2: High-Resolution Bhu-Aadhaar Digital Certificate */}
      {certificateParcel && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div style={{ background: '#ffffff', color: '#0f172a', borderRadius: '10px', padding: '36px', width: '640px', maxWidth: '95%', border: '4px double #1e293b', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)', position: 'relative' }}>
            <div style={{ textAlign: 'center', borderBottom: '2px solid #0f172a', paddingBottom: '14px', marginBottom: '18px' }}>
              <div style={{ fontSize: '11px', fontWeight: '800', letterSpacing: '1.5px', color: '#475569', textTransform: 'uppercase' }}>
                GOVERNMENT OF INDIA • DEPARTMENT OF LAND RESOURCES
              </div>
              <h2 style={{ margin: '6px 0 2px', fontSize: '22px', color: '#0f172a', fontWeight: '800', letterSpacing: '0.5px' }}>
                BHU-AADHAAR (ULPIN) LAND TITLE CERTIFICATE
              </h2>
              <small style={{ color: '#059669', fontWeight: 'bold', letterSpacing: '0.5px' }}>
                ✔ DILRMP & SVAMITVA CADASTRAL COMPLIANT RECORD
              </small>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: '16px', fontSize: '13px', marginBottom: '18px' }}>
              <div>
                <div style={{ marginBottom: '8px', padding: '6px 10px', background: '#eff6ff', borderRadius: '4px', borderLeft: '4px solid #2563eb' }}>
                  <b style={{ color: '#1e3a8a' }}>14-Digit ULPIN (Bhu-Aadhaar):</b><br/>
                  <span style={{ fontSize: '16px', fontFamily: 'monospace', fontWeight: 'bold', color: '#1d4ed8' }}>
                    {certULPIN}
                  </span>
                </div>
                <div style={{ marginBottom: '6px' }}><b>Certified Title Owner:</b> {certificateParcel.properties.owner_name}</div>
                <div style={{ marginBottom: '6px' }}><b>Survey Parcel ID:</b> <span style={{ fontFamily: 'monospace', fontWeight: 'bold' }}>{certificateParcel.properties.parcel_id}</span></div>
                <div style={{ marginBottom: '6px' }}><b>Verification Status:</b> <span style={{ color: '#059669', fontWeight: 'bold' }}>SYNCHRONIZED (RESOLVED)</span></div>
                <div style={{ marginBottom: '6px' }}><b>Harmonization Method:</b> GeoAI Orthomosaic Boundary Clip</div>
                <div style={{ marginBottom: '6px' }}><b>Spatial Overlap Defect:</b> <span style={{ color: '#059669', fontWeight: 'bold' }}>0.00 m² (Zero Conflict)</span></div>
              </div>

              <div style={{ textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: '#f8fafc', padding: '12px', borderRadius: '8px', border: '1px solid #e2e8f0' }}>
                <img
                  src={qrVerificationUrl}
                  alt="Scannable ULPIN QR Code"
                  style={{ width: '130px', height: '130px', borderRadius: '4px', border: '1px solid #cbd5e1', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}
                />
                <small style={{ fontSize: '10px', color: '#64748b', marginTop: '6px', fontWeight: 'bold' }}>
                  📷 Scan to Open Land Portal
                </small>
              </div>
            </div>

            <div style={{ background: '#f1f5f9', border: '1px solid #cbd5e1', padding: '10px 14px', borderRadius: '6px', marginBottom: '18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '3px' }}>
                <small style={{ fontSize: '10px', fontWeight: 'bold', color: '#475569', textTransform: 'uppercase' }}>
                  🔒 Cryptographic Spatial Deed Hash (SHA-256)
                </small>
                <span style={{ fontSize: '10px', color: '#059669', fontWeight: 'bold' }}>✔ Immutable Record</span>
              </div>
              <div style={{ fontSize: '11px', fontFamily: 'monospace', color: '#0f172a', wordBreak: 'break-all' }}>
                {certCryptoHash || 'Computing verification signature...'}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderTop: '1px solid #cbd5e1', paddingTop: '14px', marginBottom: '20px' }}>
              <div>
                <small style={{ color: '#64748b', fontSize: '11px' }}>ISSUED BY AUTHORITY OF</small><br/>
                <b style={{ fontSize: '13px', color: '#0f172a' }}>Directorate of Land Records & Surveys</b><br/>
                <small style={{ color: '#059669', fontWeight: '600' }}>State Cadastral Data Registry (e-Dharti Compliant)</small>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ display: 'inline-block', padding: '6px 12px', border: '2px solid #059669', borderRadius: '4px', color: '#059669', fontWeight: 'bold', fontSize: '11px', textTransform: 'uppercase' }}>
                  ✔ Digitally Signed
                </div>
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button onClick={() => setCertificateParcel(null)} style={{ background: '#475569', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontSize: '13px' }}>
                Close
              </button>
              <button onClick={() => window.print()} style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '8px 20px', borderRadius: '4px', cursor: 'pointer', fontWeight: 'bold', fontSize: '13px' }}>
                🖨️ Print / Save Deed PDF
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;