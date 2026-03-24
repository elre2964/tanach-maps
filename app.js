// Biblical Maps Application - Professional Editor Engine
let map;
let mapLayers, editorLayers;
let currentMapObj = null;
let currentMode = 'learn';
let practiceState = { mapping: {} };
let hidePlaces = false;

let editorPolygons = {}; // { polyId: [[lat, lng], ...] }
let editorRivers = {}; // { riverId: [[lat, lng], ...] }
let editorPlaces = {};
let activePolyId = null;
let activeRiverId = null;
let activeLayerType = 'polygon';
const SHOW_EDITOR = false; // Set to true to enable the editor tab again

const ui = {};

function init() {
    ui.mapList         = document.getElementById('map-list');
    ui.mapTitle        = document.querySelector('.map-title-overlay');
    ui.panelLearn      = document.getElementById('panel-explore');
    ui.panelPractice   = document.getElementById('panel-practice');
    ui.panelEditor     = document.getElementById('editor-panel');
    ui.practiceArea    = document.getElementById('practice-game-area');
    ui.termList        = document.getElementById('term-list');
    ui.feedback        = document.getElementById('feedback-area');
    ui.btnCheck        = document.getElementById('btn-check-answers');
    ui.btnStart        = document.getElementById('btn-start-practice');
    ui.outputPoly      = document.getElementById('editor-output-poly');
    ui.outputRivers    = document.getElementById('editor-output-rivers');
    ui.outputPlaces    = document.getElementById('editor-output-places');
    ui.lastCoord       = document.getElementById('last-coord');
    ui.newPlaceInput   = document.getElementById('new-place-name');

    map = L.map('map', { zoomControl: false, attributionControl: false, contextmenu: true });
    
    // Base Layer: The "Biblical" look. We set maxNativeZoom to 8 so Leaflet upscales tiles instead of turning white.
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Physical_Map/MapServer/tile/{z}/{y}/{x}', { 
        maxNativeZoom: 8,
        maxZoom: 19 
    }).addTo(map);
    
    // Topography Overlay: Adds the "3D" depth feel.
    L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Elevation/World_Hillshade/MapServer/tile/{z}/{y}/{x}', { 
        maxNativeZoom: 15,
        maxZoom: 19, 
        opacity: 0.35 
    }).addTo(map);

    mapLayers = L.layerGroup().addTo(map);
    editorLayers = L.layerGroup().addTo(map);

    map.setView([32.0, 35.5], 8);
    editorPlaces = JSON.parse(JSON.stringify(MAP_DATA.places));

    // Global Listeners
    if (ui.btnStart) ui.btnStart.onclick = startPracticeSession;
    if (ui.btnCheck) ui.btnCheck.onclick = checkPracticeAnswers;

    // EDITOR KEYBOARD + CLICK LOGIC
    map.on('contextmenu', (e) => {
        if (currentMode !== 'editor') return;
        addPointToEditor(e.latlng);
    });

    map.on('click', (e) => {
        if (currentMode !== 'editor') return;
        
        // Update last coordinate display
        if (ui.lastCoord) {
            ui.lastCoord.textContent = `[${e.latlng.lat.toFixed(3)}, ${e.latlng.lng.toFixed(3)}]`;
        }

        // Ctrl + Left Click to delete point across all polygons and rivers
        if (e.originalEvent.ctrlKey) {
            const clickPos = e.latlng;
            let closestObj = null;
            let minDist = 0.05; 
            
            // Polygons
            Object.keys(editorPolygons).forEach(id => {
                editorPolygons[id].forEach((p, idx) => {
                    const d = Math.sqrt(Math.pow(p[0]-clickPos.lat,2) + Math.pow(p[1]-clickPos.lng,2));
                    if (d < minDist) { minDist = d; closestObj = { data: editorPolygons[id], idx }; }
                });
            });
            // Rivers
            Object.keys(editorRivers).forEach(id => {
                editorRivers[id].forEach((p, idx) => {
                    const d = Math.sqrt(Math.pow(p[0]-clickPos.lat,2) + Math.pow(p[1]-clickPos.lng,2));
                    if (d < minDist) { minDist = d; closestObj = { data: editorRivers[id], idx }; }
                });
            });

            if (closestObj) { closestObj.data.splice(closestObj.idx, 1); syncEditorWithCurrentMap(false); }
        }
    });

    renderMapList();
    loadMap(0);
    map.on('zoomend', updateMapZoomClass);
    updateMapZoomClass();
    initMobileSidebar();
    
    // Hide editor tab if disabled
    if (!SHOW_EDITOR) {
        const editorTab = Array.from(document.querySelectorAll('.tab-btn')).find(b => b.innerText.includes('עורך'));
        if (editorTab) editorTab.style.display = 'none';
    }
    
    setTimeout(() => { map.invalidateSize(); }, 500);
}

function initMobileSidebar() {
    const sidebar = document.getElementById('sidebar');
    const handle = document.getElementById('sidebar-drag-handle');
    const toggleBtn = document.getElementById('toggle-sidebar');
    if (!sidebar || !handle) return;

    let isDragging = false;
    let startY = 0;
    let startHeight = 0;
    let rafId = null;

    const onTouchStart = (e) => {
        if (window.innerWidth > 768) return;
        isDragging = true;
        startY = e.touches[0].clientY;
        startHeight = sidebar.offsetHeight;
        sidebar.classList.add('dragging');
        
        if (sidebar.classList.contains('collapsed')) {
            sidebar.classList.remove('collapsed');
            startHeight = 60; 
        }
    };

    const onTouchMove = (e) => {
        if (!isDragging) return;
        e.preventDefault(); // Prevent page scroll while dragging
        const deltaY = startY - e.touches[0].clientY;
        const newHeight = startHeight + deltaY;
        
        const maxHeight = window.innerHeight * 0.95;
        const minHeight = 60;
        
        if (newHeight >= minHeight && newHeight <= maxHeight) {
            sidebar.style.height = `${newHeight}px`;
            // Continuously resize the map so it fills the available space
            if (rafId) cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(() => { map.invalidateSize({ animate: false }); });
        }
    };

    const onTouchEnd = () => {
        if (!isDragging) return;
        isDragging = false;
        sidebar.classList.remove('dragging');
        
        const currentHeight = sidebar.offsetHeight;
        if (currentHeight < 100) {
            sidebar.classList.add('collapsed');
            sidebar.style.height = ''; 
        } else if (currentHeight > window.innerHeight * 0.8) {
            sidebar.style.height = '95vh';
        }
        // Final size sync
        setTimeout(() => map.invalidateSize(), 200);
    };

    handle.addEventListener('touchstart', onTouchStart, { passive: true });
    toggleBtn.addEventListener('touchstart', onTouchStart, { passive: true });
    window.addEventListener('touchmove', onTouchMove, { passive: false });
    window.addEventListener('touchend', onTouchEnd);
}

function sidebarTo40() {
    const sb = document.getElementById('sidebar');
    if (!sb) return;
    sb.style.height = '40vh';
    sb.classList.remove('collapsed');
    setTimeout(() => { map.invalidateSize(); }, 400);
}

function toggleSidebar() {
    const sb = document.getElementById('sidebar');
    if (!sb) return;
    
    if (sb.classList.contains('collapsed')) {
        sb.classList.remove('collapsed');
        sb.style.height = '40vh';
    } else {
        sb.classList.add('collapsed');
        sb.style.height = ''; 
    }
    setTimeout(() => map.invalidateSize(), 400);
}

function renderMapList() {
    if (!ui.mapList) return;
    ui.mapList.innerHTML = '';
    MAP_DATA.maps.forEach(m => {
        const btn = document.createElement('button');
        btn.className = 'map-btn';
        btn.textContent = m.title;
        btn.onclick = () => { 
            loadMap(m.id); 
            if (currentMode === 'editor') syncEditorWithCurrentMap(true);
            if (window.innerWidth <= 768) {
                const sb = document.getElementById('sidebar');
                if (sb && sb.classList.contains('collapsed')) {
                    // Start at 40% height if selecting while collapsed
                    sb.style.height = '40vh';
                    sb.classList.remove('collapsed');
                } else if (sb && sb.offsetHeight > window.innerHeight * 0.7) {
                    // Shrink to 40% only if in full screen, to focus on the map
                    sb.style.height = '40vh';
                }
            }
        };
        ui.mapList.appendChild(btn);
    });
}

