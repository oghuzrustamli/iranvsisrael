# Israel-Iran Conflict Map

Real-time tracking of reported incidents between Israel and Iran, displayed on an interactive map.

## Features

- Real-time news updates from multiple sources
- Interactive map showing incident locations
- Automatic geocoding of locations mentioned in news
- 24-hour news history
- Automatic updates every 5 minutes

## Requirements

- Python 3.x
- Modern web browser with JavaScript enabled
- Internet connection

## Setup

1. Clone this repository:
```bash
git clone <repository-url>
cd israel-iran-conflict-map
```

2. Start the server:
```bash
python server.py
```

3. Open your web browser and navigate to:
```
http://localhost:8000
```

## How it Works

- The application fetches news from multiple RSS feeds about the Israel-Iran conflict
- News articles are processed to extract location information
- Locations are geocoded using OpenStreetMap's Nominatim service
- Incidents are displayed on the map using Leaflet.js
- The news feed is automatically updated every 5 minutes
- Old news items (>24 hours) are automatically removed

## Technologies Used

- HTML5/CSS3/JavaScript
- Leaflet.js for map visualization
- OpenStreetMap for map tiles
- Nominatim for geocoding
- RSS2JSON API for RSS feed processing
- Python for the local development server

## Notes

- All services used are free and don't require API keys
- The application respects rate limits of free services
- Location extraction is based on simple text analysis and may not be 100% accurate

## License

MIT License 