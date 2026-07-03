import re

with open('C:/Mood-based-Recommender/js/app.js', 'r', encoding='utf-8') as f:
    content = f.read()

load_favorites = """        window.loadFavorites = async () => {
            let tempFavs = [];
            // Load backend favorites if logged in
            if (window.currentUserUid) {
                try {
                    const res = await fetch(`/favorites?uid=${window.currentUserUid}`);
                    const dbFavs = await res.json();
                    tempFavs = [...dbFavs];
                } catch (e) { }
            }
            
            // Load local favorites from Tinder Music feature
            try {
                const localFavs = JSON.parse(localStorage.getItem('kiet_music_favorites') || '[]');
                const mappedLocal = localFavs.map(f => ({
                    title: f.title,
                    thumbnail: f.image,
                    link: f.id.includes('youtube.com') ? f.id : 'https://www.youtube.com/watch?v=' + f.id,
                    type: 'youtube',
                    source: 'tinder'
                }));
                
                // Merge avoiding duplicates
                mappedLocal.forEach(local => {
                    const exists = tempFavs.find(t => (t.link || t.file_url) === local.link);
                    if (!exists) tempFavs.push(local);
                });
            } catch(e) {}
            
            myFavorites = tempFavs;
            renderLibraryFavorites();
            if(typeof updateAllFavIcons === 'function') updateAllFavIcons();
        };"""

pattern = re.compile(r'        window\.loadFavorites = async \(\) => \{.*?\n        \};\n', re.DOTALL)
content = pattern.sub(load_favorites + '\n', content)

with open('C:/Mood-based-Recommender/js/app.js', 'w', encoding='utf-8') as f:
    f.write(content)