function switchMode(mode) {
    if (mode === 'editor' && !SHOW_EDITOR) return;

    const sidebar = document.getElementById('sidebar');
    if (sidebar) sidebar.classList.toggle('practice-mode', mode === 'practice');

    currentMode = mode;
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.classList.remove('active');
        const txt = btn.innerText;
        if (txt.includes('לימוד') && mode === 'learn') btn.classList.add('active');
        if (txt.includes('תרגול') && mode === 'practice') btn.classList.add('active');
        if (txt.includes('עורך') && mode === 'editor') btn.classList.add('active');
    });

    ui.panelLearn.classList.toggle('hidden', mode !== 'learn');
    ui.panelPractice.classList.toggle('hidden', mode !== 'practice');
    ui.panelEditor.classList.toggle('hidden', mode !== 'editor');

    if (mode === 'editor') syncEditorWithCurrentMap(true); // Force reset when entering editor
    else {
        editorLayers.clearLayers();
        if (mode === 'learn') {
            if (currentMapObj) loadMap(currentMapObj.id);
            else loadMap(0);
        }
        else if (mode === 'practice') {
            startPracticeSession();
        }
    }
}

// EDITOR ENGINE
function syncEditorWithCurrentMap(forceReset = false) {
    if (!currentMapObj) return;
    editorLayers.clearLayers();

    if (forceReset || (Object.keys(editorPolygons).length === 0 && Object.keys(editorRivers).length === 0)) {
        editorPolygons = {};
        editorRivers = {};
        if (currentMapObj.features) {
            currentMapObj.features.forEach(f => {
                if (f.type === 'polygon' && MAP_DATA.polygons[f.id]) {
                    editorPolygons[f.id] = JSON.parse(JSON.stringify(MAP_DATA.polygons[f.id]));
                }
                if (f.type === 'river' && MAP_DATA.rivers[f.id]) {
                    editorRivers[f.id] = JSON.parse(JSON.stringify(MAP_DATA.rivers[f.id]));
                }
            });
        }
        activePolyId = Object.keys(editorPolygons)[0] || 'new_poly';
        activeRiverId = Object.keys(editorRivers)[0] || 'new_river';
    }

    // Polygons
    Object.keys(editorPolygons).forEach(id => {
        const feat = currentMapObj.features?.find(f => f.id === id);
        spawnDraggablePolygon(id, feat?.color || '#e67e22');
    });

    // Rivers
    Object.keys(editorRivers).forEach(id => {
        spawnDraggableRiver(id, '#3498db');
    });

    if (!hidePlaces && currentMapObj.places) {
        currentMapObj.places.forEach(pName => {
            const coords = editorPlaces[pName] || MAP_DATA.places[pName];
            if (coords) spawnDraggablePlace(pName, coords);
        });
    }

    if (currentMapObj.features) {
        currentMapObj.features.forEach((f, idx) => {
            if (f.type === 'arrow') spawnDraggableArrow(f, idx);
            if (f.type === 'icon') spawnDraggableIcon(f, idx);
        });
    }
    updateEditorOutputs();
}

function spawnDraggableRiver(riverId, color) {
    const points = editorRivers[riverId];
    if (!points || points.length === 0) return;

    const layer = L.polyline(points, { color, weight: 4, dashArray: '5,5' }).addTo(editorLayers);
    
    points.forEach((p, idx) => {
        const marker = L.circleMarker(p, { radius: 7, color: '#2980b9', fillColor: '#fff', fillOpacity: 1 }).addTo(editorLayers);
        
        marker.on('mousedown', (e) => {
            L.DomEvent.stopPropagation(e);
            map.dragging.disable();
            const move = (ev) => {
                const n = [Number(ev.latlng.lat.toFixed(4)), Number(ev.latlng.lng.toFixed(4))];
                marker.setLatLng(n);
                points[idx] = n;
                layer.setLatLngs(points);
            };
            const up = () => { map.off('mousemove', move); map.off('mouseup', up); map.dragging.enable(); updateEditorOutputs(); };
            map.on('mousemove', move); map.on('mouseup', up);
        });

        marker.on('click', (e) => {
            activeRiverId = riverId;
            activeLayerType = 'river';
            if (document.getElementById('editor-active-layer')) document.getElementById('editor-active-layer').value = 'river';
            if (e.originalEvent.ctrlKey) {
                L.DomEvent.stopPropagation(e);
                points.splice(idx, 1);
                syncEditorWithCurrentMap(false);
            }
        });

        // Ghost points
        if (idx < points.length - 1) {
            const pNext = points[idx+1];
            const midLat = (p[0] + pNext[0]) / 2;
            const midLng = (p[1] + pNext[1]) / 2;
            const mid = [Number(midLat.toFixed(4)), Number(midLng.toFixed(4))];
            
            const ghost = L.circleMarker(mid, { radius: 7, color: '#2980b9', fillColor: '#fff', fillOpacity: 0.5 }).addTo(editorLayers);
            ghost.on('click', (e) => {
                L.DomEvent.stopPropagation(e);
                points.splice(idx+1, 0, mid);
                syncEditorWithCurrentMap(false);
            });
        }
    });
}

function spawnDraggablePolygon(polyId, color) {
    const points = editorPolygons[polyId];
    if (!points || points.length === 0) return;

    const polyLayer = L.polygon(points, { color, weight: 3, dashArray: '5,5', fillOpacity: 0.1, interactive: false }).addTo(editorLayers);
    
    points.forEach((p, idx) => {
        // Main vertex marker
        const marker = L.circleMarker(p, {
            radius: 7, color: color, fillColor: '#fff', fillOpacity: 1, weight: 2, interactive: true
        }).addTo(editorLayers);

        marker.on('mousedown', (me) => {
            L.DomEvent.stopPropagation(me);
            map.dragging.disable();
            const move = (ev) => {
                const n = [Number(ev.latlng.lat.toFixed(3)), Number(ev.latlng.lng.toFixed(3))];
                marker.setLatLng(n);
                points[idx] = n;
                polyLayer.setLatLngs(points);
            };
            const up = () => { 
                map.off('mousemove', move); map.off('mouseup', up); 
                map.dragging.enable(); 
                updateEditorOutputs(); 
            };
            map.on('mousemove', move); map.on('mouseup', up);
        });

        // Set as active polygon for adding new points
        marker.on('click', (e) => {
            activePolyId = polyId;
            if (e.originalEvent.ctrlKey) {
                L.DomEvent.stopPropagation(e);
                points.splice(idx, 1);
                syncEditorWithCurrentMap();
            }
        });

        marker.on('contextmenu', (e) => {
            L.DomEvent.stopPropagation(e);
            points.splice(idx, 1);
            syncEditorWithCurrentMap();
        });

        // Add Midpoint (Ghost) Marker between this point and the next
        const nextIdx = (idx + 1) % points.length;
        const pNext = points[nextIdx];
        
        // Only show ghost if there's more than 1 point to connect to
        if (points.length > 1) {
            const midLat = (p[0] + pNext[0]) / 2;
            const midLng = (p[1] + pNext[1]) / 2;
            
            const ghost = L.circleMarker([midLat, midLng], {
                radius: 7, color: color, fillColor: '#fff', fillOpacity: 0.7, weight: 2, interactive: true
            }).addTo(editorLayers);

            ghost.on('click', (ce) => {
                L.DomEvent.stopPropagation(ce);
                points.splice(idx + 1, 0, [Number(midLat.toFixed(4)), Number(midLng.toFixed(4))]);
                syncEditorWithCurrentMap();
            });
            
            // Allow dragging the ghost to create a new point immediately
            ghost.on('mousedown', (me) => {
                L.DomEvent.stopPropagation(me);
                map.dragging.disable();
                
                // Create the point immediately
                points.splice(idx + 1, 0, [Number(midLat.toFixed(4)), Number(midLng.toFixed(4))]);
                const newPointIdx = idx + 1;
                
                const move = (ev) => {
                    const n = [Number(ev.latlng.lat.toFixed(4)), Number(ev.latlng.lng.toFixed(4))];
                    points[newPointIdx] = n;
                    polyLayer.setLatLngs(points);
                    // Temporarily update ghost pos to follow mouse if we didn't re-sync yet
                    ghost.setLatLng(ev.latlng);
                };
                
                const up = () => { 
                    map.off('mousemove', move); map.off('mouseup', up); 
                    map.dragging.enable(); 
                    syncEditorWithCurrentMap(); // Full refresh to get all markers right
                };
                map.on('mousemove', move); map.on('mouseup', up);
            });
        }
    });
}

