import re

with open('C:/Mood-based-Recommender/js/discover.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix the fallback block and structure
fallback_logic = """                // Try backend YouTube search
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
                } else {
                    throw new Error("No recommendations from backend");
                }
            } catch(e) {
                console.warn("Backend search failed, using extensive fallback:", e);
                // Large fallback list to prevent "out of cards" when backend is down
                const fallbackDB = [
                    {title: 'Midnight City', artist: 'M83', img: 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=500'},
                    {title: 'Lofi Hip Hop Mix', artist: 'Chill Beats', img: 'https://images.unsplash.com/photo-1514525253161-7a46d19cd819?q=80&w=500'},
                    {title: 'Blinding Lights', artist: 'The Weeknd', img: 'https://images.unsplash.com/photo-1493225457124-a1a2a5f5f929?q=80&w=500'},
                    {title: 'Sunset Lover', artist: 'Petit Biscuit', img: 'https://images.unsplash.com/photo-1470225620780-dba8ba36b745?q=80&w=500'},
                    {title: 'Shape of You', artist: 'Ed Sheeran', img: 'https://images.unsplash.com/photo-1459749411175-04bf5292ceea?q=80&w=500'},
                    {title: 'Bohemian Rhapsody', artist: 'Queen', img: 'https://images.unsplash.com/photo-1487180144351-b8472da7d491?q=80&w=500'},
                    {title: 'Imagine', artist: 'John Lennon', img: 'https://images.unsplash.com/photo-1511379938547-c1f69b13d835?q=80&w=500'},
                    {title: 'Nơi Này Có Anh', artist: 'Sơn Tùng', img: 'https://images.unsplash.com/photo-1614613535308-eb5fbd3d2c17?q=80&w=500'}
                ];
                
                const shuffled = fallbackDB.sort(() => Math.random() - 0.5);
                formattedCards = shuffled.map(item => {
                    const seed = Math.random().toString(36).substr(2, 5);
                    return {
                        id: 'demo-' + seed, 
                        slug: 'demo', 
                        title: item.title, 
                        originalTitle: item.artist, 
                        image: item.img, 
                        thumb: item.img, 
                        year: 'Audio', 
                        type: 'Music', 
                        quality: 'HD', 
                        lang: 'Pop'
                    };
                });
            }
        }

        if (formattedCards.length > 0) {
            discoverCards = [...discoverCards, ...formattedCards];
            renderDiscoverCards();
        } else if (discoverCards.length === 0) {
            empty.classList.remove('hidden');
        }"""

# Do the replacement
old_pattern = re.compile(r'                // Try backend YouTube search.*?empty\.classList\.remove\(\'hidden\'\);\n        \}', re.DOTALL)
content = old_pattern.sub(fallback_logic, content)

with open('C:/Mood-based-Recommender/js/discover.js', 'w', encoding='utf-8') as f:
    f.write(content)
