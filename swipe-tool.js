/**
 * BhoomiTrace Interactive Swipe Tool (Leaflet / Mapbox compatible)
 */
class BhoomiSwipeTool {
  constructor(mapInstance, topLayerPaneSelector = '.leaflet-overlay-pane') {
    this.map = mapInstance;
    this.mapContainer = mapInstance.getContainer ? mapInstance.getContainer() : document.getElementById('map');
    this.topPane = document.querySelector(topLayerPaneSelector);
    this.isActive = false;
    this.sliderPos = 0.5; // Starts at 50%
    this.initUI();
  }

  initUI() {
    // Create divider bar
    this.divider = document.createElement('div');
    this.divider.className = 'bhoomi-swipe-container';
    this.divider.style.display = 'none';

    const handle = document.createElement('div');
    handle.className = 'bhoomi-swipe-handle';
    handle.innerHTML = '&#8644;'; // Left-right arrows
    this.divider.appendChild(handle);

    // Badges for Before / After
    this.beforeBadge = document.createElement('div');
    this.beforeBadge.className = 'bhoomi-swipe-badge bhoomi-badge-before';
    this.beforeBadge.innerText = 'BEFORE: Cadastral Boundary';
    this.beforeBadge.style.display = 'none';

    this.afterBadge = document.createElement('div');
    this.afterBadge.className = 'bhoomi-swipe-badge bhoomi-badge-after';
    this.afterBadge.innerText = 'AFTER: GeoAI Harmonized';
    this.afterBadge.style.display = 'none';

    this.mapContainer.appendChild(this.divider);
    this.mapContainer.appendChild(this.beforeBadge);
    this.mapContainer.appendChild(this.afterBadge);

    this.setupEvents();
  }

  setupEvents() {
    let isDragging = false;

    const onMove = (e) => {
      if (!isDragging || !this.isActive) return;
      const rect = this.mapContainer.getBoundingClientRect();
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      let pos = (clientX - rect.left) / rect.width;
      pos = Math.max(0.02, Math.min(0.98, pos));
      this.sliderPos = pos;
      this.updateClip();
    };

    const onStop = () => { isDragging = false; };

    this.divider.addEventListener('mousedown', () => { isDragging = true; });
    this.divider.addEventListener('touchstart', () => { isDragging = true; });
    window.addEventListener('mousemove', onMove);
    window.addEventListener('touchmove', onMove);
    window.addEventListener('mouseup', onStop);
    window.addEventListener('touchend', onStop);
  }

  updateClip() {
    if (!this.topPane) return;
    const rect = this.mapContainer.getBoundingClientRect();
    const splitX = rect.width * this.sliderPos;
    this.divider.style.left = `${splitX}px`;

    // Clip top layer so left side shows 'Before' and right side shows 'After'
    this.topPane.style.clipPath = `polygon(${splitX}px 0, 100% 0, 100% 100%, ${splitX}px 100%)`;
  }

  toggle() {
    this.isActive = !this.isActive;
    const display = this.isActive ? 'block' : 'none';
    this.divider.style.display = display;
    this.beforeBadge.style.display = display;
    this.afterBadge.style.display = display;

    if (this.isActive) {
      this.updateClip();
    } else if (this.topPane) {
      this.topPane.style.clipPath = 'none';
    }
    return this.isActive;
  }
}

window.BhoomiSwipeTool = BhoomiSwipeTool;