function spawnDraggableArrow(f, fIdx) {
    const s = f.start, e = f.end;
    
    // Initialize control points if they don't exist
    if (!f.cp1 && !f.cp) {
        const mid = [Number(((s[0]+e[0])/2).toFixed(4)), Number(((s[1]+e[1])/2).toFixed(4))];
        const offLat = (e[1]-s[1])*0.1, offLng = -(e[0]-s[0])*0.1;
        f.cp1 = [Number((mid[0]+offLat).toFixed(4)), Number((mid[1]+offLng).toFixed(4))];
    } else if (f.cp && !f.cp1) {
        f.cp1 = f.cp;
    }

    if (!f.cp2) {
        // Default cp2 near end or slightly offset from cp1
        f.cp2 = [Number((f.end[0] - (f.end[0]-f.start[0])*0.2).toFixed(4)), Number((f.end[1] - (f.end[1]-f.start[1])*0.2).toFixed(4))];
    }

    if (!f.iconPos) f.iconPos = f.cp1;
    if (!f.iconSize) f.iconSize = 50;

    const dragLogic = (marker, prop) => {
        marker.on('mousedown', (me) => {
            L.DomEvent.stopPropagation(me);
            map.dragging.disable();
            const move = (ev) => {
                const n = [Number(ev.latlng.lat.toFixed(4)), Number(ev.latlng.lng.toFixed(4))];
                marker.setLatLng(n);
                f[prop] = n;
                refreshMapDisplay();
            };
            const up = () => { 
                map.off('mousemove', move); map.off('mouseup', up); 
                map.dragging.enable(); 
                updateEditorOutputs(); 
            };
            map.on('mousemove', move); map.on('mouseup', up);
        });
    };

    const startMarker = L.circleMarker(f.start, { radius: 8, color: '#f39c12', fillColor: '#fff', fillOpacity: 1, weight: 3 }).addTo(editorLayers);
    const endMarker = L.circleMarker(f.end, { radius: 8, color: '#e74c3c', fillColor: '#fff', fillOpacity: 1, weight: 3 }).addTo(editorLayers);
    const cp1Marker = L.circleMarker(f.cp1, { radius: 6, color: '#3498db', fillColor: '#fff', fillOpacity: 0.8, weight: 2 }).addTo(editorLayers);
    const cp2Marker = L.circleMarker(f.cp2, { radius: 6, color: '#9b59b6', fillColor: '#fff', fillOpacity: 0.8, weight: 2 }).addTo(editorLayers);
    
    dragLogic(startMarker, 'start');
    dragLogic(endMarker, 'end');
    dragLogic(cp1Marker, 'cp1');
    dragLogic(cp2Marker, 'cp2');

    // Icon position marker
    if (f.icon || f.emoji) {
        const iconMarker = L.circleMarker(f.iconPos, { radius: 10, color: '#27ae60', fillColor: '#fff', fillOpacity: 1, weight: 2 }).addTo(editorLayers);
        dragLogic(iconMarker, 'iconPos');
        
        // Icon size "handle" marker
        const sizeHandlePos = [f.iconPos[0], f.iconPos[1] + (f.iconSize*0.002)];
        const sizeMarker = L.circleMarker(sizeHandlePos, { radius: 5, color: '#2ecc71', fillColor: '#2ecc71', fillOpacity: 0.5 }).addTo(editorLayers);
        
        sizeMarker.on('mousedown', (me) => {
            L.DomEvent.stopPropagation(me);
            map.dragging.disable();
            const move = (ev) => {
                const dist = Math.sqrt(Math.pow(ev.latlng.lat - f.iconPos[0], 2) + Math.pow(ev.latlng.lng - f.iconPos[1], 2));
                f.iconSize = Math.max(10, Math.round(dist * 500)); 
                sizeMarker.setLatLng(ev.latlng);
                refreshMapDisplay();
            };
            const up = () => { 
                map.off('mousemove', move); map.off('mouseup', up); 
                map.dragging.enable(); 
                updateEditorOutputs(); 
            };
            map.on('mousemove', move); map.on('mouseup', up);
        });
    }
}

function refreshMapDisplay() {
    if (currentMapObj) {
        loadMap(currentMapObj.id, true);
    }
}

function addPointToEditor(latlng) {
    if (currentMode !== 'editor') return;
    const p = [Number(latlng.lat.toFixed(4)), Number(latlng.lng.toFixed(4))];
    
    if (activeLayerType === 'polygon') {
        if (!activePolyId) activePolyId = 'new_poly';
        if (!editorPolygons[activePolyId]) editorPolygons[activePolyId] = [];
        editorPolygons[activePolyId].push(p);
    } else {
        if (!activeRiverId) activeRiverId = 'new_river';
        if (!editorRivers[activeRiverId]) editorRivers[activeRiverId] = [];
        editorRivers[activeRiverId].push(p);
    }

    syncEditorWithCurrentMap(false);
}

// Removing obsolete single-poly functions
function refreshEditorPolygons() {}
function drawEditorLine() {}

function spawnDraggableIcon(f, fIdx) {
    const size = f.size || 40;
    const iconStyle = `font-size:${size}px; filter: drop-shadow(0 0 5px white);`;
    const icon = L.divIcon({ 
        className: 'custom-icon-marker editor-active', 
        html: `<div style="${iconStyle}">${f.icon}</div>`, 
        iconSize: [size, size], iconAnchor: [size/2, size/2] 
    });
    const marker = L.marker(f.pos, { icon, interactive: true }).addTo(editorLayers);
    
    marker.on('mousedown', (me) => {
        L.DomEvent.stopPropagation(me);
        map.dragging.disable();
        const move = (ev) => {
            const n = [Number(ev.latlng.lat.toFixed(4)), Number(ev.latlng.lng.toFixed(4))];
            marker.setLatLng(n);
            f.pos = n;
            refreshMapDisplay();
        };
        const up = () => { map.off('mousemove', move); map.off('mouseup', up); map.dragging.enable(); updateEditorOutputs(); };
        map.on('mousemove', move); map.on('mouseup', up);
    });
}

function spawnDraggablePlace(name, coords) {
    const icon = L.divIcon({
        className: 'custom-city-marker editor-active',
        html: `<div class="city-dot" style="background:#2ecc71; border:2px solid white; box-shadow: 0 0 10px #2ecc71;"></div><div class="city-text" style="color:#27ae60; font-weight:bold;">${name}</div>`,
        iconSize: [120, 20], iconAnchor: [4, 10]
    });
    
    const marker = L.marker(coords, { icon, interactive: true }).addTo(editorLayers);
    marker._isPlace = true;

    marker.on('mousedown', (e) => {
        L.DomEvent.stopPropagation(e);
        map.dragging.disable();
        const move = (ev) => {
            const nLat = Number(ev.latlng.lat.toFixed(3)), nLng = Number(ev.latlng.lng.toFixed(3));
            marker.setLatLng([nLat, nLng]);
            editorPlaces[name] = [nLat, nLng];
        };
        const up = () => { map.off('mousemove', move); map.off('mouseup', up); map.dragging.enable(); updateEditorOutputs(); };
        map.on('mousemove', move); map.on('mouseup', up);
    });
}

function addNewPlaceToEditor() {
    const name = ui.newPlaceInput.value.trim();
    if (!name) return;
    const center = map.getCenter();
    const coords = [Number(center.lat.toFixed(3)), Number(center.lng.toFixed(3))];
    editorPlaces[name] = coords;
    spawnDraggablePlace(name, coords);
    ui.newPlaceInput.value = '';
    updateEditorOutputs();
}

