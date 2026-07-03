import re

with open('C:/Mood-based-Recommender/js/app.js', 'r', encoding='utf-8') as f:
    content = f.read()

new_extract = """        function extractVideoId(url) {
            if (!url) return null;
            // Handle direct 11-char IDs
            if (url.length === 11 && !url.includes('/')) return url;
            
            // Standard regex for most Youtube URLs
            var regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
            var match = url.match(regExp);
            if (match && match[7].length == 11) {
                return match[7];
            }
            
            // Handle youtube.com/shorts/ ID
            var shortsMatch = url.match(/shorts\/([a-zA-Z0-9_-]{11})/);
            if (shortsMatch) {
                return shortsMatch[1];
            }
            
            // Fallback for query param v=
            if (url.includes('v=')) {
                var vParts = url.split('v=')[1];
                if (vParts) {
                    var vid = vParts.split('&')[0];
                    if (vid.length === 11) return vid;
                }
            }
            
            return null;
        }"""

pattern = re.compile(r'        function extractVideoId\(url\) \{.*?\n        \}', re.DOTALL)
content = pattern.sub(new_extract, content)

with open('C:/Mood-based-Recommender/js/app.js', 'w', encoding='utf-8') as f:
    f.write(content)
