import re

with open('C:/Mood-based-Recommender/js/discover.js', 'r', encoding='utf-8') as f:
    content = f.read()

styles_insert = """
    .discover-mode-btn {
        background: rgba(255,255,255,0.05);
        border-color: rgba(255,255,255,0.1);
        color: var(--on-surface-variant);
    }
    .discover-mode-btn.active {
        background: rgba(233,255,185,0.15);
        border-color: var(--primary);
        color: var(--primary);
    }
    .discover-card-audio-visualizer {
        position: absolute;
        bottom: 24px;
        right: 24px;
        display: flex;
        align-items: flex-end;
        gap: 4px;
        height: 30px;
        z-index: 20;
    }
    .visualizer-bar {
        width: 4px;
        background: var(--primary);
        border-radius: 2px;
        animation: pulse-height 0.5s ease-in-out infinite alternate;
    }
    @keyframes pulse-height {
        0% { height: 4px; }
        100% { height: 100%; }
    }
"""

content = content.replace('.stamp-like {', styles_insert + '\n    .stamp-like {')

music_logic = """
let currentDiscoverMode = 'film'; // 'film' or 'music'
let audioPreview = new Audio();
let ytPlayerDiscover = null;

window.switchDiscoverMode = function(mode) {
    if (currentDiscoverMode === mode) return;
    currentDiscoverMode = mode;
    
    // Update UI
    document.getElementById('discover-mode-film').classList.remove('active');
    document.getElementById('discover-mode-music').classList.remove('active');
    document.getElementById(`discover-mode-${mode}`).classList.add('active');
    
    // Stop audio if playing
    if (audioPreview) audioPreview.pause();
    
    // Reload content
    loadDiscoverContent(1);
}

// Intercept fetch based on mode
"""

# Find the loadDiscoverContent function to inject music fetch logic
load_func = re.search(r'async function loadDiscoverContent.*?try \{.*?\} catch', content, re.DOTALL)
if load_func:
    new_load_func = load_func.group(0).replace(
        """        const randomPage = page > 1 ? page : Math.floor(Math.random() * 20) + 1;
        const res = await fetch(`https://ophim1.com/v1/api/danh-sach/phim-moi-cap-nhat?page=${randomPage}`);
        const data = await res.json();

        if (data.status === 'success' && data.data.items.length > 0) {
            const newItems = data.data.items;
            const imgDomain = data.data.APP_DOMAIN_CDN_IMAGE || data.pathImage || 'https://img.ophim.live';

            const formattedCards = newItems.map(item => ({
                id: item._id,
                slug: item.slug,
                title: item.name,
                originalTitle: item.origin_name,
                image: `${imgDomain}/uploads/movies/${item.poster_url}`,
                thumb: `${imgDomain}/uploads/movies/${item.thumb_url}`,
                year: item.year,
                type: item.type === 'series' ? 'Phim Bộ' : 'Phim Lẻ',
                quality: item.quality || 'HD',
                lang: item.lang || 'Vietsub'
            }));""",
        """        let formattedCards = [];
        
        if (currentDiscoverMode === 'film') {
            const randomPage = page > 1 ? page : Math.floor(Math.random() * 20) + 1;
            const res = await fetch(`https://ophim1.com/v1/api/danh-sach/phim-moi-cap-nhat?page=${randomPage}`);
            const data = await res.json();

            if (data.status === 'success' && data.data.items.length > 0) {
                const imgDomain = data.data.APP_DOMAIN_CDN_IMAGE || data.pathImage || 'https://img.ophim.live';
                formattedCards = data.data.items.map(item => ({
                    id: item._id,
                    slug: item.slug,
                    title: item.name,
                    originalTitle: item.origin_name,
                    image: `${imgDomain}/uploads/movies/${item.poster_url}`,
                    thumb: `${imgDomain}/uploads/movies/${item.thumb_url}`,
                    year: item.year,
                    type: item.type === 'series' ? 'Phim Bộ' : 'Phim Lẻ',
                    quality: item.quality || 'HD',
                    lang: item.lang || 'Vietsub'
                }));
            }
        } else {
            // Music Discovery (Fetching from existing local backend or hardcoded diverse search terms)
            const searchTerms = ['lofi chill', 'vietnamese pop 2024', 'synthwave mix', 'jazz background', 'acoustic cover', 'trending tiktok songs', 'indie rock'];
            const randomTerm = searchTerms[Math.floor(Math.random() * searchTerms.length)];
            
            try {
                // Try backend YouTube search if available
                const res = await fetch(`/api/search_yt?q=${encodeURIComponent(randomTerm)}`);
                const data = await res.json();
                
                if (data.results && data.results.length > 0) {
                    formattedCards = data.results.slice(0, 10).map(item => ({
                        id: item.id || Math.random().toString(36).substr(2, 9),
                        slug: item.id,
                        title: item.title,
                        originalTitle: item.channel || 'YouTube Music',
                        image: item.thumbnail,
                        thumb: item.thumbnail,
                        year: 'Audio',
                        type: 'Music',
                        quality: item.duration || 'Unknown',
                        lang: 'YT'
                    }));
                }
            } catch(e) {
                // Fallback demo data if backend fails
                formattedCards = [
                    {id: 'm1', slug: 'demo-1', title: 'Midnight City', originalTitle: 'M83', image: 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=500', thumb: '', year: 'Audio', type: 'Music', quality: '3:20', lang: 'Pop'},
                    {id: 'm2', slug: 'demo-2', title: 'Blinding Lights', originalTitle: 'The Weeknd', image: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?q=80&w=500', thumb: '', year: 'Audio', type: 'Music', quality: '4:10', lang: 'Synth'},
                    {id: 'm3', slug: 'demo-3', title: 'Nơi Này Có Anh', originalTitle: 'Sơn Tùng M-TP', image: 'https://images.unsplash.com/photo-1493225457124-a1a2a5f5f929?q=80&w=500', thumb: '', year: 'Audio', type: 'Music', quality: '4:20', lang: 'V-Pop'}
                ];
            }
        }

        if (formattedCards.length > 0) {"""
    )
    content = content.replace(load_func.group(0), music_logic + '\n' + new_load_func)

# Fix the render check
content = content.replace('if (data.status === \'success\' && data.data.items.length > 0)', 'if (formattedCards.length > 0)')

with open('C:/Mood-based-Recommender/js/discover.js', 'w', encoding='utf-8') as f:
    f.write(content)