function updateEditorOutputs() {
    let polyStr = "/* Polygons Data */\n";
    Object.keys(editorPolygons).forEach(id => {
        polyStr += `"${id}": [\n`;
        editorPolygons[id].forEach((p, i) => { polyStr += `    [${p[0]}, ${p[1]}]${i < editorPolygons[id].length - 1 ? ',' : ''}\n`; });
        polyStr += "],\n";
    });
    if (ui.outputPoly) ui.outputPoly.value = polyStr;

    let riverStr = "/* Rivers Data */\n";
    Object.keys(editorRivers).forEach(id => {
        riverStr += `"${id}": [\n`;
        editorRivers[id].forEach((p, i) => { riverStr += `    [${p[0]}, ${p[1]}]${i < editorRivers[id].length - 1 ? ',' : ''}\n`; });
        riverStr += "],\n";
    });
    if (ui.outputRivers) ui.outputRivers.value = riverStr;

    let placeStr = "";
    Object.keys(editorPlaces).forEach(pName => {
        const c = editorPlaces[pName];
        placeStr += `"${pName}": [${c[0]}, ${c[1]}],\n`;
    });
    if (ui.outputPlaces) ui.outputPlaces.value = placeStr;

    // Output arrow features if any are edited
    if (currentMapObj && currentMapObj.features) {
        let featureStr = "features: [\n";
        currentMapObj.features.forEach((f, i) => {
            featureStr += `    ${JSON.stringify(f)}${i < currentMapObj.features.length - 1 ? ',' : ''}\n`;
        });
        featureStr += "]";
        if (ui.outputPoly) ui.outputPoly.value += "\n\n/* Features (Arrows etc.) */\n" + featureStr;
    }
}

function clearEditorPoints() { 
    editorPolygons = {}; 
    editorRivers = {};
    activePolyId = 'new_poly';
    activeRiverId = 'new_river';
    syncEditorWithCurrentMap(false); 
}

function copyToClipboard(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.select();
    document.execCommand('copy');
    alert('הקוד הועתק!');
}

function togglePlacesVisibility(el) {
    if (el) hidePlaces = el.checked;
    
    // Sync all checkboxes
    const cb1 = document.getElementById('hide-places-toggle');
    const cb2 = document.getElementById('hide-places-global');
    if (cb1) cb1.checked = hidePlaces;
    if (cb2) cb2.checked = hidePlaces;

    if (currentMode === 'editor') syncEditorWithCurrentMap();
    
    // Refresh mapLayer cities without flying the camera
    if (currentMapObj) loadMap(currentMapObj.id, true);
}

// APP RENDERING
function loadMap(mapId, skipFly = false) {
    const mapObj = MAP_DATA.maps.find(m => m.id === mapId);
    if (!mapObj) return;
    currentMapObj = mapObj;
    if (ui.mapTitle) ui.mapTitle.textContent = mapObj.title;
    document.querySelectorAll('.map-btn').forEach(btn => btn.classList.toggle('active', btn.textContent === mapObj.title));

    mapLayers.clearLayers();
    const b = MAP_DATA.bounds[mapObj.bounds || "israel"];
    
    let options = { animate: true, duration: 1.5, padding: [30, 30] };
    if (window.innerWidth <= 768) {
        const sbHeight = document.getElementById('sidebar')?.offsetHeight || window.innerHeight * 0.4;
        options.paddingBottomRight = [20, sbHeight + 40]; // [x, y] - y is bottom padding
        options.paddingTopLeft = [20, 20];
    }

    if (b && !skipFly) map.flyToBounds(b, options);

    if (mapObj.features) {
        mapObj.features.forEach(f => {
            if (f.type === "polygon" && MAP_DATA.polygons[f.id]) {
                const pts = smoothPolygon(MAP_DATA.polygons[f.id]);
                L.polygon(pts, { color: f.color || "#6D4C41", weight: 3, dashArray: f.dashArray || "", fillOpacity: f.fillOpacity || 0.1, interactive: false }).addTo(mapLayers);
            }
            if (f.type === "river" && MAP_DATA.rivers[f.id]) {
                L.polyline(smoothRiver(MAP_DATA.rivers[f.id]), { color: "#3498db", weight: 3, interactive: false }).addTo(mapLayers);
            }
            if (f.type === "route") L.polyline(MAP_DATA.routes[f.id], { color: f.color || "#e67e22", weight: 2, dashArray: "5,5" }).addTo(mapLayers);
            if (f.type === "textlabel") {
                const icon = L.divIcon({ className: 'custom-region-marker', html: `<div class="region-text ${f.size || 'small'}" style="${f.rotate ? `transform: rotate(${f.rotate}deg);`:''}" dir="rtl">${f.text}</div>`, iconSize: [200, 40], iconAnchor:[100,20] });
                L.marker(f.pos, { icon, interactive: false }).addTo(mapLayers);
            }
            if (f.type === "arrow") drawArrow(f);
            if (f.type === "riverlabel") {
                const icon = L.divIcon({ className: 'custom-river-label', html: `<div class="river-label-text" dir="rtl">${f.text}</div>`, iconSize: [120, 20], iconAnchor: [60, 10] });
                L.marker(f.pos, { icon, interactive: false }).addTo(mapLayers);
            }
            if (f.type === "icon") {
                const size = f.size || 40;
                const icon = L.divIcon({ className: 'custom-icon-marker', html: `<div style="font-size: ${size}px;">${f.icon}</div>`, iconSize: [size, size], iconAnchor: [size/2, size/2] });
                L.marker(f.pos, { icon, interactive: false }).addTo(mapLayers);
            }
        });
    }

    if (mapObj.regions) {
        mapObj.regions.forEach(rn => {
            const r = MAP_DATA.regions[rn];
            if (!r) return;
            const size = r[2] || 'small';
            const isMultiline = rn.includes("בבלית") || rn.includes("ממלכת");
            let displayText = rn;
            if (isMultiline) {
                displayText = rn.replace("האימפריה ", "האימפריה<br>").replace("ממלכת ", "ממלכת<br>");
            }
            const icon = L.divIcon({ 
                className: 'custom-region-marker', 
                html: `<div class="region-text ${size} ${isMultiline ? 'multiline' : ''}" dir="rtl">${displayText}</div>`, 
                iconSize: [250, 100], 
                iconAnchor: [125, 50] 
            });
            L.marker([r[0], r[1]], { icon, interactive: false }).addTo(mapLayers);
        });
    }

    if (!hidePlaces) {
        // Collect all cities for this map
        const citiesToDraw = [];
        if (mapObj.fadedPlaces) mapObj.fadedPlaces.forEach(p => citiesToDraw.push({name: p, faded: true}));
        if (mapObj.places) mapObj.places.forEach(p => citiesToDraw.push({name: p, faded: false}));
        
        // Improved collision detection: decide offset direction for each city
        const COLLISION_DIST = 0.18;
        const offsetMap = {}; // name -> offsetClass

        citiesToDraw.forEach((c1, i) => {
            const coord1 = editorPlaces[c1.name] || MAP_DATA.places[c1.name];
            if (!coord1) return;

            let bestOffset = '';
            let hasConflict = false;

            citiesToDraw.forEach((c2, j) => {
                if (i === j) return;
                const coord2 = editorPlaces[c2.name] || MAP_DATA.places[c2.name];
                if (!coord2) return;

                const dist = calculateDistance(coord1, coord2);
                if (dist < COLLISION_DIST) {
                    hasConflict = true;
                    const latDiff = coord1[0] - coord2[0];
                    const lngDiff = coord1[1] - coord2[1];

                    if (Math.abs(latDiff) >= Math.abs(lngDiff)) {
                        // Primarily vertically separated
                        bestOffset = (latDiff > 0) ? 'offset-up' : 'offset-down';
                    } else {
                        // Primarily horizontally separated — use lat index as tiebreaker
                        bestOffset = (i < j) ? 'offset-up' : 'offset-down';
                    }
                }
            });

            offsetMap[c1.name] = hasConflict ? bestOffset : '';
        });

        citiesToDraw.forEach(c => {
            drawCity(c.name, c.faded, offsetMap[c.name] || '');
        });
    }

    // Render context panel for this map
    renderMapContext(mapObj);

    // Force map to recalculate its size after loading (fixes layer lag bug)
    setTimeout(() => { map.invalidateSize({ animate: false }); }, 50);
}

