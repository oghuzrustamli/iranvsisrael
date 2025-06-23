class NewsService {
    constructor(mapService) {
        this.newsItems = new Map();
        this.locationCache = new Map();
        this.mapService = mapService;
        this.geminiApiKey = null; // Will be fetched from server
        this.requestQueue = [];
        this.isProcessingQueue = false;
        this.retryDelay = 10000; // Start with 10 seconds delay
        this.maxRetryDelay = 120000; // Max 2 minutes delay
        this.processedTitles = new Set(); // Track processed titles
        this.maxQueueSize = 5; // Maximum number of items to process at once
        this.cutoffDate = new Date('2024-06-20T00:00:00Z'); // Set cutoff date to June 20th, 2024
        this.processingStatus = document.createElement('div');
        this.processingStatus.className = 'processing-status';
        document.body.appendChild(this.processingStatus);
        console.log('NewsService initialized with cutoff date:', this.cutoffDate);
        
        // Load existing news from Firebase on startup
        this.loadNewsFromFirebase();

        // Add refresh button click handler
        const refreshButton = document.getElementById('refresh-news-link');
        if (refreshButton) {
            refreshButton.addEventListener('click', async (e) => {
                e.preventDefault();
                this.updateStatus('Fetching new updates...');
                refreshButton.classList.add('refreshing');
                
                try {
                    // Get existing news from Firebase first
                    const newsRef = FirebaseService.ref(FirebaseService.database, 'news');
                    const snapshot = await FirebaseService.get(newsRef);
                    const existingData = snapshot.exists() ? snapshot.val() : {};

                    // Fetch new articles
                    let allArticles = [];
                    for (const query of CONFIG.newsApi.queries) {
                        const articles = await this.fetchNews(query);
                        allArticles = [...allArticles, ...articles];
                    }

                    // Filter relevant articles
                    const relevantArticles = this.filterRelevantArticles(allArticles);
                    
                    // Process new articles without clearing existing ones
                    await this.processNewsItems(relevantArticles);
                    
                    // Merge existing data with new data
                    const mergedData = { ...existingData };
                    this.newsItems.forEach((item, id) => {
                        if (!id.startsWith('manual-')) {
                            mergedData[id] = {
                                id: item.id || id,
                                title: item.title || '',
                                description: item.description || '',
                                timestamp: item.timestamp.toISOString(),
                                source: item.source || '',
                                url: item.url || '',
                                locations: item.locations.map(loc => ({
                                    name: loc.name || null,
                                    lat: parseFloat(loc.lat) || null,
                                    lon: parseFloat(loc.lon) || null,
                                    attacker: loc.attacker || null,
                                    targetType: loc.targetType || 'No Info',
                                    attackTime: loc.attackTime || 'No Info',
                                    attackStatus: loc.attackStatus || 'No Info',
                                    casualties: {
                                        dead: loc.casualties?.dead || loc.casualties?.dead === 0 ? loc.casualties.dead : 'Məlumat yoxdur',
                                        wounded: loc.casualties?.wounded || loc.casualties?.wounded === 0 ? loc.casualties.wounded : 'Məlumat yoxdur'
                                    },
                                    weaponType: loc.weaponType || 'No Info',
                                    isToday: loc.isToday || false
                                }))
                            };
                        }
                    });

                    // Save merged data back to Firebase
                    await FirebaseService.set(newsRef, mergedData);
                    
                    // Reload all news to ensure everything is displayed correctly
                    await this.loadNewsFromFirebase();
                    
                    this.updateStatus('Updates completed');
                } catch (error) {
                    console.error('Error refreshing news:', error);
                    this.updateStatus('Error fetching updates');
                } finally {
                refreshButton.classList.remove('refreshing');
                    setTimeout(() => this.updateStatus(''), 2000);
                }
            });
        }

        // Initialize service when Firebase is ready
        if (window.FirebaseService && window.FirebaseService.initialized) {
            this.init();
        } else {
            window.addEventListener('firebaseReady', () => this.init());
        }

        // Set up auto-refresh
        setInterval(() => {
            if (window.FirebaseService && window.FirebaseService.initialized) {
                this.fetchNews();
            }
        }, CONFIG.updateInterval);
    }

    async init() {
        try {
            // Fetch API keys from server
            const [geminiResponse, newsResponse] = await Promise.all([
                fetch('/api/keys/gemini', {
                    method: 'GET',
                    mode: 'cors',
                    credentials: 'include',
                    headers: {
                        'Accept': 'application/json'
                    }
                }),
                fetch('/api/keys/news', {
                    method: 'GET',
                    mode: 'cors',
                    credentials: 'include',
                    headers: {
                        'Accept': 'application/json'
                    }
                })
            ]);
            
            const geminiData = await geminiResponse.json();
            const newsData = await newsResponse.json();
            
            this.geminiApiKey = geminiData.key;
            CONFIG.newsApi.apiKey = newsData.key;
            
            // Start fetching news
            await this.fetchNews();
        } catch (error) {
            console.error('Error initializing NewsService:', error);
            // Retry initialization after a delay
            setTimeout(() => this.init(), 2000);
        }
    }

    updateStatus(message) {
        this.processingStatus.textContent = message;
    }

    async delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async processQueue() {
        if (this.isProcessingQueue) {
            console.log('Already processing queue');
            return;
        }
        
        this.isProcessingQueue = true;
        console.log('Starting queue processing');

        try {
            // Only process up to maxQueueSize items at a time
            const itemsToProcess = this.requestQueue.slice(0, this.maxQueueSize);
            let processedItems = 0;

            for (const item of itemsToProcess) {
                processedItems++;
                this.updateStatus(`Analyzing news: ${processedItems}/${itemsToProcess.length}`);
                
                try {
                    console.log(`Processing item ${processedItems}/${itemsToProcess.length}`);
                    
                    // Always wait before processing next item
                    if (processedItems > 1) {
                        console.log(`Waiting ${this.retryDelay}ms before next request`);
                        await this.delay(this.retryDelay);
                    }

                    const result = await this.makeGeminiRequest(item.text);
                    console.log('Request successful');
                    item.resolve(result);
                    this.requestQueue.shift();

                } catch (error) {
                    console.error('Error in queue processing:', error);
                    
                    if (error.status === 429 && item.retryCount < 2) { // Reduced max retries to 2
                        // Rate limit hit - increase delay and move to end of queue
                        this.retryDelay = Math.min(this.retryDelay * 2, this.maxRetryDelay);
                        console.log(`Rate limit hit, increasing delay to ${this.retryDelay}ms`);
                        
                        this.requestQueue.push({
                            ...item,
                            retryCount: (item.retryCount || 0) + 1
                        });
                        this.requestQueue.shift();
                        
                        this.updateStatus(`Rate limit exceeded. Waiting ${this.retryDelay/1000} seconds...`);
                        await this.delay(this.retryDelay);
                    } else {
                        // Other error or too many retries - skip this request
                        console.log('Skipping failed request');
                        item.reject(error);
                        this.requestQueue.shift();
                    }
                }
            }

            // If there are more items in the queue, schedule next batch
            if (this.requestQueue.length > 0) {
                console.log(`${this.requestQueue.length} items remaining in queue`);
                setTimeout(() => this.processQueue(), this.retryDelay);
            }
        } finally {
            this.isProcessingQueue = false;
            this.updateStatus('');
            console.log('Queue processing completed');
        }
    }

    async makeGeminiRequest(text) {
        const prompt = `
        Analyze this news about Israel and Iran. Extract any relevant information about locations, casualties, weapons, or targets if they exist.
        Do not filter or exclude any news - just analyze what's in the text.

        News text: "${text}"
        
        Respond with this JSON:
        {
            "attacked_city": "Name of any city mentioned in relation to an incident, or null if none",
            "attacker": "Israel or Iran if mentioned, or null",
            "attack_details": {
                "target_type": "Any target mentioned in the text, or 'No Info'",
                "attack_time": "Time/date mentioned in text, or 'No Info'",
                "attack_status": "Any status mentioned in the text"
            },
            "casualties": {
                "dead": "Number if mentioned, 'No Info' if not mentioned",
                "wounded": "Number if mentioned, 'No Info' if not mentioned"
            },
            "weapon_type": "Any weapons mentioned in the text, or 'No Info'",
            "is_today": true if event is from today, false if earlier, null if unclear,
            "confidence": 100
        }`;

        const response = await fetch('https://generativelanguage.googleapis.com/v1/models/gemini-2.0-flash:generateContent', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-goog-api-key': this.geminiApiKey
            },
            body: JSON.stringify({
                contents: [{
                    role: "user",
                    parts: [{ text: prompt }]
                }],
                generationConfig: {
                    temperature: 0.1,
                    topK: 1,
                    topP: 1,
                    maxOutputTokens: 2000,
                }
            })
        });

        if (!response.ok) {
            const error = new Error('Gemini API request failed');
            error.status = response.status;
            throw error;
        }

        const data = await response.json();
        console.log('Gemini raw response:', data);

        if (data.candidates && data.candidates[0] && data.candidates[0].content) {
            const responseText = data.candidates[0].content.parts[0].text;
            console.log('Gemini response text:', responseText);

            const cleanJson = responseText
                .replace(/```json\s*/, '')
                .replace(/```\s*$/, '')
                .trim();

            console.log('Cleaned JSON:', cleanJson);
            
            try {
                const analysis = JSON.parse(cleanJson);
                console.log('Parsed analysis:', analysis);
                return analysis;
            } catch (parseError) {
                console.error('JSON parse error:', parseError);
                console.error('Failed to parse JSON:', cleanJson);
                return null;
            }
        }

        return null;
    }

    async analyzeNewsWithGemini(text) {
        return new Promise((resolve, reject) => {
            this.requestQueue.push({ text, resolve, reject });
            this.processQueue().catch(console.error);
        });
    }

    async processNewsItems(articles) {
        console.log('Processing news items, count:', articles.length);
        const processedItems = new Map();
        
        // Process all articles without filtering
        for (const item of articles) {
            try {
                console.log('Processing item:', item.title, 'published:', new Date(item.publishedAt));
                const id = this.generateId(item.title);
                
                // Skip if this news item already exists
                if (this.newsItems.has(id) || processedItems.has(id)) {
                    console.log('Skipping duplicate item:', item.title);
                    continue;
                }

                // Analyze with Gemini
                const analysis = await this.analyzeNewsWithGemini(item.title + ' ' + item.description);
                console.log('News analysis:', analysis);

                if (analysis) {
                    // Skip location processing for automatic news items
                    const newsItem = {
                        id,
                        title: item.title,
                        description: item.description,
                        timestamp: new Date(item.publishedAt),
                        source: item.source.name,
                        url: item.url,
                        locations: [] // Keep locations empty for automatic news
                    };

                    // Add to both maps
                    processedItems.set(id, newsItem);
                    this.newsItems.set(id, newsItem);
                    
                    // Add only to feed
                    this.addNewsItemToFeed(id, newsItem);
                }
            } catch (error) {
                console.error('Error processing news item:', error);
            }
        }
    }

    async loadNewsFromFirebase() {
        try {
            console.log('Loading news from Firebase...');
            const newsRef = FirebaseService.ref(FirebaseService.database, 'news');
            const snapshot = await FirebaseService.get(newsRef);
            
            if (snapshot.exists()) {
                const newsData = snapshot.val();
                console.log('Loaded news data:', newsData);
                
                // Clear existing news feed only
                this.newsItems.clear();
                document.getElementById('auto-news-feed').innerHTML = '';
                
                // Process each news item
                Object.entries(newsData).forEach(([id, item]) => {
                    try {
                        // Skip if not a valid item
                        if (!item || !item.title || !item.timestamp) {
                            console.warn('Skipping invalid news item:', id);
                            return;
                        }

                        // Convert timestamp to Date object
                        let timestamp;
                        if (typeof item.timestamp === 'string') {
                            timestamp = new Date(item.timestamp);
                        } else if (typeof item.timestamp === 'number') {
                            timestamp = new Date(item.timestamp);
                        } else {
                            timestamp = new Date(item.timestamp);
                        }

                        if (isNaN(timestamp.getTime())) {
                            console.warn('Invalid timestamp for news item:', id);
                            return;
                        }

                        // Process manual entries for map and info section
                        if (id.startsWith('manual-')) {
                            console.log('Processing manual entry:', id);
                            
                            // For manual entries, use the location data directly from the item
                            this.mapService.addIncident({
                                id: id,
                                position: {
                                    lat: item.location.lat,
                                    lon: item.location.lon
                                },
                                title: item.title,
                                description: item.description || '',
                                timestamp: timestamp,
                                type: item.type,
                                targetType: item.targetType,
                                weaponType: item.weaponType,
                                detailedWeapon: item.detailedWeapon,
                                impactRadius: parseInt(item.impactRadius),
                                casualties: item.casualties || { dead: 'No Info', wounded: 'No Info' }
                            });
                        }

                        // Create news item object
                        const newsItem = {
                            id: item.id || id,
                            title: item.title,
                            description: item.description || '',
                            timestamp: timestamp,
                            source: item.source || '',
                            url: item.url || '',
                            locations: id.startsWith('manual-') ? [{
                                name: item.location.name,
                                lat: item.location.lat,
                                lon: item.location.lon,
                                type: item.type,
                                targetType: item.targetType,
                                weaponType: item.weaponType,
                                detailedWeapon: item.detailedWeapon,
                                impactRadius: item.impactRadius,
                                casualties: item.casualties
                            }] : []
                        };
                        
                        // Add to news items map
                        this.newsItems.set(id, newsItem);
                        
                        // Add to feed only for non-manual entries
                        if (!id.startsWith('manual-')) {
                            this.addNewsItemToFeed(id, newsItem);
                        }
                    } catch (error) {
                        console.error('Error processing news item from Firebase:', id, error);
                    }
                });
                
                console.log('Successfully loaded and displayed all news items');
            } else {
                console.log('No news data in Firebase');
            }
        } catch (error) {
            console.error('Error loading news from Firebase:', error);
        }
    }

    async saveNewsToFirebase() {
        try {
            console.log('Saving news to Firebase...');
            
            // First get existing data from Firebase
            const newsRef = FirebaseService.ref(FirebaseService.database, 'news');
            const snapshot = await FirebaseService.get(newsRef);
            const existingData = snapshot.exists() ? snapshot.val() : {};
            
            // Prepare new data while preserving existing data
            const newsData = { ...existingData };
            
            // Add/update with new items
            this.newsItems.forEach((item, id) => {
                // Convert locations array to a safe format
                const safeLocations = item.locations.map(loc => ({
                    name: loc.name || null,
                    lat: parseFloat(loc.lat) || null,
                    lon: parseFloat(loc.lon) || null,
                    attacker: loc.attacker || null,
                    targetType: loc.targetType || 'No Info',
                    attackTime: loc.attackTime || 'No Info',
                    attackStatus: loc.attackStatus || 'No Info',
                    casualties: {
                        dead: loc.casualties?.dead || loc.casualties?.dead === 0 ? loc.casualties.dead : 'Məlumat yoxdur',
                        wounded: loc.casualties?.wounded || loc.casualties?.wounded === 0 ? loc.casualties.wounded : 'Məlumat yoxdur'
                    },
                    weaponType: loc.weaponType || 'No Info',
                    isToday: loc.isToday || false
                }));

                newsData[id] = {
                    id: item.id || id,
                    title: item.title || '',
                    description: item.description || '',
                    timestamp: item.timestamp.toISOString(),
                    source: item.source || '',
                    url: item.url || '',
                    locations: safeLocations
                };
            });
            
            // Save merged data back to Firebase
            await FirebaseService.set(newsRef, newsData);
            console.log('News saved to Firebase successfully');
        } catch (error) {
            console.error('Error saving news to Firebase:', error);
        }
    }

    async startNewsFeed() {
        // Manual update only - removed automatic updates
        await this.updateNews();
    }

    async updateNews() {
        try {
            let allArticles = [];
            for (const query of CONFIG.newsApi.queries) {
                const articles = await this.fetchNews(query);
                allArticles = [...allArticles, ...articles];
            }

            const relevantArticles = this.filterRelevantArticles(allArticles);
            await this.processNewsItems(relevantArticles);
            await this.saveNewsToFirebase();

        } catch (error) {
            console.error('Error updating news:', error);
        }
    }

    mergeArticles(existingArticles, newArticles) {
        // Create a Set of existing URLs to avoid duplicates
        const existingUrls = new Set(existingArticles.map(article => article.url));
        
        // Filter out duplicates and add new articles
        const uniqueNewArticles = newArticles.filter(article => !existingUrls.has(article.url));
        
        return [...existingArticles, ...uniqueNewArticles];
    }

    async fetchNews(query) {
        try {
            if (!CONFIG.newsApi.apiKey) {
                console.error('News API key not initialized');
                return;
            }

            const params = new URLSearchParams({
                q: query,
                apikey: CONFIG.newsApi.apiKey,
                lang: CONFIG.newsApi.lang,
                max: CONFIG.newsApi.maxArticles,
                sortby: CONFIG.newsApi.sortBy
            });

            console.log('Fetching news with query:', query);
            const response = await fetch(`${CONFIG.newsApi.endpoint}?${params}`);
            const data = await response.json();

            if (!response.ok) {
                throw new Error(`API Error: ${data.message || response.statusText}`);
            }

            console.log('Received news data:', data);

            if (data.articles && Array.isArray(data.articles)) {
                return data.articles;
            } else {
                console.error('Invalid response format:', data);
                return [];
            }
        } catch (error) {
            console.error(`Error fetching news for query "${query}":`, error);
            return [];
        }
    }

    filterRelevantArticles(articles) {
        if (!Array.isArray(articles)) {
            console.error('Invalid articles input:', articles);
            return [];
        }

        const now = new Date();
        const twentyFourHoursAgo = new Date(now - 24 * 60 * 60 * 1000); // Changed to 24 hours

        return articles.filter(article => {
            if (!article || !article.publishedAt) {
                return false;
            }

            const publishDate = new Date(article.publishedAt);
            
            // Check if article is within the last 24 hours
            if (publishDate < twentyFourHoursAgo) {
                return false;
            }

            const text = (article.title + ' ' + article.description).toLowerCase();

            // Check for relevance keywords from config
            const hasRelevanceKeyword = CONFIG.newsApi.relevanceKeywords.some(keyword =>
                text.includes(keyword.toLowerCase())
            );

            // Check for exclude keywords from config
            const hasExcludeKeyword = CONFIG.newsApi.excludeKeywords.some(keyword =>
                text.includes(keyword.toLowerCase())
            );

            // Must have at least one relevance keyword and no exclude keywords
            return hasRelevanceKeyword && !hasExcludeKeyword;
        });
    }

    generateId(text) {
        return text.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 32);
    }

    addNewsItemToFeed(id, item) {
        try {
            console.log('Adding news item to feed:', id, item);
            if (!item || !item.title) {
                console.error('Invalid news item:', id, item);
                return;
            }

            // Only add to news feed if it's from automatic internet search
            if (!id.startsWith('manual-') && item.source && item.url) {
                const newsDiv = document.createElement('div');
                newsDiv.className = 'news-item';
                newsDiv.dataset.id = id;

                const content = `
                    <h3><a href="${item.url}" target="_blank">${item.title}</a></h3>
                    <p>${item.description || ''}</p>
                    <div class="news-meta">
                        <span class="source">${item.source}</span>
                        <span class="date">${item.timestamp.toLocaleString()}</span>
                        <span class="auto-tag">Automatic</span>
                    </div>
                `;
                
                newsDiv.innerHTML = content;

                const newsFeed = document.getElementById('auto-news-feed');
                if (!newsFeed) {
                    console.error('News feed element not found!');
                    return;
                }

                newsFeed.insertBefore(newsDiv, newsFeed.firstChild);
                console.log('Added news div to automatic feed');
            }
        } catch (error) {
            console.error('Error adding news item to feed:', error);
            console.error('Item:', item);
        }
    }

    clearOldNews(maxAge) {
        console.log('Clearing old news...');
        const now = Date.now();
        this.newsItems.forEach((item, id) => {
            if (now - item.timestamp.getTime() > maxAge) {
                console.log('Removing old news item:', id);
                this.newsItems.delete(id);
                
                // Remove from DOM
                const newsItems = document.querySelectorAll('.news-item');
                newsItems.forEach(newsItem => {
                    if (newsItem.dataset.id === id) {
                        newsItem.remove();
                        console.log('Removed news item from DOM:', id);
                    }
                });
            }
        });
    }

    async removeNewsItem(id) {
        if (this.newsItems.has(id)) {
            const item = this.newsItems.get(id);
            
            // Remove from map
            if (item.markerId) {
                this.mapService.removeIncident(item.markerId);
            }

            // Remove from news feed
            const newsElement = document.getElementById(`news-${id}`);
            if (newsElement) {
                newsElement.remove();
            }
            
            // Remove from Firebase
            try {
                const newsRef = ref(FirebaseService.database, `news/${id}`);
                await FirebaseService.remove(newsRef);
                console.log(`News item ${id} removed from Firebase`);
        } catch (error) {
                console.error(`Error removing news item ${id} from Firebase:`, error);
                }
            
            // Remove from local storage
            this.newsItems.delete(id);
        }
    }
} 