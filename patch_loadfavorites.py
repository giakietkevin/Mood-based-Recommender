import re

with open('C:/Mood-based-Recommender/js/app.js', 'r', encoding='utf-8') as f:
    content = f.read()

load_favorites = """        window.loadFavorites = async () => {
            // Load local favorites from Tinder Music feature
            try {
                const localFavs = JSON.parse(localStorage.getItem('kiet_music_favorites') || '[]');
                // Map local format to app format so it can be played
                const mappedLocal = localFavs.map(f => ({
                    title: f.title,
                    artist: f.artist,
                    cover_url: f.image,
                    link: f.id, // For YouTube search/play if needed
                    search_query: f.title + ' ' + f.artist, // We use this to play
                    source: 'youtube'
                }));
                myFavorites = [...mappedLocal];
            } catch(e) {}

            // Load backend favorites if logged in
            if (window.currentUserUid) {
                try {
                    const res = await fetch(`/favorites?uid=${window.currentUserUid}`);
                    const dbFavs = await res.json();
                    
                    // Merge avoiding duplicates by link/file_url
                    dbFavs.forEach(dbF => {
                        const exists = myFavorites.find(mf => (mf.link || mf.file_url) === (dbF.link || dbF.file_url));
                        if (!exists) myFavorites.push(dbF);
                    });
                } catch (e) { }
            }
            
            renderLibraryFavorites();
            if(typeof updateAllFavIcons === 'function') updateAllFavIcons();
        };"""

pattern = re.compile(r'        window\.loadFavorites = async \(\) => \{.*?\n        \};\n', re.DOTALL)
content = pattern.sub(load_favorites + '\n', content)

with open('C:/Mood-based-Recommender/js/app.js', 'w', encoding='utf-8') as f:
    f.write(content)