function drawCity(name, faded, offsetClass = "") {
    const coords = editorPlaces[name] || MAP_DATA.places[name];
    if (!coords) return;
    // Use definitive absolute positioning for maximum accuracy on all browsers
    const icon = L.divIcon({ 
        className: `custom-city-marker ${faded?'faded':''} ${offsetClass}`, 
        html: `<div class="city-dot"></div><div class="city-text" dir="rtl">${name}</div>`, 
        iconSize: [0, 0], 
        iconAnchor: [0, 0] 
    });
    const m = L.marker(coords, { icon, interactive: false}).addTo(mapLayers);
    m._isMapCity = true;
}

function drawArrow(f) {
    const s = f.start, e = f.end;
    let cp1 = f.cp1 || f.cp;
    let cp2 = f.cp2 || cp1;

    // Cubic Bezier curve calculation
    const pts = [];
    for(let t=0; t<=1; t+=0.02) { 
        const it = 1 - t;
        const x = it*it*it*s[0] + 3*it*it*t*cp1[0] + 3*it*t*t*cp2[0] + t*t*t*e[0];
        const y = it*it*it*s[1] + 3*it*it*t*cp1[1] + 3*it*t*t*cp2[1] + t*t*t*e[1];
        pts.push([x, y]);
    }
    
    const color = f.color || "#e67e22";
    L.polyline(pts, { color, weight: 3, dashArray: "10,5", opacity: 0.8 }).addTo(mapLayers);

    // DRAW ARROWHEAD
    const lastPt = pts[pts.length - 1];
    const prevPt = pts[pts.length - 3];
    if (lastPt && prevPt) {
        const dLat = lastPt[0] - prevPt[0];
        const dLng = lastPt[1] - prevPt[1];
        const angle = Math.atan2(dLat, dLng);
        const headSize = 0.15;
        const h1 = [lastPt[0] - headSize * Math.sin(angle - Math.PI/6), lastPt[1] - headSize * Math.cos(angle - Math.PI/6)];
        const h2 = [lastPt[0] - headSize * Math.sin(angle + Math.PI/6), lastPt[1] - headSize * Math.cos(angle + Math.PI/6)];
        L.polygon([lastPt, h1, h2], { color, fillColor: color, fillOpacity: 1, weight: 1, interactive: false }).addTo(mapLayers);
    }

    if (f.icon || f.emoji) {
        const size = f.iconSize || 60;
        const icon = L.divIcon({ 
            className: 'custom-arrow-marker', 
            html: `<div class="arrow-emoji" style="text-shadow: 0 0 5px white; font-size: ${size}px;">${f.icon || f.emoji}</div>`, 
            iconSize: [size, size], iconAnchor: [size/2, size/2] 
        });
        L.marker(f.iconPos || cp1, { icon, interactive: false }).addTo(mapLayers);
    }
}

function startPracticeSession() {
    ui.panelPractice.classList.remove('hidden');
    ui.practiceArea.classList.remove('hidden');
    ui.feedback.textContent = '';
    ui.feedback.className = 'feedback-area';
    
    // Clear map and set global view
    mapLayers.clearLayers();
    const israelBounds = MAP_DATA.bounds["israel"];
    
    let options = { padding: [50, 50] };
    if (window.innerWidth <= 768) {
        const sbHeight = document.getElementById('sidebar')?.offsetHeight || window.innerHeight * 0.4;
        options.paddingBottomRight = [20, sbHeight + 60]; 
        options.paddingTopLeft = [20, 20];
    }
    map.flyToBounds(israelBounds, options);
    ui.mapTitle.textContent = "תרגול זיהוי מקומות (רנדומלי)";
    
    // Prepare buttons
    ui.btnCheck.innerHTML = "בדוק תשובות";
    ui.btnCheck.style.background = ""; // Reset custom success background
    ui.btnCheck.onclick = checkPracticeAnswers;

    const allPlaces = [...MAP_DATA.practiceList];
    const selected = [];
    const MIN_DIST = 0.8; // Further increased minimum distance (~90km) to ensure no proximity issues

    // Selection logic with distance constraint
    let attempts = 0;
    while (selected.length < 4 && attempts < 200) {
        const candidate = allPlaces[Math.floor(Math.random() * allPlaces.length)];
        const candCoord = MAP_DATA.places[candidate];
        
        if (candCoord) {
            const isTooClose = selected.some(s => {
                const sCoord = MAP_DATA.places[s];
                return calculateDistance(candCoord, sCoord) < MIN_DIST;
            });

            if (!isTooClose && !selected.includes(candidate)) {
                selected.push(candidate);
            }
        }
        attempts++;
    }

    // Fallback if distance logic takes too long
    if (selected.length < 4) {
        while (selected.length < 4) {
            const p = allPlaces[Math.floor(Math.random() * allPlaces.length)];
            if (!selected.includes(p)) selected.push(p);
        }
    }

    ui.termList.innerHTML = '';
    practiceState.mapping = {};
    
    selected.forEach((name, idx) => {
        const num = idx + 1;
        const c = MAP_DATA.places[name];
        practiceState.mapping[num] = name;
        
        const icon = L.divIcon({ 
            className: 'practice-marker', 
            html: `<div style="background:#e67e22; color:white; border-radius:50%; width:30px; height:30px; display:flex; align-items:center; justify-content:center; font-weight:bold; border:2px solid white; box-shadow:0 0 10px rgba(0,0,0,0.3);">${num}</div>`, 
            iconSize: [30, 30], iconAnchor: [15, 15] 
        });
        L.marker(c, { icon }).addTo(mapLayers);
    });

    // Shuffle the names for the list
    const shuffledNames = [...selected].sort(() => Math.random() - 0.5);
    shuffledNames.forEach(name => {
        const item = document.createElement('div');
        item.className = 'term-item';
        
        item.innerHTML = `
            <span class="term-name">${name} <span class="mark"></span></span>
            <div class="number-selector">
                <button type="button" class="num-btn" data-val="1">1</button>
                <button type="button" class="num-btn" data-val="2">2</button>
                <button type="button" class="num-btn" data-val="3">3</button>
                <button type="button" class="num-btn" data-val="4">4</button>
                <input type="hidden" class="term-select" data-place="${name}" value="">
            </div>
        `;

        const btns = item.querySelectorAll('.num-btn');
        const input = item.querySelector('.term-select');
        btns.forEach(b => {
            b.onclick = () => {
                const wasSelected = b.classList.contains('selected');
                btns.forEach(btn => btn.classList.remove('selected'));
                
                if (!wasSelected) {
                    b.classList.add('selected');
                    input.value = b.dataset.val;
                } else {
                    input.value = "";
                }
                
                // Clear marks on change
                item.querySelector('.mark').textContent = '';
                item.classList.remove('correct', 'wrong');
            };
        });

        ui.termList.appendChild(item);
    });
}

function calculateDistance(p1, p2) {
    return Math.sqrt(Math.pow(p1[0] - p2[0], 2) + Math.pow(p1[1] - p2[1], 2));
}

function checkPracticeAnswers() {
    const items = document.querySelectorAll('.term-item');
    let correctCount = 0;
    
    items.forEach(item => {
        const select = item.querySelector('.term-select');
        const mark = item.querySelector('.mark');
        const isCorrect = practiceState.mapping[select.value] === select.dataset.place;
        
        if (select.value === "") {
            mark.textContent = ' ⚠️';
            item.classList.remove('correct', 'wrong');
        } else if (isCorrect) {
            mark.textContent = ' ✅';
            item.classList.add('correct');
            item.classList.remove('wrong');
            correctCount++;
        } else {
            mark.textContent = ' ❌';
            item.classList.add('wrong');
            item.classList.remove('correct');
        }
    });
    
    if (correctCount === items.length) { 
        ui.feedback.className = 'feedback-area success'; 
        ui.feedback.textContent = '🟢 כל הכבוד! הכל נכון.';
        ui.btnCheck.innerHTML = "שאלה הבאה ➔";
        ui.btnCheck.style.background = "#2ecc71";
        ui.btnCheck.onclick = startPracticeSession;
    } else { 
        ui.feedback.className = 'feedback-area error'; 
        ui.feedback.textContent = `🔴 יש לך טעויות. תקן ונסה שוב!`;
        ui.btnCheck.innerHTML = "בדוק שוב";
        ui.btnCheck.onclick = checkPracticeAnswers;
    }
}

