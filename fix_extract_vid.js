const fs = require('fs');

let content = fs.readFileSync('C:/Mood-based-Recommender/js/app.js', 'utf8');

const newExtract = `        function extractVideoId(url) {
            if (!url) return null;
            if (url.length === 11 && !url.includes('/')) return url;
            
            var regExp = /^.*((youtu.be\/)|(v\/)|(\/u\/\w\/)|(embed\/)|(watch\?))\??v?=?([^#&?]*).*/;
            var match = url.match(regExp);
            if (match && match[7].length == 11) {
                return match[7];
            }
            
            var shortsMatch = url.match(/shorts\/([a-zA-Z0-9_-]{11})/);
            if (shortsMatch) {
                return shortsMatch[1];
            }
            
            if (url.includes('v=')) {
                var vParts = url.split('v=')[1];
                if (vParts) {
                    var vid = vParts.split('&')[0];
                    if (vid.length === 11) return vid;
                }
            }
            
            return null;
        }`;

content = content.replace(/ {8}function extractVideoId\(url\) \{[\s\S]*? {8}\}/, newExtract);

fs.writeFileSync('C:/Mood-based-Recommender/js/app.js', content, 'utf8');
