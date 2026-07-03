import re

with open('C:/Mood-based-Recommender/js/app.js', 'r', encoding='utf-8') as f:
    content = f.read()

new_playtrack = """                        // Fallback: search for the song if video ID is invalid
                        console.warn("Invalid video ID, attempting search:", data.title);
                        if (window.performSearch) {
                            const searchInput = document.getElementById('search-input');
                            if (searchInput) {
                                searchInput.value = data.title + (data.artist ? ' ' + data.artist : '');
                                // Auto search and play first result
                                fetch(`/search?q=${encodeURIComponent(searchInput.value)}&type=music`)
                                    .then(r => r.json())
                                    .then(d => {
                                        if (d.recommendations && d.recommendations.length > 0) {
                                            const firstRes = d.recommendations[0];
                                            const newVidId = extractVideoId(firstRes.link);
                                            if (newVidId && newVidId.length === 11) {
                                                ytPlayer.loadVideoById(newVidId);
                                                ytPlayer.playVideo();
                                                playIcon.innerText = "pause";
                                                
                                                // Update UI to match real found video
                                                document.getElementById('player-thumb').src = firstRes.thumbnail;
                                                document.getElementById('player-title').innerText = firstRes.title;
                                            }
                                        }
                                    });
                                window.performSearch(); // Still show results in dashboard
                            }
                        }"""

pattern = re.compile(r'                        // Fallback: search for the song if video ID is invalid.*?window\.performSearch\(\);\n                            \}\n                        \}', re.DOTALL)
content = pattern.sub(new_playtrack, content)

with open('C:/Mood-based-Recommender/js/app.js', 'w', encoding='utf-8') as f:
    f.write(content)