function smoothPolygon(p) {
    let cur = p;
    for(let i=0; i<3; i++) {
        let next = [];
        for(let j=0; j<cur.length; j++) {
            let p0 = cur[j], p1 = cur[(j+1)%cur.length];
            next.push([0.75*p0[0]+0.25*p1[0], 0.75*p0[1]+0.25*p1[1]], [0.25*p0[0]+0.75*p1[0], 0.25*p0[1]+0.75*p1[1]]);
        }
        cur = next;
    }
    return cur;
}

function smoothRiver(p) {
    let cur = [...p];
    for(let i=0; i<3; i++) {
        let next = [cur[0]];
        for(let j=0; j<cur.length-1; j++) {
            let p0 = cur[j], p1 = cur[j+1];
            next.push([0.75*p0[0]+0.25*p1[0], 0.75*p0[1]+0.25*p1[1]], [0.25*p0[0]+0.75*p1[0], 0.25*p0[1]+0.75*p1[1]]);
        }
        next.push(cur[cur.length-1]);
        cur = next;
    }
    return cur;
}

function updateMapZoomClass() {
    const z = map.getZoom();
    const container = document.getElementById('map');
    if (!container) return;

    // Smooth, continuous font size via CSS custom properties (no delay, no class jump)
    // City labels: 9px at zoom 6, 13px at zoom 8, 19px at zoom 11+
    const citySize = Math.max(9, Math.min(19, 9 + (z - 6) * 2));
    container.style.setProperty('--city-font-size', `${citySize.toFixed(1)}px`);

    // Region labels: scale from 0.65 at zoom 6 to 1.4 at zoom 11
    const regionScale = Math.max(0.55, Math.min(1.45, 0.55 + (z - 6) * 0.18));
    container.style.setProperty('--region-scale', regionScale.toFixed(3));

    // Keep legacy class for any remaining class-based rules
    container.classList.remove('z-low', 'z-mid', 'z-high');
    if (z <= 7) container.classList.add('z-low');
    else if (z >= 10) container.classList.add('z-high');
    else container.classList.add('z-mid');
}

