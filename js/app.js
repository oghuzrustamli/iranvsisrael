// Initialize services
console.log('Initializing services...');
const mapService = new MapService();
const newsService = new NewsService(mapService);
 
// No automatic news fetching or interval updates
console.log('Application initialized - use refresh button to fetch news'); 