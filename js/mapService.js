class MapService {
    constructor() {
        this.map = null;
        this.markers = new Map();
        this.markerClusters = new Map();
        this.countryBorders = new Map();
        this.impactCircles = new Map();
        this.mapboxToken = null;
        
        this.newestDate = null;
        this.oldestDate = null;

        this.initRetryCount = 0;
        this.maxRetries = 3;

        // Loading screen element
        this.loadingScreen = document.getElementById('loading-screen');

        console.log('MapService initialized');
        this.initializeMap();

        this.israelCities = new Map();
        this.iranCities = new Map();

        this.markersArray = [];
        this.activeFilters = new Set(['Missile', 'Drone', 'Airstrike', 'Artillery', 'Bomb', 'Mossad Targeted Killings']);
        this.initializeFilters();

        this.markersMap = new Map();

        // Start loading animation timeout
        setTimeout(() => {
            this.hideLoadingScreen();
        }, 2500);
    }

    hideLoadingScreen() {
        if (this.loadingScreen) {
            this.loadingScreen.classList.add('fade-out');
            setTimeout(() => {
                this.loadingScreen.remove();
            }, 300);
        }
    }

    async initializeMap() {
        try {
            console.log('Initializing map...');
            
            // Start Firebase loading early in parallel
            const firebasePromise = this.loadIncidentsFromFirebase();
            
            // Fetch Mapbox token
            const tokenResponse = await fetch('/api/keys/mapbox');
            const data = await tokenResponse.json();
            this.mapboxToken = data.key;
            
            if (!this.mapboxToken) {
                throw new Error('Invalid Mapbox token');
            }

            mapboxgl.accessToken = this.mapboxToken;
            
            this.map = new mapboxgl.Map({
                container: 'map',
                style: 'mapbox://styles/mapbox/dark-v10',
                center: [47.5, 32],
                zoom: 5,
                attributionControl: true,
                projection: 'mercator',
                pitch: 0,
                bearing: 0,
                renderWorldCopies: false
            });

            // Disable map rotation
            this.map.dragRotate.disable();
            this.map.touchZoomRotate.disableRotation();

            // Wait for map to load
            await new Promise((resolve) => {
                this.map.on('load', () => {
                    console.log('Map loaded successfully');
                    resolve();
                });
            });

            // Add controls
            this.map.addControl(new mapboxgl.NavigationControl({
                showCompass: false
            }), 'top-right');
            
            this.map.addControl(new mapboxgl.FullscreenControl(), 'top-right');

            // Add country borders in the background
            this.addCountryBorders().catch(error => {
                console.warn('Error adding country borders:', error);
            });

            // Wait for Firebase data to complete
            await firebasePromise.catch(error => {
                console.error('Error loading incidents:', error);
            });

            console.log('Map initialization completed');

        } catch (error) {
            console.error('Error initializing map:', error);
            if (this.initRetryCount < this.maxRetries) {
                this.initRetryCount++;
                console.log(`Retrying initialization (attempt ${this.initRetryCount})...`);
                setTimeout(() => this.initializeMap(), 2000);
            }
        }
    }

    async loadIncidentsFromFirebase(retryCount = 0) {
        try {
            console.log('Loading incidents from Firebase...');
            
            const newsRef = window.FirebaseService.ref(window.FirebaseService.database, 'news');
            const snapshot = await window.FirebaseService.get(newsRef);
            
            // Clear existing markers (only if they're not manual)
            this.clearAllIncidents(true);

            if (snapshot && snapshot.exists()) {
                const newsData = snapshot.val();
                const incidents = Object.values(newsData);

                // Sort incidents by timestamp
                incidents.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

                // Process first 5 incidents immediately
                const initialIncidents = incidents.slice(0, 5);
                await Promise.all(initialIncidents.map(incident => this.addIncident(incident)));

                // Process remaining incidents in the background
                if (incidents.length > 5) {
                    const remainingIncidents = incidents.slice(5);
                    setTimeout(async () => {
                        await Promise.all(remainingIncidents.map(incident => this.addIncident(incident)));
                        await this.initializeCityStatistics();
                        console.log('All incidents loaded');
                    }, 100);
                } else {
                    await this.initializeCityStatistics();
                }

                console.log(`Initially loaded ${initialIncidents.length} incidents, total: ${incidents.length}`);
            } else {
                console.log('No incidents found in Firebase or failed to fetch');
            }

        } catch (error) {
            console.error('Error in loadIncidentsFromFirebase:', error);
        }
    }

    async addCountryBorders() {
        try {
            return new Promise((resolve) => {
                if (!this.map) {
                    console.error('Map not initialized');
                    resolve();
                    return;
                }

                this.map.addSource('country-borders', {
                    type: 'geojson',
                    data: COUNTRY_BORDERS
                });

                this.map.addLayer({
                    'id': 'country-borders',
                    'type': 'line',
                    'source': 'country-borders',
                    'layout': {
                        'line-join': 'round',
                        'line-cap': 'round'
                    },
                    'paint': {
                        'line-color': '#ff3b30',
                        'line-width': 3,
                        'line-opacity': 0.8,
                        'line-dasharray': [5, 10]
                    }
                });

                this.map.addLayer({
                    'id': 'country-fills',
                    'type': 'fill',
                    'source': 'country-borders',
                    'paint': {
                        'fill-color': '#ff3b30',
                        'fill-opacity': 0.1
                    }
                });

                console.log('Country borders added successfully');
                resolve();
            });
        } catch (error) {
            console.error('Error adding country borders:', error);
        }
    }

    findLocation(locationName) {
        console.log('Looking up location:', locationName);
        
        // Clean up the location name
        const cleanName = locationName.trim()
            .replace(/^(in|at|near|from|to)\s+/i, '') // Remove location prefixes
            .replace(/[,.;].*$/, ''); // Remove everything after comma, period, or semicolon
        
        // Check direct match
        if (CONFIG.knownLocations[cleanName]) {
            console.log('Found exact location match:', cleanName);
            return {
                name: cleanName,
                ...CONFIG.knownLocations[cleanName]
            };
        }
        
        // Check case-insensitive match
        const lowerName = cleanName.toLowerCase();
        for (const [key, coords] of Object.entries(CONFIG.knownLocations)) {
            if (key.toLowerCase() === lowerName) {
                console.log('Found case-insensitive location match:', key);
                return {
                    name: key,
                    ...coords
                };
            }
        }
        
        // Check if the location contains any known location names
        for (const [key, coords] of Object.entries(CONFIG.knownLocations)) {
            if (cleanName.toLowerCase().includes(key.toLowerCase())) {
                console.log('Found partial location match:', key, 'in', cleanName);
                return {
                    name: key,
                    ...coords
                };
            }
        }
        
        console.log('No location match found for:', locationName);
        return null;
    }

    calculateMarkerOffset(location) {
        const lat = location.lat || (location.position && location.position.lat);
        const lon = location.lon || location.lon || (location.position && location.position.lng);
        
        if (typeof lat === 'undefined' || typeof lon === 'undefined') {
            console.error('Invalid location format:', location);
            return { lat: 0, lon: 0 };
        }

        const key = `${lat},${lon}`;
        const existingMarkers = this.markerClusters.get(key) || [];
        const index = existingMarkers.length;

        // Base offset in degrees (approximately 1.5km)
        const baseOffset = 0.015;

        // Simple circular distribution
        switch (index) {
            case 0: // First marker - center
                return { lat: 0, lon: 0 };
            case 1: // Second marker - North
                return { lat: baseOffset, lon: 0 };
            case 2: // Third marker - Southeast
                return { lat: -baseOffset * 0.866, lon: baseOffset * 0.5 };
            case 3: // Fourth marker - Southwest
                return { lat: -baseOffset * 0.866, lon: -baseOffset * 0.5 };
            case 4: // Fifth marker - East
                return { lat: 0, lon: baseOffset };
            case 5: // Sixth marker - West
                return { lat: 0, lon: -baseOffset };
            default: // More than 6 markers
                const angle = (index * Math.PI * 2) / 6;
                const ringIndex = Math.floor((index - 6) / 6) + 2;
                return {
                    lat: baseOffset * ringIndex * Math.cos(angle),
                    lon: baseOffset * ringIndex * Math.sin(angle)
                };
        }
    }

    updateDateRange(timestamp) {
        const date = new Date(timestamp);
        if (!this.newestDate || date > this.newestDate) {
            this.newestDate = date;
        }
        if (!this.oldestDate || date < this.oldestDate) {
            this.oldestDate = date;
        }
    }

    getColorForDate(timestamp) {
        const date = new Date(timestamp);
        
        // If this is the only marker, use the darkest red
        if (!this.newestDate || !this.oldestDate || this.newestDate.getTime() === this.oldestDate.getTime()) {
            return {
                main: '#ff0000',
                fill: '#ff000033',
                ripple: '#ff0000'
            };
        }

        // Calculate how old this marker is relative to the newest one
        const totalRange = this.newestDate.getTime() - this.oldestDate.getTime();
        const ageFromNewest = this.newestDate.getTime() - date.getTime();
        const relativeAge = ageFromNewest / totalRange; // 0 = newest, 1 = oldest

        // Use HSL interpolation from red (0 degrees) to yellow (60 degrees)
        const hue = Math.min(60, Math.round(relativeAge * 60)); // Interpolate hue from 0 to 60
        const saturation = 100; // Keep full saturation
        const lightness = Math.min(50 + (relativeAge * 20), 70); // Gradually increase lightness with age

        const mainColor = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
        const fillColor = `hsla(${hue}, ${saturation}%, ${lightness}%, 0.2)`;
        const rippleColor = mainColor;

        return {
            main: mainColor,
            fill: fillColor,
            ripple: rippleColor
        };
    }

    updateAllMarkerColors() {
        this.markers.forEach((markerData, id) => {
            const { marker, timestamp, impactCircle } = markerData;
            const colorScheme = this.getColorForDate(timestamp);
            
            // Update marker color
            const markerElement = marker.getElement();
            const customMarker = markerElement.querySelector('.custom-marker');
            if (customMarker) {
                customMarker.style.backgroundColor = colorScheme.main;
        }

            // Update ripple color
            const ripples = markerElement.querySelectorAll('.ripple');
            ripples.forEach(ripple => {
                ripple.style.setProperty('--ripple-color', colorScheme.ripple);
            });

            // Update impact circle colors if they exist
            if (impactCircle) {
                ['gradientLayerId', 'outlineLayerId', 'rippleLayerId'].forEach(layerId => {
                    if (this.map.getLayer(impactCircle[layerId])) {
                        if (layerId === 'gradientLayerId') {
                            this.map.setPaintProperty(impactCircle[layerId], 'fill-color', colorScheme.main);
                        } else {
                            this.map.setPaintProperty(impactCircle[layerId], 'line-color', colorScheme.ripple);
                        }
                    }
                });
            }
        });
    }

    createImpactRadiusLayer(id, location, radius) {
        if (!radius || radius <= 0) return null;

        const colorScheme = this.getColorForDate(location.timestamp);
        
        // Create a point feature for the center
        const center = [location.lon, location.lat];
        
        // Create a circle with the specified radius
        const radiusInKm = radius / 1000;
        const options = {
            steps: 64,
            units: 'kilometers'
        };
        
        // Generate circle polygon coordinates
        const coordinates = [];
        const angleStep = 360 / options.steps;
        
        for (let i = 0; i < options.steps; i++) {
            const angle = i * angleStep;
            const lat = location.lat + (radiusInKm / 111.32) * Math.cos(angle * Math.PI / 180);
            const lon = location.lon + (radiusInKm / (111.32 * Math.cos(location.lat * Math.PI / 180))) * Math.sin(angle * Math.PI / 180);
            coordinates.push([lon, lat]);
        }
        coordinates.push(coordinates[0]);

        const circleFeature = {
            'type': 'Feature',
            'geometry': {
                'type': 'Polygon',
                'coordinates': [coordinates]
            },
            'properties': {
                'radius': radius,
                'center': center
            }
        };

        const sourceId = `impact-source-${id}`;
        const layerId = `impact-layer-${id}`;

        if (!this.map.getSource(sourceId)) {
            this.map.addSource(sourceId, {
                'type': 'geojson',
                'data': circleFeature
            });
        }

        if (!this.map.getLayer(layerId)) {
            // Add fill layer for the impact radius with gradient
            this.map.addLayer({
                'id': `${layerId}-gradient`,
                'type': 'fill',
                'source': sourceId,
                'paint': {
                    'fill-color': colorScheme.main,
                    'fill-opacity': [
                        'interpolate',
                        ['linear'],
                        ['zoom'],
                        0, 0.5,
                        22, 0.2
                    ]
                }
            });

            // Add outline layer
            this.map.addLayer({
                'id': `${layerId}-outline`,
                'type': 'line',
                'source': sourceId,
                'paint': {
                    'line-color': colorScheme.main,
                    'line-width': [
                        'interpolate',
                        ['linear'],
                        ['zoom'],
                        0, 1,
                        22, 3
                    ],
                    'line-opacity': 0.8
                }
            });

            // Add ripple effect layer
            this.map.addLayer({
                'id': `${layerId}-ripple`,
                'type': 'line',
                'source': sourceId,
                'paint': {
                    'line-color': colorScheme.ripple,
                    'line-width': [
                        'interpolate',
                        ['linear'],
                        ['zoom'],
                        0, 1,
                        22, 4
                    ],
                    'line-opacity': [
                        'interpolate',
                        ['linear'],
                        ['zoom'],
                        0, 0.6,
                        22, 0.3
                    ]
                }
            });

            // Start the ripple animation
            let progress = 0;
            const animate = () => {
                if (!this.map.getLayer(`${layerId}-ripple`)) return;

                progress = (progress + 0.01) % 1;
                this.map.setPaintProperty(
                    `${layerId}-ripple`,
                    'line-width',
                    [
                        'interpolate',
                        ['linear'],
                        ['zoom'],
                        0, 1 + progress * 2,
                        22, 2 + progress * 4
                    ]
                );

                this.map.setPaintProperty(
                    `${layerId}-ripple`,
                    'line-opacity',
                    [
                        'interpolate',
                        ['linear'],
                        ['zoom'],
                        0, 0.6 * (1 - progress),
                        22, 0.3 * (1 - progress)
                    ]
                );

                requestAnimationFrame(animate);
            };

            animate();
        }

        return { 
            sourceId, 
            layerId,
            gradientLayerId: `${layerId}-gradient`,
            outlineLayerId: `${layerId}-outline`,
            rippleLayerId: `${layerId}-ripple`,
            colorScheme
        };
    }

    createPopupContent(location) {
        const getCountryName = (type) => {
            switch (type) {
                case '1': return 'Iran';
                case '2': return 'Israel';
                case '3': return 'USA';
                default: return 'Unknown';
            }
        };

        const formatDate = (timestamp) => {
            return new Date(timestamp).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            });
        };

        // Handle weapon types
        const weaponTypesHtml = location.weaponType ? 
            (Array.isArray(location.weaponType) ? location.weaponType : location.weaponType.split(','))
                .map(weapon => weapon.trim())
                .filter(weapon => weapon && weapon !== 'No Info' && weapon !== 'Məlumat yoxdur')
                .map(weapon => `<span class="weapon-tag">${weapon}</span>`)
                .join('') : '';

        // Handle casualties data
        const casualties = location.casualties || {};
        const deadCount = casualties.dead || 'Məlumat yoxdur';
        const woundedCount = casualties.wounded || 'Məlumat yoxdur';

        return `
            <div class="incident-popup dark-mode">
                <div class="incident-header">
                    <h3>${location.name}</h3>
                    <div class="date">${formatDate(location.timestamp)}</div>
                </div>
                
                <div class="incident-body">
                    <div class="target-info">
                        <div class="label">Attacker</div>
                        <div class="value">${getCountryName(location.type)}</div>
                    </div>

                    <div class="target-info">
                        <div class="label">Target Location</div>
                        <div class="value">${location.targetType || 'Məlumat yoxdur'}</div>
                    </div>

                    ${weaponTypesHtml ? `
                    <div class="weapon-info">
                        <div class="label">Weapon Types</div>
                        <div class="weapon-tags">
                            ${weaponTypesHtml}
                        </div>
                        ${location.detailedWeapon ? `
                        <div class="detailed-weapon">
                            <div class="label">Detailed Weapon Info</div>
                            <div class="value">${location.detailedWeapon}</div>
                        </div>
                        ` : ''}
                    </div>
                    ` : ''}

                    <div class="casualties-info">
                        <div class="label">Casualties</div>
                        <div class="casualties-grid">
                            <div class="stat-box">
                                <div class="label">Deaths</div>
                                <div class="value">${deadCount}</div>
                            </div>
                            <div class="stat-box">
                                <div class="label">Wounded</div>
                                <div class="value">${woundedCount}</div>
                            </div>
                        </div>
                    </div>

                    ${location.impactRadius ? `
                    <div class="impact-info">
                        <div class="label">Impact Radius</div>
                        <div class="value">${location.impactRadius} meters</div>
                    </div>
                    ` : ''}

                    <div class="coordinates-info">
                        <div class="label">Coordinates</div>
                        <div class="value">${location.lat.toFixed(4)}, ${location.lon.toFixed(4)}</div>
                    </div>
                </div>
            </div>
        `;
    }

    async addIncident(incident) {
        try {
            if (!incident || !incident.id) {
                console.error('Invalid incident data: Missing ID');
                return;
            }

            if (this.markers.has(incident.id)) {
                console.log('Incident already exists:', incident.id);
                return;
            }

            // Get incident data from Firebase
            const incidentData = await this.getIncidentFromFirebase(incident.id);
            const finalData = incidentData || incident;

            // Extract coordinates with thorough validation
            let lat, lon;
            
            // Try to get coordinates from position object first
            if (finalData.position) {
                lat = parseFloat(finalData.position.lat);
                lon = parseFloat(finalData.position.lon || finalData.position.lng);
            }
            // If not found, try location object
            else if (finalData.location) {
                lat = parseFloat(finalData.location.lat);
                lon = parseFloat(finalData.location.lon || finalData.location.lng);
            }
            // If still not found, try direct properties
            else {
                lat = parseFloat(finalData.lat);
                lon = parseFloat(finalData.lon || finalData.lng);
            }

            // Validate coordinates
            if (!this.isValidCoordinate(lat, lon)) {
                console.error('Invalid or missing coordinates for incident:', {
                    id: incident.id,
                    lat,
                    lon,
                    originalData: finalData
                });
                return;
            }

            // Create base location object with required fields
            const location = {
                id: finalData.id,
                lat,
                lon,
                name: this.getLocationName(finalData),
                type: this.getLocationType(finalData),
                timestamp: this.parseTimestamp(finalData.timestamp),
                targetType: finalData.targetType || finalData.specificTarget || 'Unknown Target',
                weaponType: finalData.weaponType || 'Unknown Weapon',
                detailedWeapon: finalData.detailedWeapon || '',
                impactRadius: finalData.impactRadius || 500,
                casualties: {
                    dead: finalData.casualties?.dead ?? 'No Info',
                    wounded: finalData.casualties?.wounded ?? 'No Info'
                }
            };

            // Validate timestamp
            if (!(location.timestamp instanceof Date) || isNaN(location.timestamp)) {
                console.error('Invalid timestamp for incident:', incident.id);
                location.timestamp = new Date(); // Fallback to current time
            }

            // Update date range for color calculation
            this.updateDateRange(location.timestamp);

            // Calculate marker position with offset
            const key = `${location.lat},${location.lon}`;
            if (!this.markerClusters.has(key)) {
                this.markerClusters.set(key, []);
            }
            
            const offset = this.calculateMarkerOffset(location);
            const adjustedLocation = {
                ...location,
                lat: location.lat + offset.lat,
                lon: location.lon + offset.lon
            };

            // Create marker elements with date-based color
            const { container, el, hoverPopup } = this.createMarkerElements(location);

            // Create popup
            const popup = new mapboxgl.Popup({
                offset: 25,
                closeButton: true,
                closeOnClick: false,
                className: 'custom-popup dark-mode',
                maxWidth: '250px'
            });

            // Create the marker
            const marker = new mapboxgl.Marker({
                element: container,
                anchor: 'center'
            })
                .setLngLat([adjustedLocation.lon, adjustedLocation.lat])
                .setPopup(popup)
                .addTo(this.map);

            // Add to clusters array
            this.markerClusters.get(key).push({
                marker,
                location: adjustedLocation,
                offset
            });

            // Update popup content
            this.updatePopupContent(popup, location);

            // Add hover effects
            this.addMarkerHoverEffects(container, el, popup, location);

            // Store marker data
            const markerData = {
                marker,
                timestamp: location.timestamp,
                originalLocation: location,
                impactCircle: null,
                weaponTypes: Array.isArray(location.weaponType) 
                    ? location.weaponType 
                    : location.weaponType?.split(',').map(w => w.trim()) || []
            };

            // Store in markers Map
            this.markers.set(location.id, markerData);

            // Add impact radius if specified
            if (location.impactRadius) {
                const impactCircle = this.createImpactRadiusLayer(location.id, adjustedLocation, location.impactRadius);
                markerData.impactCircle = impactCircle;
            }

            // Update colors of all markers since the date range might have changed
            this.updateAllMarkerColors();

            // Apply current filters
            this.applyFilters();

            console.log('Incident added successfully:', location.id);
        } catch (error) {
            console.error('Error adding incident:', error);
        }
    }

    async getIncidentFromFirebase(id) {
        try {
            const newsRef = window.FirebaseService.ref(window.FirebaseService.database, `news/${id}`);
            const snapshot = await window.FirebaseService.get(newsRef);
            return snapshot.exists() ? snapshot.val() : null;
        } catch (error) {
            console.error('Error fetching incident from Firebase:', error);
            return null;
        }
    }

    createMarkerElements(location) {
        const colorScheme = this.getColorForDate(location.timestamp);

        const container = document.createElement('div');
        container.className = 'marker-container';
        container.style.setProperty('--marker-color', colorScheme.main);
        container.style.width = '32px';
        container.style.height = '32px';

        const el = document.createElement('div');
        el.className = 'custom-marker';
        el.style.backgroundColor = colorScheme.main;

        // Add rocket icon
        const rocketIcon = document.createElement('img');
        rocketIcon.src = 'img/rocket.png';
        rocketIcon.className = 'marker-icon';
        el.appendChild(rocketIcon);

        const rippleContainer = document.createElement('div');
        rippleContainer.className = 'ripple-container';

        const ripple1 = document.createElement('div');
        ripple1.className = 'ripple ripple-1';
        ripple1.style.setProperty('--ripple-color', colorScheme.main);

        const ripple2 = document.createElement('div');
        ripple2.className = 'ripple ripple-2';
        ripple2.style.setProperty('--ripple-color', colorScheme.main);

        // Create hover popup
        const hoverPopup = document.createElement('div');
        hoverPopup.className = 'marker-hover-popup';
        hoverPopup.style.display = 'none';
        hoverPopup.innerHTML = `
            <div class="hover-popup-content">
                <div class="hover-city">${location.name}</div>
                <div class="hover-date">${new Date(location.timestamp).toLocaleDateString('en-US', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric'
                })}</div>
            </div>
        `;

        rippleContainer.appendChild(ripple1);
        rippleContainer.appendChild(ripple2);
        container.appendChild(rippleContainer);
        container.appendChild(el);
        container.appendChild(hoverPopup);

        return { container, el, hoverPopup };
    }

    updatePopupContent(popup, location) {
        const content = document.createElement('div');
        content.className = 'incident-popup dark-mode';

        // Header section
        const header = document.createElement('div');
        header.className = 'incident-header';
        header.innerHTML = `
            <h3>${location.name || 'Unknown Location'}</h3>
            <div class="date">${location.timestamp.toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'long',
                day: 'numeric'
            })}</div>
        `;
        content.appendChild(header);

        // Body section
        const body = document.createElement('div');
        body.className = 'incident-body';

        // Attacker info
        const attackerInfo = document.createElement('div');
        attackerInfo.className = 'target-info';
        attackerInfo.innerHTML = `
            <div class="label">Attacker</div>
            <div class="value">${location.type === '1' ? 'Iran' : location.type === '2' ? 'Israel' : 'USA'}</div>
        `;
        body.appendChild(attackerInfo);

        // Target location
        const targetInfo = document.createElement('div');
        targetInfo.className = 'target-info';
        targetInfo.innerHTML = `
            <div class="label">Target Location</div>
            <div class="value">${location.targetType || 'Məlumat yoxdur'}</div>
        `;
        body.appendChild(targetInfo);

        // Weapon types
        if (location.weaponType) {
            const weaponTypes = Array.isArray(location.weaponType) 
                ? location.weaponType 
                : location.weaponType.split(',');

            if (weaponTypes.length > 0) {
                const weaponInfo = document.createElement('div');
                weaponInfo.className = 'weapon-info';
                weaponInfo.innerHTML = `
                    <div class="label">Weapon Types</div>
                    <div class="weapon-tags">
                        ${weaponTypes
                            .map(weapon => weapon.trim())
                            .filter(weapon => weapon && weapon !== 'No Info' && weapon !== 'Məlumat yoxdur')
                            .map(weapon => `<span class="weapon-tag">${weapon}</span>`)
                            .join('')}
                    </div>
                    ${location.detailedWeapon ? `
                        <div class="detailed-weapon">
                            <div class="label">Detailed Weapon Info</div>
                            <div class="value">${location.detailedWeapon}</div>
                        </div>
                    ` : ''}
                `;
                body.appendChild(weaponInfo);
            }
        }

        // Casualties
        const casualtiesInfo = document.createElement('div');
        casualtiesInfo.className = 'casualties-info';
        casualtiesInfo.innerHTML = `
            <div class="label">Casualties</div>
                    <div class="casualties-grid">
                        <div class="stat-box">
                    <div class="label">Deaths</div>
                    <div class="value">${location.casualties?.dead || 'Məlumat yoxdur'}</div>
                        </div>
                <div class="stat-box">
                    <div class="label">Wounded</div>
                    <div class="value">${location.casualties?.wounded || 'Məlumat yoxdur'}</div>
                    </div>
            </div>
        `;
        body.appendChild(casualtiesInfo);

        // Impact radius
        if (location.impactRadius) {
            const impactInfo = document.createElement('div');
            impactInfo.className = 'impact-info';
            impactInfo.innerHTML = `
                <div class="label">Impact Radius</div>
                <div class="value">${location.impactRadius} meters</div>
            `;
            body.appendChild(impactInfo);
        }

        // Coordinates
        const coordsInfo = document.createElement('div');
        coordsInfo.className = 'coordinates-info';
        coordsInfo.innerHTML = `
            <div class="label">Coordinates</div>
            <div class="value">${location.lat.toFixed(4)}, ${location.lon.toFixed(4)}</div>
        `;
        body.appendChild(coordsInfo);

        content.appendChild(body);
        popup.setDOMContent(content);
    }

    addMarkerHoverEffects(container, el, popup, location) {
        let isExpanded = false;
        let hoverTimeout = null;
        const hoverPopup = container.querySelector('.marker-hover-popup');

        // Add hover effects
        container.addEventListener('mouseenter', () => {
            if (!isExpanded) {
                hoverTimeout = setTimeout(() => {
                    if (hoverPopup) {
                        hoverPopup.style.display = 'block';
                        container.style.zIndex = '1000';
                    }
                }, 0);
            }
        });

        container.addEventListener('mouseleave', () => {
            if (hoverTimeout) {
                clearTimeout(hoverTimeout);
                hoverTimeout = null;
            }
            if (hoverPopup) {
                hoverPopup.style.display = 'none';
                if (!isExpanded) {
                    container.style.zIndex = '';
                }
            }
        });

        container.addEventListener('click', (e) => {
            e.stopPropagation();
            
            if (hoverTimeout) {
                clearTimeout(hoverTimeout);
                hoverTimeout = null;
            }
            if (hoverPopup) {
                hoverPopup.style.display = 'none';
            }
            
            const colorScheme = this.getColorForDate(location.timestamp);
            
            this.markers.forEach((markerData) => {
                if (markerData.marker.getPopup().isOpen()) {
                    markerData.marker.getPopup().remove();
                    const markerEl = markerData.marker.getElement();
                    markerEl.style.width = '32px';
                    markerEl.style.height = '32px';
                    markerEl.style.zIndex = '';
                    markerEl.querySelector('.custom-marker').style.backgroundColor = this.getColorForDate(markerData.timestamp).main;
                    
                    if (markerData.impactCircle) {
                        this.highlightImpactRadius(markerData.impactCircle, false);
                    }
                }
            });
            
            if (isExpanded) {
                popup.remove();
                container.style.width = '32px';
                container.style.height = '32px';
                container.style.zIndex = '';
                el.style.backgroundColor = colorScheme.main;
                
                const impactCircle = this.markers.get(location.id)?.impactCircle;
                if (impactCircle) {
                    this.highlightImpactRadius(impactCircle, false);
                }
            } else {
                popup.addTo(this.map);
                container.style.width = '40px';
                container.style.height = '40px';
                container.style.zIndex = '1000';
                
                const date = new Date(location.timestamp);
                const totalRange = this.newestDate.getTime() - this.oldestDate.getTime();
                const ageFromNewest = this.newestDate.getTime() - date.getTime();
                const relativeAge = ageFromNewest / totalRange;
                const hue = Math.min(60, Math.round(relativeAge * 60));
                const saturation = 100;
                const lightness = Math.min(60 + (relativeAge * 20), 80);
                
                el.style.backgroundColor = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
                
                const impactCircle = this.markers.get(location.id)?.impactCircle;
                if (impactCircle) {
                    this.highlightImpactRadius(impactCircle, true);
                }
            }

            isExpanded = !isExpanded;
        });

        popup.on('close', () => {
            if (isExpanded) {
                container.style.width = '32px';
                container.style.height = '32px';
                container.style.zIndex = '';
                el.style.backgroundColor = this.getColorForDate(location.timestamp).main;
                
                const impactCircle = this.markers.get(location.id)?.impactCircle;
                if (impactCircle) {
                    this.highlightImpactRadius(impactCircle, false);
                }
                isExpanded = false;
            }
        });
    }

    highlightImpactRadius(impactCircle, highlight) {
        const opacity = highlight ? 
            [['interpolate', ['linear'], ['zoom'], 0, 0.7, 22, 0.4]] :
            [['interpolate', ['linear'], ['zoom'], 0, 0.5, 22, 0.2]];
        
        const lineWidth = highlight ?
            [['interpolate', ['linear'], ['zoom'], 0, 2, 22, 4]] :
            [['interpolate', ['linear'], ['zoom'], 0, 1, 22, 3]];
        
        const lineOpacity = highlight ?
            [['interpolate', ['linear'], ['zoom'], 0, 0.8, 22, 0.5]] :
            [['interpolate', ['linear'], ['zoom'], 0, 0.6, 22, 0.3]];

        this.map.setPaintProperty(impactCircle.gradientLayerId, 'fill-opacity', opacity);
        this.map.setPaintProperty(impactCircle.outlineLayerId, 'line-width', lineWidth);
        this.map.setPaintProperty(impactCircle.rippleLayerId, 'line-opacity', lineOpacity);
    }

    removeIncident(id) {
        console.log('Removing incident:', id);
        if (this.markers.has(id)) {
            const { marker, originalLocation, impactCircle } = this.markers.get(id);
            
            // Remove impact radius layers if they exist
            if (impactCircle) {
                // Remove ripple layer
                if (this.map.getLayer(impactCircle.rippleLayerId)) {
                    this.map.removeLayer(impactCircle.rippleLayerId);
                }
                
                if (this.map.getLayer(impactCircle.outlineLayerId)) {
                    this.map.removeLayer(impactCircle.outlineLayerId);
                }
                if (this.map.getLayer(impactCircle.layerId)) {
                    this.map.removeLayer(impactCircle.layerId);
                }
                if (this.map.getSource(impactCircle.sourceId)) {
                    this.map.removeSource(impactCircle.sourceId);
                }
            }
            
            // Remove from cluster
            const key = `${originalLocation.lat},${originalLocation.lon}`;
            if (this.markerClusters.has(key)) {
                const cluster = this.markerClusters.get(key);
                const index = cluster.indexOf(marker);
                if (index > -1) {
                    cluster.splice(index, 1);
                }
                if (cluster.length === 0) {
                    this.markerClusters.delete(key);
                }
            }

            marker.remove();
            this.markers.delete(id);
            console.log('Incident removed:', id);
        }
    }

    clearOldIncidents(maxAge) {
        console.log('Clearing old incidents...');
        const now = Date.now();
        this.markers.forEach(({ marker, timestamp }, id) => {
            if (now - timestamp.getTime() > maxAge) {
                this.removeIncident(id);
            }
        });
    }

    clearAllIncidents(preserveManual = true) {
        console.log('Clearing incidents from map', preserveManual ? '(preserving manual markers)' : '(clearing all)');
        
        // Store manual markers if we need to preserve them
        const manualMarkers = new Map();
        if (preserveManual) {
            this.markers.forEach((markerData, id) => {
                if (id.startsWith('manual-')) {
                    manualMarkers.set(id, markerData);
                }
            });
        }

        this.markers.forEach(({ marker, impactCircle }, id) => {
            // Skip manual markers if preserving
            if (preserveManual && id.startsWith('manual-')) {
                return;
            }

            // Remove marker
            if (marker) {
            marker.remove();
            }

            // Remove impact circle layers
            if (impactCircle) {
                ['rippleLayerId', 'outlineLayerId', 'gradientLayerId'].forEach(layerId => {
                    if (this.map.getLayer(impactCircle[layerId])) {
                        this.map.removeLayer(impactCircle[layerId]);
                    }
                });
                if (this.map.getSource(impactCircle.sourceId)) {
                    this.map.removeSource(impactCircle.sourceId);
                }
            }
        });

        // Clear all markers except manual ones if preserving
        if (preserveManual) {
        this.markers.clear();
            // Restore manual markers
            manualMarkers.forEach((markerData, id) => {
                this.markers.set(id, markerData);
            });
        } else {
            this.markers.clear();
        }

        this.markerClusters.clear();
        this.impactCircles.clear();

        // Clear markersMap as well
        this.markersMap.clear();

        console.log('Incidents cleared', preserveManual ? '(manual markers preserved)' : '(all cleared)');
    }

    initializeInfoSection() {
        // Add click handler for info link
        const infoLink = document.getElementById('info-link');
        const infoSection = document.getElementById('info-section');
        
        if (infoLink && infoSection) {
            infoLink.addEventListener('click', (e) => {
                e.preventDefault();
                
                // Close news section if it's open
                const newsSection = document.getElementById('news-section');
                if (newsSection) {
                    newsSection.classList.remove('show');
                }
                
                // Toggle info section
                infoSection.classList.toggle('show');
                
                console.log('Info section toggled');
            });
            
            console.log('Info section initialized');
        } else {
            console.error('Info link or section not found');
        }
    }

    initializeFilters() {
        // Add event listeners for filter checkboxes
        const filterOptions = document.querySelectorAll('#weapon-filters input[type="checkbox"]');
        filterOptions.forEach(checkbox => {
            checkbox.addEventListener('change', () => {
                if (checkbox.checked) {
                    this.activeFilters.add(checkbox.value);
                } else {
                    this.activeFilters.delete(checkbox.value);
                }
                this.applyFilters();
            });
        });

        // Add event listeners for filter buttons
        document.getElementById('select-all-filters').addEventListener('click', () => {
            filterOptions.forEach(checkbox => {
                checkbox.checked = true;
                this.activeFilters.add(checkbox.value);
            });
            this.applyFilters();
        });

        document.getElementById('clear-all-filters').addEventListener('click', () => {
            filterOptions.forEach(checkbox => {
                checkbox.checked = false;
                this.activeFilters.clear();
            });
            this.applyFilters();
        });
    }

    applyFilters() {
        console.log('Applying filters:', Array.from(this.activeFilters));
        
        this.markers.forEach((markerData, id) => {
            const { marker, impactCircle, weaponTypes } = markerData;
            if (!marker) return;

            const markerElement = marker.getElement();
            if (!markerElement) return;

            // If no weapon types or no active filters, hide the marker
            if (!weaponTypes || weaponTypes.length === 0 || this.activeFilters.size === 0) {
                markerElement.style.display = 'none';
                this.updateImpactCircleVisibility(impactCircle, false);
                return;
            }

            // Show marker if any of its weapon types match active filters
            const shouldShow = weaponTypes.some(type => 
                type && this.activeFilters.has(type.trim())
            );

            markerElement.style.display = shouldShow ? 'block' : 'none';
            this.updateImpactCircleVisibility(impactCircle, shouldShow);
        });
    }
            
    updateImpactCircleVisibility(impactCircle, isVisible) {
        if (!impactCircle) return;
            
                ['gradientLayerId', 'outlineLayerId', 'rippleLayerId'].forEach(layerId => {
            const layer = impactCircle[layerId];
            if (layer && this.map.getLayer(layer)) {
                        this.map.setLayoutProperty(
                    layer,
                            'visibility',
                    isVisible ? 'visible' : 'none'
                        );
            }
        });
    }

    zoomToLocation(lat, lon, zoomLevel = 12) {
        if (!this.map) return;
        
        this.previousView = {
            center: this.map.getCenter(),
            zoom: this.map.getZoom()
        };

        this.map.flyTo({
            center: [lon, lat],
            zoom: zoomLevel,
            duration: 800
        });
    }

    resetZoom() {
        if (!this.map || !this.previousView) return;
        
        this.map.flyTo({
            center: this.previousView.center,
            zoom: this.previousView.zoom,
            duration: 800
        });
    }

    // Helper method to validate coordinates
    isValidCoordinate(lat, lon) {
        if (typeof lat !== 'number' || typeof lon !== 'number') return false;
        if (isNaN(lat) || isNaN(lon)) return false;
        if (lat === 0 && lon === 0) return false;
        
        // Basic coordinate range check
        if (lat < -90 || lat > 90) return false;
        if (lon < -180 || lon > 180) return false;
        
        return true;
    }

    // Helper method to get location name with fallbacks
    getLocationName(data) {
        return data.targetCity || 
               data.location?.name || 
               data.name || 
               'Unknown Location';
    }

    // Helper method to get location type with fallbacks
    getLocationType(data) {
        return data.type || 
               data.country || 
               'Unknown Type';
    }

    // Helper method to parse and validate timestamp
    parseTimestamp(timestamp) {
        if (!timestamp) return new Date();
        
        const parsed = new Date(timestamp);
        if (isNaN(parsed.getTime())) {
            console.warn('Invalid timestamp, using current time');
            return new Date();
        }
        return parsed;
    }

    async initializeCityStatistics() {
        try {
            const newsRef = window.FirebaseService.ref(window.FirebaseService.database, 'news');
            const snapshot = await window.FirebaseService.get(newsRef);

            if (snapshot.exists()) {
                const newsData = snapshot.val();
                
                // Clear existing maps
                this.israelCities.clear();
                this.iranCities.clear();

                // Process each news item
                Object.entries(newsData).forEach(([id, newsItem]) => {
                    if (id.startsWith('manual-') && newsItem.location && newsItem.location.name) {
                        const cityName = newsItem.location.name;
                        const timestamp = new Date(newsItem.timestamp);
                        const dateStr = timestamp.toLocaleDateString('az-AZ', {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit'
                        });

                        // Function to update city data
                        const updateCityData = (cityMap, city, date) => {
                            if (!cityMap.has(city)) {
                                cityMap.set(city, {
                                    count: 0,
                                    dates: new Set()
                                });
                            }
                            const cityData = cityMap.get(city);
                            if (!cityData.dates.has(date)) {
                                cityData.count++;
                                cityData.dates.add(date);
                            }
                        };

                        // Check if the city is in Israel or Iran
                        if (this.isIsraeliCity(cityName)) {
                            updateCityData(this.israelCities, cityName, dateStr);
                        } else if (this.isIranianCity(cityName)) {
                            updateCityData(this.iranCities, cityName, dateStr);
                        }
                    }
                });

                // Update the UI
                this.updateCityStatistics();
                console.log('City statistics initialized:', {
                    israelCities: Array.from(this.israelCities.entries()),
                    iranCities: Array.from(this.iranCities.entries())
                });
            }
        } catch (error) {
            console.error('Error initializing city statistics:', error);
        }
    }

    // Helper method to check if a city is in Israel
    isIsraeliCity(city) {
        const israeliCities = [
            'Tel Aviv', 'Jerusalem', 'Haifa', 'Beer Sheva', 'Dimona',
            'Ashkelon', 'Ashdod', 'Netanya', 'Herzliya', 'Ramat Gan',
            'Rehovot', 'Rishon LeZion', 'Eilat', 'Holon', 'Petah Tikva',
            'Bat Yam', 'Nahariya', 'Kiryat Gat', 'Kiryat Shmona', 'Acre',
            'Safed', 'Kiryat Ekron', 'Bnei Brak', 'Caesarea', 'Azor',
            'Karmiel', 'Gush Dan', 'West Jerusalem', 'Tamra', 'Beit Shean'
        ];
        return israeliCities.includes(city);
    }

    // Helper method to check if a city is in Iran
    isIranianCity(city) {
        const iranianCities = [
            'Tehran', 'Isfahan', 'Natanz', 'Bushehr', 'Tabriz',
            'Shiraz', 'Kerman', 'Yazd', 'Arak', 'Qom',
            'Karaj', 'Mashhad', 'Bandar Abbas', 'Kermanshah', 'Hamadan',
            'Urmia', 'Khorramabad', 'Ahvaz', 'Chabahar', 'Zanjan',
            'Qazvin', 'Khorramshahr', 'Dezful', 'Birjand', 'Semnan',
            'Bandar-e Mahshahr', 'Fordow', 'Khondab', 'Parchin',
            'Piranshahr', 'Kashan', 'Khojir', 'Javadabad',
            'Najafabad', 'Malard', 'Ijrud', 'Baherestan', 'Robat Karim',
            'Shahr-e Ray', 'Western Iran'
        ];
        return iranianCities.includes(city);
    }

    updateCityStatistics() {
        // Update counts in the UI
        document.getElementById('israel-cities-count').textContent = this.israelCities.size;
        document.getElementById('iran-cities-count').textContent = this.iranCities.size;

        // Update city lists
        this.updateCityList('israel-cities-list', this.israelCities);
        this.updateCityList('iran-cities-list', this.iranCities);
    }

    updateCityList(elementId, cityMap) {
        const ul = document.getElementById(elementId);
        if (!ul) return;
        
        ul.innerHTML = '';
        
        [...cityMap.entries()]
            .sort(([cityA], [cityB]) => cityA.localeCompare(cityB))
            .forEach(([city, data]) => {
                const li = document.createElement('li');
                
                const cityName = document.createElement('div');
                cityName.className = 'city-name';
                cityName.textContent = `${city} (${data.dates.size} times)`;
                
                const datesContainer = document.createElement('div');
                datesContainer.className = 'attack-dates';
                
                const sortedDates = [...data.dates]
                    .sort((a, b) => new Date(b) - new Date(a));
                
                sortedDates.forEach(date => {
                    const dateSpan = document.createElement('span');
                    dateSpan.className = 'attack-date';
                    dateSpan.textContent = date;

                    // Add hover and click functionality
                    dateSpan.addEventListener('mouseenter', () => {
                        this.highlightMarkersForCityAndDate(city, date);
                    });

                    dateSpan.addEventListener('mouseleave', () => {
                        this.resetMarkerHighlights();
                    });

                    dateSpan.addEventListener('click', (e) => {
                        e.stopPropagation();
                        this.zoomToCity(city);
                    });

                    datesContainer.appendChild(dateSpan);
                });
                
                li.appendChild(cityName);
                li.appendChild(datesContainer);
                ul.appendChild(li);

                // Add hover and click functionality for the entire city
                li.addEventListener('mouseenter', () => {
                    this.highlightMarkersForCity(city);
                });

                li.addEventListener('mouseleave', () => {
                    this.resetMarkerHighlights();
                });

                li.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.zoomToCity(city);
                });
            });
    }

    highlightMarkersForCityAndDate(city, date) {
        this.markers.forEach((markerData, id) => {
            if (markerData.originalLocation.name === city) {
                const markerDate = new Date(markerData.timestamp);
                const markerDateStr = markerDate.toLocaleDateString('az-AZ', {
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit'
                });
                
                if (markerDateStr === date) {
                    this.highlightMarker(markerData, true);
                }
            }
        });
    }

    highlightMarkersForCity(city) {
        this.markers.forEach((markerData, id) => {
            if (markerData.originalLocation.name === city) {
                this.highlightMarker(markerData, true);
            }
        });
    }

    highlightMarker(markerData, highlight) {
        const markerElement = markerData.marker.getElement();
        if (highlight) {
            markerElement.style.transform = `${markerElement.style.transform} scale(1.3)`;
            markerElement.style.zIndex = '1000';
            
            if (markerData.impactCircle) {
                this.highlightImpactRadius(markerData.impactCircle, true);
            }
        } else {
            markerElement.style.transform = markerElement.style.transform.replace(' scale(1.3)', '');
            markerElement.style.zIndex = '';
            
            if (markerData.impactCircle) {
                this.highlightImpactRadius(markerData.impactCircle, false);
            }
        }
    }

    resetMarkerHighlights() {
        this.markers.forEach((markerData) => {
            this.highlightMarker(markerData, false);
        });
    }

    zoomToCity(city) {
        const cityMarkers = [];
        this.markers.forEach((markerData) => {
            if (markerData.originalLocation.name === city) {
                cityMarkers.push(markerData);
            }
        });

        if (cityMarkers.length > 0) {
            let centerLat = 0;
            let centerLon = 0;
            cityMarkers.forEach(markerData => {
                centerLat += markerData.originalLocation.lat;
                centerLon += markerData.originalLocation.lon;
            });
            centerLat /= cityMarkers.length;
            centerLon /= cityMarkers.length;

            this.map.flyTo({
                center: [centerLon, centerLat],
                zoom: 10,
                duration: 1000
            });
        }
    }
} 