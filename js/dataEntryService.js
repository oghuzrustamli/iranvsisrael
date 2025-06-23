class DataEntryService {
    constructor() {
        this.form = document.getElementById('incident-form');
        this.panel = document.getElementById('data-entry-form');
        this.addButton = document.getElementById('add-incident-link');
        this.cancelButton = this.panel.querySelector('.cancel-button');
        this.citiesList = document.getElementById('cities-list');
        
        // Initialize only when Firebase is ready
        if (window.FirebaseService && window.FirebaseService.initialized) {
            this.initialize();
        } else {
            window.addEventListener('firebaseReady', () => this.initialize());
        }
    }

    initialize() {
        this.initializeEventListeners();
        this.initializeCitiesList();
        this.setDefaultDate();
    }

    initializeEventListeners() {
        // Show panel when Add Incident is clicked
        this.addButton.addEventListener('click', (e) => {
            e.preventDefault();
            this.showPanel();
        });

        // Hide panel when Cancel is clicked
        this.cancelButton.addEventListener('click', () => {
            this.hidePanel();
        });

        // Handle form submission
        this.form.addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleSubmit();
        });

        // Handle country change to update cities list
        document.getElementById('country').addEventListener('change', (e) => {
            this.updateCitiesList(e.target.value);
        });
    }

    initializeCitiesList() {
        // Initially populate with Israeli cities
        this.updateCitiesList('1');
    }

    updateCitiesList(country) {
        // Clear existing options
        this.citiesList.innerHTML = '';
        
        // Get cities based on country
        const cities = country === '1' ? CONFIG.israeliCities : CONFIG.iranianCities;
        
        // Add cities to datalist
        cities.forEach(city => {
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
        this.panel.style.display = 'block';
        this.form.reset();
        this.setDefaultDate();
        this.initializeCitiesList();
    }

    hidePanel() {
        this.panel.style.display = 'none';
        this.form.reset();
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

            // Update the news feed if available
            if (window.newsService) {
                window.newsService.loadNewsFromFirebase();
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