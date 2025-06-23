class MapService {
    constructor() {
        this.map = null;
        this.markers = new Map();
        this.markerClusters = new Map(); // Store markers by location
        this.countryBorders = new Map(); // Store country border layers
        this.impactCircles = new Map(); // Store impact radius circles
        this.mapboxToken = null; // Will be fetched from server
        
        // Define color schemes for different radius ranges
        this.radiusColors = {
            900: {
                main: '#FF0000',      // Bright red
                fill: '#FF000033',    // Semi-transparent red
                ripple: '#FF0000'     // Red for ripple
            },
            800: {
                main: '#FF4500',      // Orange Red
                fill: '#FF450033',    // Semi-transparent orange red
                ripple: '#FF4500'     // Orange red for ripple
            },
            700: {
                main: '#FF6B00',      // Dark Orange
                fill: '#FF6B0033',    // Semi-transparent dark orange
                ripple: '#FF6B00'     // Dark orange for ripple
            },
            600: {
                main: '#FF8C00',      // Orange
                fill: '#FF8C0033',    // Semi-transparent orange
                ripple: '#FF8C00'     // Orange for ripple
            },
            500: {
                main: '#FFA500',      // Light Orange
                fill: '#FFA50033',    // Semi-transparent light orange
                ripple: '#FFA500'     // Light orange for ripple
            }
        };

        console.log('MapService initialized');
        this.initializeMap();

        // Instead of Sets, use Maps to track cities with their attack details
        this.israelCities = new Map(); // city -> { count: number, dates: Set<string> }
        this.iranCities = new Map();

        // Initialize city statistics from Firebase
        this.initializeCityStatistics();
    }

    async initializeMap() {
        try {
            console.log('Initializing map...');
            
            // Fetch Mapbox token from server
            const response = await fetch('http://localhost:8000/api/keys/mapbox');
            const data = await response.json();
            this.mapboxToken = data.key;
            
            mapboxgl.accessToken = this.mapboxToken;
            
            this.map = new mapboxgl.Map({
                container: 'map',
                style: 'mapbox://styles/mapbox/dark-v11',
                center: CONFIG.map.center.reverse(),
                zoom: CONFIG.map.zoom,
                attributionControl: true,
                pitch: 0,
                bearing: 0
            });

            // Wait for map to load
            await new Promise((resolve) => {
                this.map.on('load', () => {
                    console.log('Map loaded successfully');
                    resolve();
                });
            });

            // Add controls after map is loaded
            this.map.addControl(new mapboxgl.NavigationControl({
                showCompass: false
            }), 'top-right');
            
            this.map.addControl(new mapboxgl.FullscreenControl(), 'top-right');

            // Initialize other components
            await this.addCountryBorders();
            this.initializeInfoSection();
            await this.initializeCityStatistics();
            
            console.log('Map initialization completed');

            // Start loading incidents after map is fully initialized
            await this.loadIncidentsFromFirebase();

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
        if (!this.isInitialized) {
            console.log('Map not initialized yet, waiting...');
            if (retryCount < this.maxRetries) {
                setTimeout(() => this.loadIncidentsFromFirebase(retryCount + 1), 1000);
            }
            return;
        }

        try {
            console.log('Loading incidents from Firebase...');
            const newsRef = window.FirebaseService.ref(window.FirebaseService.database, 'news');
            const snapshot = await window.FirebaseService.get(newsRef);

            if (snapshot.exists()) {
                const newsData = snapshot.val();
                const incidents = Object.values(newsData);

                // Sort incidents by timestamp
                incidents.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

                // Clear existing markers
                this.clearAllIncidents();

                // Add markers with delay to prevent overwhelming
                for (const incident of incidents) {
                    await this.addIncident(incident);
                    await new Promise(resolve => setTimeout(resolve, 50)); // Small delay between each marker
                }

                console.log(`Successfully loaded ${incidents.length} incidents`);
            } else {
                console.log('No incidents found in Firebase');
            }
        } catch (error) {
            console.error('Error loading incidents:', error);
            if (retryCount < this.maxRetries) {
                console.log(`Retrying loading incidents (attempt ${retryCount + 1})...`);
                setTimeout(() => this.loadIncidentsFromFirebase(retryCount + 1), 2000);
            }
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

    // Calculate offset for overlapping markers
    calculateMarkerOffset(location) {
        // Handle both old and new format
        const lat = location.lat || (location.position && location.position.lat);
        const lon = location.lon || location.lon || (location.position && location.position.lng);
        
        if (typeof lat === 'undefined' || typeof lon === 'undefined') {
            console.error('Invalid location format:', location);
            return { lat: 0, lon: 0 };
        }

        const key = `${lat},${lon}`;
        if (!this.markerClusters.has(key)) {
            this.markerClusters.set(key, []);
            return { lat: 0, lon: 0 };
        }

        const existingMarkers = this.markerClusters.get(key);
        const offset = 0.001; // approximately 100 meters
        const angle = (2 * Math.PI * existingMarkers.length) / 8; // Distribute in a circle
        
        return {
            lat: offset * Math.cos(angle),
            lon: offset * Math.sin(angle)
        };
    }

    // Get color scheme based on radius
    getColorScheme(radius) {
        // Find the closest radius category
        const radiusCategories = Object.keys(this.radiusColors)
            .map(Number)
            .sort((a, b) => b - a); // Sort in descending order

        for (const category of radiusCategories) {
            if (radius >= category) {
                return this.radiusColors[category];
            }
        }

        // Default color scheme if no match found
        return this.radiusColors[500]; // Use the lowest category colors
    }

    createImpactRadiusLayer(id, location, radius) {
        if (!radius || radius <= 0) return null;

        const colorScheme = this.getColorScheme(radius);
        
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
            return type === '1' ? 'Israel' : 'Iran';
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
        console.log('Adding incident with raw data:', incident);
        try {
            if (this.markers.has(incident.id)) {
                console.log('Incident already exists:', incident.id);
                return;
            }

            // Get incident data from Firebase
            const incidentData = await this.getIncidentFromFirebase(incident.id);
            console.log('Fetched incident data from Firebase:', incidentData);

            // If we have data from Firebase, use it; otherwise use the provided incident data
            const finalData = incidentData || incident;

            // Create base location object
            const location = {
                id: finalData.id,
                lat: finalData.position?.lat || finalData.location?.lat,
                lon: finalData.position?.lng || finalData.location?.lon,
                name: finalData.targetCity || finalData.location?.name || finalData.name,
                type: finalData.type || finalData.country,
                timestamp: new Date(finalData.timestamp),
                targetType: finalData.targetType || finalData.specificTarget,
                weaponType: finalData.weaponType,
                detailedWeapon: finalData.detailedWeapon,
                impactRadius: finalData.impactRadius,
                casualties: {
                    dead: finalData.casualties?.dead,
                    wounded: finalData.casualties?.wounded
                }
            };

            console.log('Processed location data:', location);

            // Update city statistics
            const cityName = location.name;
            const dateStr = location.timestamp.toLocaleDateString('az-AZ', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            });

            // Check if the city is in Israel or Iran
            if (this.isIsraeliCity(cityName)) {
                if (!this.israelCities.has(cityName)) {
                    this.israelCities.set(cityName, { count: 0, dates: new Set() });
                }
                const cityData = this.israelCities.get(cityName);
                cityData.count++;
                cityData.dates.add(dateStr);
            } else if (this.isIranianCity(cityName)) {
                if (!this.iranCities.has(cityName)) {
                    this.iranCities.set(cityName, { count: 0, dates: new Set() });
                }
                const cityData = this.iranCities.get(cityName);
                cityData.count++;
                cityData.dates.add(dateStr);
            }

            // Update UI with new statistics
            this.updateCityStatistics();

            // Calculate marker position with offset
            const offset = this.calculateMarkerOffset(location);
            const adjustedLocation = {
                lat: location.lat + offset.lat,
                lon: location.lon + offset.lon
            };

            // Create marker elements
            const { container, el } = this.createMarkerElements(location);

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

            // Update popup content
            this.updatePopupContent(popup, location);

            // Add hover effects
            this.addMarkerHoverEffects(container, el, popup, location);

            // Store marker
            this.markers.set(location.id, {
                marker,
                timestamp: location.timestamp,
                originalLocation: location,
                impactCircle: null
            });

            // Add impact radius if specified
            if (location.impactRadius) {
                const impactCircle = this.createImpactRadiusLayer(location.id, adjustedLocation, location.impactRadius);
                this.markers.get(location.id).impactCircle = impactCircle;
            }

            console.log('Incident added successfully:', location.id);
            console.log('Current city statistics - Israel:', this.israelCities.size, 'Iran:', this.iranCities.size);
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
        const impactRadius = parseFloat(location.impactRadius || 500);
        const colorScheme = this.getColorScheme(impactRadius);

        const container = document.createElement('div');
        container.className = 'marker-container';
        container.style.setProperty('--marker-color', colorScheme.main);
        container.style.width = '16px';
        container.style.height = '16px';

        const el = document.createElement('div');
        el.className = 'custom-marker';
        el.style.backgroundColor = colorScheme.main;

        const rippleContainer = document.createElement('div');
        rippleContainer.className = 'ripple-container';

        const ripple1 = document.createElement('div');
        ripple1.className = 'ripple ripple-1';
        ripple1.style.setProperty('--ripple-color', colorScheme.main);

        const ripple2 = document.createElement('div');
        ripple2.className = 'ripple ripple-2';
        ripple2.style.setProperty('--ripple-color', colorScheme.main);

        rippleContainer.appendChild(ripple1);
        rippleContainer.appendChild(ripple2);
        container.appendChild(rippleContainer);
        container.appendChild(el);

        return { container, el };
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
            <div class="value">${location.type === '1' ? 'Israel' : 'Iran'}</div>
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
        container.addEventListener('mouseenter', () => {
            container.style.width = '20px';
            container.style.height = '20px';
            el.style.backgroundColor = this.adjustColor(el.style.backgroundColor, 20);
            popup.addTo(this.map);

            const impactCircle = this.markers.get(location.id)?.impactCircle;
            if (impactCircle) {
                this.highlightImpactRadius(impactCircle, true);
            }
        });

        container.addEventListener('mouseleave', () => {
            container.style.width = '16px';
            container.style.height = '16px';
            el.style.backgroundColor = this.getColorScheme(location.impactRadius || 500).main;
            if (!popup.isOpen()) {
                popup.remove();
            }

            const impactCircle = this.markers.get(location.id)?.impactCircle;
            if (impactCircle) {
                this.highlightImpactRadius(impactCircle, false);
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

    clearAllIncidents() {
        console.log('Clearing all incidents from map');
        this.markers.forEach(({ marker, impactCircle }) => {
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

        this.markers.clear();
        this.markerClusters.clear();
        this.impactCircles.clear();
        console.log('All incidents cleared');
    }

    // Helper function to adjust color brightness
    adjustColor(color, percent) {
        const num = parseInt(color.replace('#', ''), 16);
        const amt = Math.round(2.55 * percent);
        const R = (num >> 16) + amt;
        const G = (num >> 8 & 0x00FF) + amt;
        const B = (num & 0x0000FF) + amt;
        return '#' + (0x1000000 +
            (R < 255 ? (R < 1 ? 0 : R) : 255) * 0x10000 +
            (G < 255 ? (G < 1 ? 0 : G) : 255) * 0x100 +
            (B < 255 ? (B < 1 ? 0 : B) : 255)
        ).toString(16).slice(1);
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
                Object.values(newsData).forEach(newsItem => {
                    if (newsItem.locations && newsItem.locations.length > 0) {
                        const location = newsItem.locations[0];
                        const city = location.name;
                        const attacker = location.attacker;
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
                            cityData.count++;
                            cityData.dates.add(date);
                        };

                        // Check if the city is in the known locations list
                        const isIsraeliCity = this.isIsraeliCity(city);
                        const isIranianCity = this.isIranianCity(city);

                        // Add city to appropriate map based on its location, not the attacker
                        if (isIsraeliCity) {
                            updateCityData(this.israelCities, city, dateStr);
                        } else if (isIranianCity) {
                            updateCityData(this.iranCities, city, dateStr);
                        }
                    }
                });

                // Update the UI
                this.updateCityStatistics({});
                console.log('City statistics initialized from Firebase');
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
            'Najafabad', 'Malard', 'Ijrud', 'Baharestan', 'Robat Karim',
            'Shahr-e Rey', 'Western Iran'
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

        console.log('City statistics updated - Israel:', this.israelCities.size, 'Iran:', this.iranCities.size);
        console.log('Israeli cities:', Array.from(this.israelCities.keys()));
        console.log('Iranian cities:', Array.from(this.iranCities.keys()));
    }

    updateCityList(elementId, cityMap) {
        const ul = document.getElementById(elementId);
        ul.innerHTML = '';
        
        [...cityMap.entries()]
            .sort(([cityA], [cityB]) => cityA.localeCompare(cityB))
            .forEach(([city, data]) => {
                const li = document.createElement('li');
                
                const cityName = document.createElement('div');
                cityName.className = 'city-name';
                cityName.textContent = `${city} (${data.count} times)`;
                
                const datesContainer = document.createElement('div');
                datesContainer.className = 'attack-dates';
                
                const sortedDates = [...data.dates]
                    .sort((a, b) => new Date(b) - new Date(a));
                
                sortedDates.forEach(date => {
                    const dateSpan = document.createElement('span');
                    dateSpan.className = 'attack-date';
                    dateSpan.textContent = date;

                    const handleDateFocus = () => {
                        const dateMarkers = [];
                        this.markers.forEach((markerData, id) => {
                            const markerDate = new Date(markerData.timestamp);
                            const markerDateStr = markerDate.toLocaleDateString('az-AZ', {
                                year: 'numeric',
                                month: '2-digit',
                                day: '2-digit'
                            });
                            
                            if (markerData.originalLocation.name === city && markerDateStr === date) {
                                dateMarkers.push({
                                    id,
                                    marker: markerData.marker,
                                    location: markerData.originalLocation,
                                    impactCircle: markerData.impactCircle
                                });
                            }
                        });

                        if (dateMarkers.length > 0) {
                            // Fly to the marker location
                            const marker = dateMarkers[0];
                            this.map.flyTo({
                                center: [marker.location.lon, marker.location.lat],
                                zoom: 13,
                                duration: 800
                            });

                            // Highlight the markers for this date
                            dateMarkers.forEach(marker => {
                                const markerElement = marker.marker.getElement();
                                markerElement.style.transform = `${markerElement.style.transform} scale(1.5)`;
                                markerElement.style.zIndex = '1000';

                                if (marker.impactCircle) {
                                    // Highlight impact radius
                                    this.map.setPaintProperty(
                                        marker.impactCircle.gradientLayerId,
                                        'fill-opacity',
                                        [
                                            'interpolate',
                                            ['linear'],
                                            ['zoom'],
                                            0, 0.7,
                                            22, 0.4
                                        ]
                                    );
                                }
                            });

                            dateSpan.classList.add('active');
                        }
                    };

                    const handleDateBlur = () => {
                        this.markers.forEach((markerData, id) => {
                            const markerDate = new Date(markerData.timestamp);
                            const markerDateStr = markerDate.toLocaleDateString('az-AZ', {
                                year: 'numeric',
                                month: '2-digit',
                                day: '2-digit'
                            });
                            
                            if (markerData.originalLocation.name === city && markerDateStr === date) {
                                const markerElement = markerData.marker.getElement();
                                markerElement.style.transform = markerElement.style.transform.replace(' scale(1.5)', '');
                                markerElement.style.zIndex = '';

                                if (markerData.impactCircle) {
                                    // Reset impact radius
                                    this.map.setPaintProperty(
                                        markerData.impactCircle.gradientLayerId,
                                        'fill-opacity',
                                        [
                                            'interpolate',
                                            ['linear'],
                                            ['zoom'],
                                            0, 0.5,
                                            22, 0.2
                                        ]
                                    );
                                }
                            }
                        });

                        dateSpan.classList.remove('active');
                    };

                    dateSpan.addEventListener('mouseenter', handleDateFocus);
                    dateSpan.addEventListener('mouseleave', handleDateBlur);
                    dateSpan.addEventListener('click', (e) => {
                        e.stopPropagation();
                        handleDateFocus();
                    });

                    datesContainer.appendChild(dateSpan);
                });
                
                // Assemble the list item
                li.appendChild(cityName);
                li.appendChild(datesContainer);
                ul.appendChild(li);

                // Add hover and click interactions for the city
                const handleCityFocus = () => {
                    // Find all markers for this city
                    const cityMarkers = [];
                    this.markers.forEach((markerData, id) => {
                        if (markerData.originalLocation.name === city) {
                            cityMarkers.push({
                                id,
                                location: markerData.originalLocation,
                                marker: markerData.marker,
                                impactCircle: markerData.impactCircle
                            });
                        }
                    });

                    if (cityMarkers.length > 0) {
                        // Calculate the center point if there are multiple markers
                        let centerLat = 0;
                        let centerLon = 0;
                        cityMarkers.forEach(marker => {
                            centerLat += marker.location.lat;
                            centerLon += marker.location.lon;
                        });
                        centerLat /= cityMarkers.length;
                        centerLon /= cityMarkers.length;

                        // Fly to the center point
                        this.map.flyTo({
                            center: [centerLon, centerLat],
                            zoom: 10,
                            duration: 1000
                        });

                        // Highlight all markers for this city
                        cityMarkers.forEach(marker => {
                            const markerElement = marker.marker.getElement();
                            markerElement.style.transform = `${markerElement.style.transform} scale(1.3)`;
                            markerElement.style.zIndex = '1000';

                            if (marker.impactCircle) {
                                // Highlight impact radius
                                this.map.setPaintProperty(
                                    marker.impactCircle.gradientLayerId,
                                    'fill-opacity',
                                    [
                                        'interpolate',
                                        ['linear'],
                                        ['zoom'],
                                        0, 0.7,
                                        22, 0.4
                                    ]
                                );
                            }
                        });
                    }
                };

                const handleCityBlur = () => {
                    // Reset all markers for this city
                    this.markers.forEach((markerData, id) => {
                        if (markerData.originalLocation.name === city) {
                            const markerElement = markerData.marker.getElement();
                            markerElement.style.transform = markerElement.style.transform.replace(' scale(1.3)', '');
                            markerElement.style.zIndex = '';

                            if (markerData.impactCircle) {
                                // Reset impact radius
                                this.map.setPaintProperty(
                                    markerData.impactCircle.gradientLayerId,
                                    'fill-opacity',
                                    [
                                        'interpolate',
                                        ['linear'],
                                        ['zoom'],
                                        0, 0.5,
                                        22, 0.2
                                    ]
                                );
                            }
                        }
                    });
                };

                // Add event listeners for the city
                li.addEventListener('mouseenter', handleCityFocus);
                li.addEventListener('mouseleave', handleCityBlur);
                li.addEventListener('click', (e) => {
                    e.preventDefault();
                    handleCityFocus();
                });
            });
    }
} 