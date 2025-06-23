const CONFIG = {
    // Map settings
    map: {
        center: [32.8, 52.5],
        zoom: 5,
        maxZoom: 18,
        minZoom: 3
    },
    
    // News API settings
    newsApi: {
        endpoint: 'https://gnews.io/api/v4/search',
        apiKey: null, // Will be fetched from server
        maxArticles: 10,
        sortBy: 'publishedAt',
        lang: 'en',
        // Search queries for latest events
        queries: [
            'Israel Iran',
            'Israel Iran conflict',
            'Israel Iran relations',
            'Israel Iran news'
        ],
        // Keywords to determine relevance - removed to include all news
        relevanceKeywords: [
            'israel',
            'iran',
            'israeli',
            'iranian',
            'tehran',
            'jerusalem',
            'tel aviv',
            'attack',
            'missile',
            'strike',
            'drone',
            'military',
            'diplomatic',
            'relations',
            'conflict',
            'tension',
            'agreement',
            'cooperation',
            'sanctions',
            'nuclear',
            'defense'
        ],
        // Keywords to filter out irrelevant news
        excludeKeywords: [
            'movie',
            'film',
            'sport',
            'football',
            'entertainment',
            'recipe',
            'tourism'
        ]
    },
    
    // Update frequency (in milliseconds)
    updateInterval: 300000, // Check every 5 minutes
    
    // Known locations for faster lookup
    knownLocations: {
        // Israel locations
        'Tel Aviv': { lat: 32.0853, lon: 34.7818 },
        'Jerusalem': { lat: 31.7683, lon: 35.2137 },
        'Haifa': { lat: 32.7940, lon: 34.9896 },
        'Beer Sheva': { lat: 31.2518, lon: 34.7913 },
        'Dimona': { lat: 31.0684, lon: 35.0333 },
        'Ashkelon': { lat: 31.6689, lon: 34.5715 },
        'Ashdod': { lat: 31.7920, lon: 34.6497 },
        'Netanya': { lat: 32.3329, lon: 34.8599 },
        'Herzliya': { lat: 32.1624, lon: 34.8447 },
        'Ramat Gan': { lat: 32.0684, lon: 34.8248 },
        'Rehovot': { lat: 31.8928, lon: 34.8113 },
        'Rishon LeZion': { lat: 31.9497, lon: 34.8892 },
        'Eilat': { lat: 29.5581, lon: 34.9482 },
        'Holon': { lat: 32.0103, lon: 34.7792 },
        'Petah Tikva': { lat: 32.0868, lon: 34.8867 },
        'Bat Yam': { lat: 32.0231, lon: 34.7515 },
        'Nahariya': { lat: 33.0089, lon: 35.0981 },
        'Kiryat Gat': { lat: 31.6100, lon: 34.7642 },
        'Kiryat Shmona': { lat: 33.2075, lon: 35.5691 },
        'Acre': { lat: 32.9281, lon: 35.0820 },

        // Iran locations
        'Tehran': { lat: 35.6892, lon: 51.3890 },
        'Isfahan': { lat: 32.6546, lon: 51.6680 },
        'Natanz': { lat: 33.5133, lon: 51.9244 },
        'Bushehr': { lat: 28.9684, lon: 50.8385 },
        'Tabriz': { lat: 38.0800, lon: 46.2919 },
        'Shiraz': { lat: 29.5917, lon: 52.5836 },
        'Kerman': { lat: 30.2839, lon: 57.0834 },
        'Yazd': { lat: 31.8974, lon: 54.3569 },
        'Arak': { lat: 34.0954, lon: 49.7013 },
        'Qom': { lat: 34.6416, lon: 50.8746 },
        'Karaj': { lat: 35.8400, lon: 50.9391 },
        'Mashhad': { lat: 36.2605, lon: 59.6168 },
        'Bandar Abbas': { lat: 27.1832, lon: 56.2666 },
        'Kermanshah': { lat: 34.3277, lon: 47.0778 },
        'Hamadan': { lat: 34.7983, lon: 48.5148 },
        'Urmia': { lat: 37.5527, lon: 45.0759 },
        'Khorramabad': { lat: 33.4374, lon: 48.3557 },
        'Ahvaz': { lat: 31.3183, lon: 48.6706 },
        'Chabahar': { lat: 25.2919, lon: 60.6430 },
        'Zanjan': { lat: 36.6736, lon: 48.4787 },
        'Fordow': { lat: 34.8847, lon: 51.4717 },
        'Shahr-e Ray': { lat: 35.5830, lon: 51.4394 },
        'Robat Karim': { lat: 35.4847, lon: 51.0833 },
        'Baherestan': { lat: 35.5266, lon: 51.1677 },
        'Malard': { lat: 35.6658, lon: 50.9767 },
        'Parchin': { lat: 35.5258, lon: 51.7731 },
        'Kashan': { lat: 33.9850, lon: 51.4100 },
        
        // Military and Nuclear Facilities
        'Dimona Nuclear': { lat: 31.0684, lon: 35.0333 },
        'Natanz Nuclear': { lat: 33.5133, lon: 51.9244 },
        'Fordow Nuclear': { lat: 34.8847, lon: 51.4717 },
        'Bushehr Nuclear': { lat: 28.9684, lon: 50.8385 },
        'Parchin Military': { lat: 35.5258, lon: 51.7731 },
        'Isfahan Nuclear': { lat: 32.6546, lon: 51.6680 },
        'Khojir Missile': { lat: 35.6891, lon: 51.7371 },
        
        // Regional locations
        'Damascus': { lat: 33.5138, lon: 36.2765 },
        'Beirut': { lat: 33.8938, lon: 35.5018 },
        'Gaza': { lat: 31.5017, lon: 34.4668 },
        'West Bank': { lat: 32.0000, lon: 35.2500 },
        'Golan Heights': { lat: 32.9784, lon: 35.7471 },
        'Semnan': { lat: 35.5729, lon: 53.3971 },
        'Bandar-e Mahshahr': { lat: 30.5589, lon: 49.1981 },
        'Khondab': { lat: 34.3139, lon: 49.1847 },
    },
    
    // Location keywords to help identify places in news
    locationKeywords: {
        prefixes: ['in', 'at', 'near', 'from', 'to', 'towards'],
        
        // Keywords that strongly indicate an attack
        attackIndicators: {
            verbs: ['struck', 'hit', 'attacked', 'bombed', 'targeted', 'destroyed', 'damaged', 
                   'exploded', 'impacted', 'blasted', 'shelled', 'fired upon', 'raided'],
            nouns: ['explosion', 'strike', 'attack', 'bombing', 'missile', 'drone', 'impact',
                   'destruction', 'damage', 'blast', 'detonation', 'raid'],
            phrases: ['under attack', 'came under fire', 'was targeted', 'multiple explosions in',
                     'direct hit on', 'successful strike against', 'military operation in',
                     'confirmed damage in', 'casualties reported in']
        },
        
        // Keywords that suggest location mention only
        contextualMentions: {
            verbs: ['said', 'announced', 'claimed', 'reported', 'stated', 'mentioned',
                   'located', 'based', 'situated'],
            prepositions: ['from', 'of', 'in', 'at', 'by'],
            phrases: ['officials in', 'sources from', 'based in', 'located in',
                     'speaking from', 'according to sources in']
        },
        
        suffixes: ['region', 'area', 'city', 'province', 'base', 'facility', 'airport', 
                  'site', 'complex', 'installation', 'center', 'command'],
        
        militaryTerms: ['base', 'facility', 'installation', 'compound', 'site', 'center', 
                       'headquarters', 'command', 'bunker', 'silo', 'depot', 'arsenal',
                       'airbase', 'missile site', 'nuclear facility', 'military complex', 
                       'defense installation', 'strategic site', 'operations center'],
        
        ignoreWords: ['the', 'and', 'or', 'but', 'if', 'on', 'for', 'of', 'with', 'by', 
                     'a', 'an', 'said', 'says', 'reported', 'according', 'claims', 
                     'announced', 'stated', 'confirmed', 'today', 'yesterday', 'tomorrow', 
                     'week', 'month', 'year', 'time', 'now', 'later', 'official', 
                     'officials', 'sources', 'report', 'reports', 'reported', 'reporting']
    },
    
    // Map marker settings
    markers: {
        attack: {
            radius: 12,
            color: '#ff4444',
            weight: 2,
            fillColor: '#ff0000',
            fillOpacity: 0.6,
            pulsing: true,
            // Popup style
            popupOffset: [0, -10],
            popupClassName: 'incident-popup'
        }
    },

    // Arrays for city suggestions
    israeliCities: [
        'Tel Aviv', 'Jerusalem', 'Haifa', 'Beer Sheva', 'Dimona',
        'Ashkelon', 'Ashdod', 'Netanya', 'Herzliya', 'Ramat Gan',
        'Rehovot', 'Rishon LeZion', 'Eilat', 'Holon', 'Petah Tikva',
        'Bat Yam', 'Nahariya', 'Kiryat Gat', 'Kiryat Shmona', 'Acre'
    ],
    
    iranianCities: [
        'Tehran', 'Isfahan', 'Natanz', 'Bushehr', 'Tabriz',
        'Shiraz', 'Kerman', 'Yazd', 'Arak', 'Qom',
        'Karaj', 'Mashhad', 'Bandar Abbas', 'Kermanshah', 'Hamadan',
        'Urmia', 'Khorramabad', 'Ahvaz', 'Chabahar', 'Zanjan',
        'Fordow', 'Shahr-e Ray', 'Robat Karim', 'Baherestan', 'Malard',
        'Parchin', 'Kashan'
    ]
}; 