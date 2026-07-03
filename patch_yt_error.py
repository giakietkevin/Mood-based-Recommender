import re

with open('C:/Mood-based-Recommender/js/app.js', 'r', encoding='utf-8') as f:
    content = f.read()

new_events = """                events: {
                    'onReady': () => { isYtReady = true; },
                    'onError': (event) => {
                        console.warn("YouTube Player Error:", event.data);
                        if (event.data === 101 || event.data === 150 || event.data === 2) {
                            alert("Video này bị YouTube chặn phát trên trang web khác. Đang mở YouTube trực tiếp...");
                            if (window.currentTrackData && window.currentTrackData.link) {
                                window.open(window.currentTrackData.link, '_blank');
                            }
                        }
                    },
                    'onStateChange': (event) => {"""

pattern = re.compile(r"                events: \{\n                    'onReady': \(\) => \{ isYtReady = true; \},\n                    'onStateChange': \(event\) => \{", re.DOTALL)
content = pattern.sub(new_events, content)

with open('C:/Mood-based-Recommender/js/app.js', 'w', encoding='utf-8') as f:
    f.write(content)
