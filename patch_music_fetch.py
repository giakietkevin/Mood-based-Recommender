import re

with open('C:/Mood-based-Recommender/js/discover.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace the fallback logic with actual API fetch
new_logic = """        } else {
            // Music Discovery (Fetching from existing local backend /search)
            const searchTerms = ['lofi chill viet nam', 'vietnamese pop 2024 hit', 'tiktok viral vn', 'rap viet trending', 'indie vn chill', 'nhac acoustic hay', 'remix hot tiktok'];
            const randomTerm = searchTerms[Math.floor(Math.random() * searchTerms.length)];
            
            try {
                // Try backend YouTube search
                const res = await fetch(`/search?q=${encodeURIComponent(randomTerm)}&type=music`);
                const data = await res.json();
                
                if (data.recommendations && data.recommendations.length > 0) {
                    formattedCards = data.recommendations.map(item => {
                        const vidId = item.link.includes('v=') ? item.link.split('v=')[1].split('&')[0] : Math.random().toString(36).substr(2, 9);
                        return {
                            id: vidId + Math.random().toString(36).substr(2, 5), // Ensure unique
                            slug: item.link,
                            title: item.title.replace(' - YouTube', '').substring(0, 40),
                            originalTitle: randomTerm,
                            image: item.thumbnail || 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=500',
                            thumb: item.thumbnail,
                            year: 'Audio',
                            type: 'Music',
                            quality: 'YT',
                            lang: 'Music'
                        };
                    });
                }
            } catch(e) {
                console.error("Music fetch error:", e);
                // Fallback demo data if backend fails completely
                const seed = Math.random().toString(36).substr(2, 5);
                formattedCards = [
                    {id: 'm1'+seed, slug: 'demo', title: 'Lỗi Kết Nối Máy Chủ', originalTitle: 'Vui lòng kiểm tra lại backend', image: 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=500', thumb: '', year: 'Audio', type: 'Music', quality: 'Error', lang: 'Fail'}
                ];
            }
        }"""

# Find the block to replace
old_logic_pattern = re.compile(r'\} else \{\s*// Music Discovery - Generate diverse music cards.*?\}\n', re.DOTALL)
content = old_logic_pattern.sub(new_logic + '\n', content)

with open('C:/Mood-based-Recommender/js/discover.js', 'w', encoding='utf-8') as f:
    f.write(content)
