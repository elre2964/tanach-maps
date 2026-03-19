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
        const deltaY = startY - e.touches[0].clientY;
        const newHeight = startHeight + deltaY;
        
        // Limits
        const maxHeight = window.innerHeight * 0.95;
        const minHeight = 60;
        
        if (newHeight >= minHeight && newHeight <= maxHeight) {
            sidebar.style.height = `${newHeight}px`;
        }
    };

    const onTouchEnd = () => {
        if (!isDragging) return;
        isDragging = false;
        sidebar.classList.remove('dragging');
        
        const currentHeight = sidebar.offsetHeight;
        // Snap logic: if too short, collapse
        if (currentHeight < 100) {
            sidebar.classList.add('collapsed');
            sidebar.style.height = ''; 
        } else if (currentHeight > window.innerHeight * 0.8) {
            // Snap to full
            sidebar.style.height = '95vh';
        }
        setTimeout(() => map.invalidateSize(), 300);
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
        
        // Basic collision check for labels
        citiesToDraw.forEach((c1, i) => {
            let offsetClass = "";
            const coord1 = editorPlaces[c1.name] || MAP_DATA.places[c1.name];
            if (!coord1) return;

            citiesToDraw.forEach((c2, j) => {
                if (i === j) return;
                const coord2 = editorPlaces[c2.name] || MAP_DATA.places[c2.name];
                if (!coord2) return;

                const dist = calculateDistance(coord1, coord2);
                if (dist < 0.15) { // Increased proximity threshold for label overlap
                    // Vertical overlap logic
                    if (coord1[0] > coord2[0]) {
                        offsetClass = "offset-up";
                    } else if (coord1[0] < coord2[0]) {
                        offsetClass = "offset-down";
                    } else {
                        // Same latitude? Use index order to decide
                        offsetClass = (i < j) ? "offset-up" : "offset-down";
                    }

                    // Secondary: Check horizontal proximity for additional offsetting if needed
                    if (Math.abs(coord1[1] - coord2[1]) < 0.05) {
                        if (coord1[1] < coord2[1]) {
                             // This city is to the left of the other
                             // Since text is on the right, we might need more room or a left offset
                        }
                    }
                }
            });
            drawCity(c1.name, c1.faded, offsetClass);
        });
    }
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
    container.classList.remove('z-low', 'z-mid', 'z-high');
    if (z <= 7) container.classList.add('z-low');
    else if (z >= 10) container.classList.add('z-high');
    else container.classList.add('z-mid');
}

document.addEventListener('DOMContentLoaded', init);