// =========================================
// Per-map context panel
// =========================================
const MAP_CONTEXTS = {
    0: null,
    1: {
        color: '#795548',
        emoji: '👑',
        title: 'תחום השליטה של ממלכת שלמה',
        chapters: ["מלכים א' ה'", "מלכים א' ח'"],
        summary: 'במפה מסומן תחום השליטה הרחב של ממלכת שלמה. על פי הכתוב, כל הממלכות מעברו המערבי של נהר פרת היו מעלים לשלמה מנחה ומסים. יש להבדיל בין גבולות ההתיישבות ("מדן ועד באר שבע") לבין גבולות השליטה וההשפעה שתוארו כשיא של ממלכת ישראל.',
        verses: [
            { text: "וּשְׁלֹמֹה הָיָה מוֹשֵׁל בְּכָל הַמַּמְלָכוֹת מִן הַנָּהָר אֶרֶץ פְּלִשְׁתִּים וְעַד גְּבוּל מִצְרָיִם מַגִּישִׁים מִנְחָה וְעֹבְדִים אֶת שְׁלֹמֹה כָּל יְמֵי חַיָּיו", ref: "מלכים א' ה', א" },
            { text: "כִּי הוּא רֹדֶה בְּכָל עֵבֶר הַנָּהָר מִתִּפְסַח וְעַד עַזָּה בְּכָל מַלְכֵי עֵבֶר הַנָּהָר וְשָׁלוֹם הָיָה לוֹ מִכָּל עֲבָרָיו מִסָּבִיב", ref: "מלכים א' ה', ד" },
            { text: "וַיֵּשֶׁב יְהוּדָה וְיִשְׂרָאֵל לָבֶטַח אִישׁ תַּחַת גַּפְנוֹ וְתַחַת תְּאֵנָתוֹ מִדָּן וְעַד בְּאֵר שָׁבַע כֹּל יְמֵי שְׁלֹמֹה", ref: "מלכים א' ה', ה" },
            { text: "מִלְּבוֹא חֲמָת עַד נַחַל מִצְרָיִם... אֶת הֶחָג וְכׇל יִשְׂרָאֵל עִמּוֹ קָהָל גָּדוֹל", ref: "מלכים א' ח', סה" },
            { text: "יְהוּדָה וְיִשְׂרָאֵל רַבִּים כַּחוֹל אֲשֶׁר עַל הַיָּם לָרֹב אֹכְלִים וְשֹׁתִים וּשְׂמֵחִים", ref: "מלכים א' ד', כ" }
        ]
    },
    2: {
        color: '#e67e22',
        emoji: '🏙️',
        title: 'ערים שבנה שלמה על דרך הים',
        chapters: ['מלכים א ט\' טו–יז'],
        summary: 'שלמה בנה שלוש ערים מרכזיות — חצור, מגידו וגזר — על ציר דרך הים, הדרך הבינלאומית שחיברה מצרים עם מסופוטמיה. גזר ניתנה לשלמה כנדוניה ממלך מצרים עם נישואיו לבת פרעה.',
        verses: [
            { text: 'וְזֶה דְבַר הַמַּס אֲשֶׁר הֶעֱלָה הַמֶּלֶךְ שְׁלֹמֹה... אֶת חָצֹר וְאֶת מְגִדֹּו וְאֶת גָּזֶר', ref: 'מלכים א ט\', טו' },
            { text: 'פַּרְעֹה מֶלֶךְ מִצְרַיִם עָלָה וַיִּלְכֹּד אֶת גֶּזֶר וַיִּתְּנָהּ שִׁלֻּחִים לְבִתּוֹ אֵשֶׁת שְׁלֹמֹה', ref: 'מלכים א ט\', טז' }
        ]
    },
    3: {
        color: '#27ae60',
        emoji: '🐎',
        title: 'קשרי המסחר של שלמה',
        chapters: ['מלכים א ג\' א', 'מלכים א י\' כח–כט', 'מלכים א י"א א–ב'],
        summary: 'שלמה שלט בדרכי המסחר הבינלאומיות ועסק במסחר סוסים בין מצרים לארם והחתים. הקשרים עם מצרים כללו גם נישואין לבת פרעה — ברית שחיזקה את הגבול הדרומי אך גם עוררה ביקורת מצד הכתוב.',
        verses: [
            { text: 'וַיִּתְחַתֵּן שְׁלֹמֹה אֶת פַּרְעֹה מֶלֶךְ מִצְרַיִם וַיִּקַּח אֶת בַּת פַּרְעֹה', ref: 'מלכים א ג\', א' },
            { text: 'וְהַמֶּלֶךְ שְׁלֹמֹה אָהַב נָשִׁים נָכְרִיּוֹת רַבּוֹת וְאֶת בַּת פַּרְעֹה', ref: 'מלכים א י"א, א' }
        ]
    },
    4: {
        color: '#8e44ad',
        emoji: '⚖️',
        title: 'המלכת רחבעם ופילוג הממלכה',
        chapters: ['מלכים א י"ב א–טו'],
        summary: 'לאחר מות שלמה, נדרש רחבעם להמלך בשכם — עיר בנחלת אפרים, לא בירושלים. ירבעם חזר ממצרים והציג את תביעות העם להקלת עול המיסים. במקום לקבל את הדרישה, ענה רחבעם בגסות — ובכך גרם לפילוג הממלכה.',
        verses: [
            { text: 'אָבִיךָ הִקְשָׁה אֶת עֻלֵּנוּ וְאַתָּה הָקֵל מֵעֲבֹדַת אָבִיךָ הַקָּשָׁה וּמֵעֻלּוֹ הַכָּבֵד אֲשֶׁר נָתַן עָלֵינוּ וְנַעַבְדֶךָ', ref: 'מלכים א י"ב, ד' }
        ]
    },
    5: {
        color: '#2980b9',
        emoji: '🗺️',
        title: 'ממלכת יהודה וממלכת ישראל',
        chapters: ['מלכים א י"ב טז–כ'],
        summary: 'הממלכה המאוחדת התפצלה לשתיים: ממלכת יהודה בדרום (שבטי יהודה, בנימין ושמעון) עם ירושלים ובית המקדש, וממלכת ישראל בצפון (שאר השבטים) בהנהגת ירבעם עם מרכז בשכם. ממלכת ישראל הייתה גדולה יותר אך פגיעה יותר.',
        verses: [
            { text: 'מַה לָּנוּ חֵלֶק בְּדָוִד וְלֹא נַחֲלָה בְּבֶן יִשַׁי לְאֹהָלֶיךָ יִשְׂרָאֵל עַתָּה רְאֵה בֵיתְךָ דָּוִד', ref: 'מלכים א י"ב, טז' }
        ]
    },
    6: {
        color: '#c0392b',
        emoji: '🐂',
        title: 'עגלי הזהב בדן ובבית אל',
        chapters: ['מלכים א י"ב כו–ל'],
        summary: 'ירבעם חשש שהעם יעלה לירושלים ויחזור לממלכת יהודה. הוא הקים שני עגלי זהב — בדן (גבול צפוני) ובבית אל (גבול דרומי) — וקרא להם "אלהיך ישראל". מעשה זה מזכיר את חטא העגל בספר שמות ומהווה נקודת ציון לחטאי ממלכת ישראל.',
        verses: [
            { text: 'רַב לָכֶם מֵעֲלוֹת יְרוּשָׁלָיִם הִנֵּה אֱלֹהֶיךָ יִשְׂרָאֵל אֲשֶׁר הֶעֱלוּךָ מֵאֶרֶץ מִצְרָיִם', ref: 'מלכים א י"ב, כח' },
            { text: 'וַיָּשֶׂם אֶת הָאֶחָד בְּבֵית אֵל וְאֶת הָאֶחָד נָתַן בְּדָן', ref: 'מלכים א י"ב, כט' }
        ]
    },
    7: {
        color: '#e67e22',
        emoji: '⚔️',
        title: 'השתלטות בן הדד מלך ארם על צפון ישראל',
        chapters: ['מלכים א ט"ו טז–כא'],
        summary: 'אסא מלך יהודה, בלחץ בעשא מלך ישראל שבנה את הרמה, פנה לבן הדד מלך ארם לעזרה. בן הדד פגע בערי הצפון של ממלכת ישראל לאורך דרך הים — עיון, דן, אבל בית מעכה — ובאזורי ארץ כנרות ונפתלי.',
        verses: [
            { text: 'וַיִּשְׁמַע בֶּן הֲדַד... וַיַּךְ אֶת עִיּוֹן וְאֶת דָּן וְאֵת אָבֵל בֵּית מַעֲכָה וְאֵת כָּל כִּנְרֹת עַל כָּל אֶרֶץ נַפְתָּלִי', ref: 'מלכים א ט"ו, כ' }
        ]
    },
    8: {
        color: '#16a085',
        emoji: '🏛️',
        title: 'ערי הבירה של ממלכת ישראל',
        chapters: ['מלכים א י"ד–ט"ז'],
        summary: 'בחמישים שנותיה הראשונות עברה ממלכת ישראל כמה בתי מלוכה וערי בירה: שכם, פנואל, תרצה. בית עמרי היה הבית היציב הראשון, וייסד את שומרון כעיר בירה קבועה.',
        verses: []
    },
    9: {
        color: '#2980b9',
        emoji: '🦅',
        title: 'אליהו בזמן הבצורת',
        chapters: ['מלכים א י"ז א–טז'],
        summary: 'אליהו גזר בצורת על הארץ ונאלץ להסתתר מפני אחאב ואיזבל. ה׳ שלח אותו לנחל כרית שבעבר הירדן, שם ניזון בנס מהעורבים. לאחר שיבש הנחל, נשלח צפונה לצרפת שליד צידון, שם בצע נס כד הקמח.',
        verses: [
            { text: 'לֵךְ מִזֶּה וּפָנִיתָ לְּךָ קֵדְמָה וְנִסְתַּרְתָּ בְּנַחַל כְּרִית אֲשֶׁר עַל פְּנֵי הַיַּרְדֵּן', ref: 'מלכים א י"ז, ג' },
            { text: 'קוּם לֵךְ צָרְפַתָה אֲשֶׁר לְצִידוֹן וְיָשַׁבְתָּ שָּׁם', ref: 'מלכים א י"ז, ט' }
        ]
    },
    10: {
        color: '#8e44ad',
        emoji: '🔥',
        title: 'מעמד הר הכרמל',
        chapters: ['מלכים א י"ח יט–מ'],
        summary: 'הר הכרמל — שלוחה ירוקה מרהיבה מצפון-מערב לרכס השומרון — היה הזירה לעימות הגדול בין אליהו לנביאי הבעל. אליהו, לבדו מול 450 נביאים, הוכיח שה׳ הוא האלוהים האמיתי כאשר האש ירדה ואכלה את הקרבן.',
        verses: [
            { text: 'עַד מָתַי אַתֶּם פֹּסְחִים עַל שְׁתֵּי הַסְּעִפִּים אִם ה׳ הָאֱלֹהִים לְכוּ אַחֲרָיו', ref: 'מלכים א י"ח, כא' }
        ]
    },
    11: {
        color: '#795548',
        emoji: '🚶',
        title: 'המסע של אליהו בארץ',
        chapters: ['מלכים א י"ז—י"ט'],
        summary: 'מאפיין ייחודי של אליהו הנביא: הוא עבר נוכח כל הארץ ולא היה לו מקום קבוע. מוצאו מן הגלעד שבעבר הירדן המזרחי, עבר לנחל כרית, לצרפת בצפון, לכרמל, ליזרעאל, לבאר שבע ולבסוף לחורב — ובסיום פעילותו חצר חזרה לעבר הירדן.',
        verses: []
    },
    12: {
        color: '#e74c3c',
        emoji: '🗡️',
        title: 'ארם בימי יהודה וישראל',
        chapters: ['מלכים א כ', 'מלכים א כ"ב'],
        summary: 'ארם שכנה מצפון-מזרח לישראל ושלטה על דרכי המסחר. לפעמים שיתפה פעולה עם ממלכת ישראל נגד יהודה (בימי בעשא ואסא), ולפעמים היו ישראל ויהודה מאוחדות נגד ארם (בימי אחאב ויהושפט). חזאל נמשח למלך ארם בציווי אירהו על ידי ה׳.',
        verses: []
    },
    13: {
        color: '#c0392b',
        emoji: '🛡️',
        title: 'מלחמת יורם ברמות גלעד',
        chapters: ['מלכים ב ח כח–כט'],
        summary: 'רמות גלעד — עיר אסטרטגית בגלעד, בגבול בין ישראל לארם — הייתה מחוז מריבה ממושך. יורם מלך ישראל יצא לקרב שם, נפצע, וירד להחלים ביזרעאל — המרכז השלטוני החלופי של בית אחאב, שאפשר לו להישאר קרוב לשדה הקרב.',
        verses: [
            { text: 'וַיָּשָׁב הַמֶּלֶךְ יוֹרָם לְהִתְרַפֵּא בְּיִזְרְעֶאל מִן הַמַּכּוֹת', ref: 'מלכים ב ח, כט' }
        ]
    },
    14: {
        color: '#f39c12',
        emoji: '🌟',
        title: 'ממלכות ישראל ויהודה בשיאן',
        chapters: ['מלכים ב י"ד כא–כה', 'מלכים ב ט"ו א–ז'],
        summary: 'בתקופה ייחודית: ירבעם השני הרחיב את ממלכת ישראל צפונה, ועזריה (עוזיהו) הרחיב את יהודה דרומה — יחד הגיעו גבולות עם ישראל לממדים הדומים לימי שלמה! שימו לב: גבול ממלכת שלמה מסומן גם הוא במפה, בצבע נפרד.',
        verses: [
            { text: 'הוּא הֵשִׁיב אֶת גְּבוּל יִשְׂרָאֵל מִלְּבוֹא חֲמָת עַד יָם הָעֲרָבָה', ref: 'מלכים ב י"ד, כה' }
        ]
    },
    15: {
        color: '#7f8c8d',
        emoji: '🏹',
        title: 'האימפריה האשורית',
        chapters: ['מלכים ב ט"ו–י"ז'],
        summary: 'האימפריה האשורית מרכזה במסופוטמיה הצפונית, על שפות נהר החידקל ובירתה נינוה. בשיאה השתרעה על חלק גדול מהמזרח הקדום. האשורים היו הראשונים שנקטו מדיניות של גלות עמים, ולבסוף כבשו את שומרון והגלו את עשרת השבטים.',
        verses: []
    },
    16: {
        color: '#c0392b',
        emoji: '🚶',
        title: 'הגליית תושבים צפוניים ע"י אשור',
        chapters: ['מלכים ב ט"ו כט'],
        summary: 'תגלת פלאסר מלך אשור כבש את ערי הצפון של ממלכת ישראל — עיון, אבל בית מעכה, ינוח, קדש, חצור — ואת כל הגליל ואת ארץ נפתלי, והגלה את תושביהם. זו הייתה הגלות הראשונה שפגעה בממלכת ישראל.',
        verses: [
            { text: 'בִּימֵי פֶּקַח מֶלֶךְ יִשְׂרָאֵל בָּא תִּגְלַת פִּלְאֶסֶר מֶלֶךְ אַשּׁוּר וַיִּקַּח אֶת עִיּוֹן וְאֶת אָבֵל בֵּית מַעֲכָה ... וְאֶת הַגָּלִילָה', ref: 'מלכים ב ט"ו, כט' }
        ]
    },
    17: {
        color: '#e74c3c',
        emoji: '⛓️',
        title: 'הגליית ממלכת ישראל לאשור',
        chapters: ['מלכים ב י"ז א–ו'],
        summary: 'הושע בן אלה, המלך האחרון של ממלכת ישראל, מרד באשור וכרת ברית עם מצרים. שלמנאסר הטיל מצור על שומרון שלוש שנים, ולבסוף כבש וסרגון הגלה את עשרת השבטים — לחלח, לחבור, לגוזן ולערי מדי. השבטים נטמעו בגולה ואבדו.',
        verses: [
            { text: 'וַיֶּגֶל אֶת יִשְׂרָאֵל אַשּׁוּרָה וַיֹּשֶׁב אֹתָם בַּחְלַח וּבְחָבֹור נְהַר גּוֹזָן וְעָרֵי מָדָי', ref: 'מלכים ב י"ז, ו' }
        ]
    },
    18: {
        color: '#2c3e50',
        emoji: '🌄',
        title: 'אשור, בבל ומצרים – מותו של יאשיהו במגידו',
        chapters: ['מלכים ב כ"ג כט–ל'],
        summary: 'פרעה נכה יצא לסייע לאשור נגד בבל. יאשיהו מלך יהודה ניסה לעצור אותו במגידו על דרך הים — ונהרג. למרות מותו, המהלך ההיסטורי התהפך: בבל ניצחה את הקואליציה של מצרים ואשור, ועלתה כמעצמה שולטת שגורלה יכריע את גורלה של ממלכת יהודה.',
        verses: [
            { text: 'בְּיָמָיו עָלָה פַרְעֹה נְכֹה... וַיֵּלֶךְ הַמֶּלֶךְ יֹאשִׁיָּהוּ לִקְרָאתוֹ וַיְמִיתֵהוּ בִּמְגִדֹּו', ref: 'מלכים ב כ"ג, כט' }
        ]
    },
    19: {
        color: '#2c3e50',
        emoji: '🌆',
        title: 'האימפריה הבבלית',
        chapters: ['מלכים ב כ"ד–כ"ה'],
        summary: 'בבל ירשה את השליטה מאשור ועלתה כמעצמה הדומיננטית. נבוכדנאצר מלך בבל פלש ליהודה פעמים אחדות, גלה את מלך יהויכין, ולבסוף החריב את ירושלים ואת בית המקדש בשנת 586 לפנה"ס — סיום פרק ממלכת יהודה.',
        verses: [
            { text: 'בְּיוֹם הַהוּא כָּבְשָׂה יַד ה׳... וַיִּשְׂרֹף אֶת בֵּית ה׳ וְאֶת בֵּית הַמֶּלֶךְ', ref: 'מלכים ב כ"ה, ט' }
        ]
    }
};

