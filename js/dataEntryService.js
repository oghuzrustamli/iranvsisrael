class DataEntryService {
    constructor() {
        this.form = document.getElementById('incident-form');
        this.panel = document.getElementById('data-entry-form');
        this.cancelButton = this.panel.querySelector('.cancel-button');
        this.citiesList = document.getElementById('cities-list');
        this.targetCityInput = document.getElementById('target-city');
        
        // Initialize event listeners immediately
        this.initializeEventListeners();
        
        // Initialize Firebase-dependent features when ready
        if (window.FirebaseService && window.FirebaseService.initialized) {
            this.initializeFirebaseFeatures();
        } else {
            window.addEventListener('firebaseReady', () => this.initializeFirebaseFeatures());
        }
    }

    initializeFirebaseFeatures() {
        this.initializeCitiesList();
        this.setDefaultDate();
    }

    initializeEventListeners() {
        console.log('Initializing event listeners...');

        // Hide panel when Cancel is clicked
        this.cancelButton.addEventListener('click', () => {
            console.log('Cancel button clicked');
            this.hidePanel();
        });

        // Handle form submission
        this.form.addEventListener('submit', (e) => {
            console.log('Form submitted');
            e.preventDefault();
            this.handleSubmit();
        });

        // Add input event listener for target city
        this.targetCityInput.addEventListener('input', () => {
            this.updateCitiesList(this.targetCityInput.value);
        });

        console.log('Event listeners initialized');
    }

    initializeCitiesList() {
        // Show all cities initially
        this.updateCitiesList();
    }

    updateCitiesList(searchText = '') {
        // Clear existing options
        this.citiesList.innerHTML = '';
        
        // Get all cities from all countries
        const allCities = [
            ...CONFIG.israeliCities,
            ...CONFIG.iranianCities,
            ...CONFIG.qatarCities
        ];
        
        // Filter cities based on search text
        const filteredCities = searchText
            ? allCities.filter(city => 
                city.toLowerCase().includes(searchText.toLowerCase()))
            : allCities;
        
        // Sort alphabetically
        const sortedCities = [...new Set(filteredCities)].sort();
        
        // Add filtered cities to datalist
        sortedCities.forEach(city => {
            const option = document.createElement('option');
            option.value = city;
            this.citiesList.appendChild(option);
        });
    }

    setDefaultDate() {
        const today = new Date().toISOString().split('T')[0];
        document.getElementById('incident-date').value = today;
    }

    showPanel() {
        console.log('Opening incident panel...');
        this.panel.style.display = 'block';
        this.form.reset();
        this.setDefaultDate();
        this.updateCitiesList(); // Show all cities initially
        console.log('Incident panel opened');
    }

    hidePanel() {
        console.log('Closing incident panel...');
        this.panel.style.display = 'none';
        this.form.reset();
        console.log('Incident panel closed');
    }

    async handleSubmit() {
        try {
            const formData = {
                country: document.getElementById('country').value,
                date: document.getElementById('incident-date').value,
                targetCity: document.getElementById('target-city').value,
                specificTarget: document.getElementById('specific-target').value,
                weaponTypes: Array.from(document.getElementById('weapon-type').selectedOptions).map(opt => opt.value),
                detailedWeapon: document.getElementById('detailed-weapon').value,
                impactRadius: document.getElementById('impact-radius').value,
                casualties: {
                    dead: document.getElementById('casualties-dead').value || 'Məlumat yoxdur',
                    wounded: document.getElementById('casualties-wounded').value || 'Məlumat yoxdur'
                }
            };

            console.log('Form data:', formData);

            // Get coordinates for the city
            const coordinates = await this.getLocationCoordinates(formData.targetCity);
            if (!coordinates) {
                throw new Error('Could not find coordinates for the specified city');
            }

            // Set the date to noon of the selected day
            const incidentDate = new Date(formData.date);
            incidentDate.setHours(12, 0, 0, 0);

            // Generate a unique ID
            const id = `manual-${Date.now()}-${formData.targetCity.replace(/\s+/g, '')}`;

            // Create the incident object
            const incident = {
                id: id,
                type: formData.country,
                source: 'Manual Entry',
                timestamp: incidentDate.toISOString(),
                date: formData.date,
                title: `Attack on ${formData.targetCity}`,
                description: `${formData.specificTarget} was attacked using ${formData.weaponTypes.join(', ')}${formData.detailedWeapon ? ` (${formData.detailedWeapon})` : ''}`,
                location: {
                    name: formData.targetCity,
                    lat: coordinates.lat,
                    lon: coordinates.lon,
                    type: formData.specificTarget
                },
                targetType: formData.specificTarget,
                weaponType: formData.weaponTypes,
                detailedWeapon: formData.detailedWeapon,
                impactRadius: formData.impactRadius,
                casualties: formData.casualties
            };

            console.log('Created incident:', incident);

            // Save to Firebase
            await this.saveToFirebase(incident.id, incident);

            // Add marker to map immediately
            if (window.mapService) {
                window.mapService.addIncident({
                    id: incident.id,
                        lat: incident.location.lat,
                    lon: incident.location.lon,
                    name: incident.location.name,
                    type: incident.type,
                    targetType: incident.targetType,
                    weaponType: incident.weaponType,
                    detailedWeapon: incident.detailedWeapon,
                    impactRadius: parseInt(incident.impactRadius),
                    casualties: incident.casualties,
                    timestamp: incident.timestamp
                });

                // Center map on new incident
                window.mapService.map.flyTo({
                    center: [incident.location.lon, incident.location.lat],
                    zoom: 8,
                    essential: true
                });
            }

            // Hide the panel and show success message
            this.hidePanel();
            alert('Incident added successfully!');

        } catch (error) {
            console.error('Error adding incident:', error);
            alert('Error adding incident: ' + error.message);
        }
    }

    async getLocationCoordinates(cityName) {
        // First check in known locations
        const locations = CONFIG.knownLocations;
        for (const [key, coords] of Object.entries(locations)) {
            if (key.toLowerCase() === cityName.toLowerCase()) {
                return {
                    lat: coords.lat,
                    lon: coords.lon
                };
            }
        }

        // If not found in known locations, try to find similar names
        for (const [key, coords] of Object.entries(locations)) {
            if (key.toLowerCase().includes(cityName.toLowerCase()) ||
                cityName.toLowerCase().includes(key.toLowerCase())) {
                return {
                    lat: coords.lat,
                    lon: coords.lon
                };
            }
        }

        throw new Error(`Location coordinates not found for ${cityName}`);
    }

    async saveToFirebase(id, incident) {
        try {
            const newsRef = window.FirebaseService.ref(
                window.FirebaseService.database,
                `news/${id}`
            );
            await window.FirebaseService.set(newsRef, incident);
            console.log('Incident saved to Firebase:', id);

            // Don't trigger a full reload since we've already added the marker
            // Only update the news feed without reloading map markers
            if (window.newsService && window.newsService.updateNewsFeed) {
                window.newsService.updateNewsFeed();
            }
        } catch (error) {
            console.error('Error saving to Firebase:', error);
            throw error;
        }
    }
}

// Initialize the service when the document is ready
document.addEventListener('DOMContentLoaded', () => {
    window.dataEntryService = new DataEntryService();
});