function renderMapContext(mapObj) {
    const ctx = MAP_CONTEXTS[mapObj.id];
    const isMobile = window.innerWidth <= 768;

    const overlay   = document.getElementById('map-info-overlay');
    const mioEmoji  = document.getElementById('mio-emoji');
    const mioTitle  = document.getElementById('mio-title');
    const mioHeader = document.getElementById('mio-header');
    const mioBody   = document.getElementById('mio-body');
    const infoBtn   = document.getElementById('map-info-btn');
    const mimHeader = document.getElementById('mim-header');
    const mimBody   = document.getElementById('mim-body');

    // Hide everything when no context for this map
    if (!ctx) {
        if (overlay)  overlay.classList.add('hidden');
        if (infoBtn)  infoBtn.classList.add('hidden');
        return;
    }

    // Build shared body HTML into a given element
    function buildBodyContent(targetEl) {
        targetEl.innerHTML = '';

        if (ctx.chapters && ctx.chapters.length) {
            const chapDiv = document.createElement('div');
            chapDiv.className = 'ctx-chapters';
            ctx.chapters.forEach(ch => {
                const tag = document.createElement('span');
                tag.className = 'ctx-chapter-tag';
                tag.style.background = `${ctx.color}18`;
                tag.style.color = ctx.color;
                tag.textContent = '\uD83D\uDCD6 ' + ch;
                chapDiv.appendChild(tag);
            });
            targetEl.appendChild(chapDiv);
        }

        if (ctx.summary) {
            const sum = document.createElement('p');
            sum.className = 'ctx-summary';
            sum.textContent = ctx.summary;
            targetEl.appendChild(sum);
        }

        if (ctx.verses && ctx.verses.length) {
            ctx.verses.forEach(v => {
                const vEl = document.createElement('div');
                vEl.className = 'ctx-verse';
                vEl.style.borderColor = ctx.color;
                vEl.innerHTML = `"${v.text}"<cite>${v.ref}</cite>`;
                targetEl.appendChild(vEl);
            });
        }
    }

    if (!isMobile) {
        // Desktop: populate the floating overlay (bottom-left of map)
        if (mioEmoji) mioEmoji.textContent = ctx.emoji;
        if (mioTitle) mioTitle.textContent = ctx.title;
        if (mioHeader) mioHeader.style.background = `linear-gradient(135deg, ${ctx.color}ee, ${ctx.color}bb)`;
        if (mioBody)  buildBodyContent(mioBody);

        // Restore minimized state on each new map
        _overlayMinimized = false;
        const minBtn = document.getElementById('mio-minimize');
        if (minBtn) { minBtn.textContent = '\u2013'; minBtn.title = 'מזעור'; }
        if (overlay) { overlay.classList.remove('hidden', 'minimized'); overlay.style.maxHeight = ''; }
    } else {
        // Mobile: populate modal & show ! button
        if (mimHeader) {
            mimHeader.style.background = `linear-gradient(135deg, ${ctx.color}ee, ${ctx.color}bb)`;
            mimHeader.innerHTML = `<span style="font-size:1.4rem">${ctx.emoji}</span>&nbsp;<span>${ctx.title}</span>`;
        }
        if (mimBody) buildBodyContent(mimBody);
        if (infoBtn) infoBtn.classList.remove('hidden');
    }
}

// ---- Desktop overlay minimize / restore ----
let _overlayMinimized = false;
function toggleMapInfoOverlay() {
    const overlay = document.getElementById('map-info-overlay');
    const btn     = document.getElementById('mio-minimize');
    if (!overlay) return;
    _overlayMinimized = !_overlayMinimized;
    if (_overlayMinimized) {
        const headerH = document.getElementById('mio-header').offsetHeight;
        overlay.style.maxHeight = headerH + 'px';
        overlay.classList.add('minimized');
        if (btn) { btn.textContent = '+'; btn.title = 'הצג'; }
    } else {
        overlay.style.maxHeight = '';
        overlay.classList.remove('minimized');
        if (btn) { btn.textContent = '\u2013'; btn.title = 'מזעור'; }
    }
}

// ---- Mobile modal open / close ----
function openMapInfoModal() {
    const modal = document.getElementById('map-info-modal');
    if (modal) modal.classList.remove('hidden');
}

function closeMapInfoModal() {
    const modal = document.getElementById('map-info-modal');
    if (modal) modal.classList.add('hidden');
}

document.addEventListener('DOMContentLoaded', init);
