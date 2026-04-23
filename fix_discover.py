import re

with open('C:/Mood-based-Recommender/js/discover.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Fix the film fetch condition
content = content.replace(
"""            if (formattedCards.length > 0) {
                const imgDomain = data.data.APP_DOMAIN_CDN_IMAGE || data.pathImage || 'https://img.ophim.live';
                formattedCards = data.data.items.map(item => ({""",
"""            if (data.status === 'success' && data.data.items.length > 0) {
                const imgDomain = data.data.APP_DOMAIN_CDN_IMAGE || data.pathImage || 'https://img.ophim.live';
                formattedCards = data.data.items.map(item => ({"""
)

# Add logic to stop music when swiping or closing
stop_music_logic = """
    if (audioPreview) {
        audioPreview.pause();
        audioPreview.currentTime = 0;
    }
"""
content = content.replace("currentCardIndex++;", "currentCardIndex++;\n" + stop_music_logic)

with open('C:/Mood-based-Recommender/js/discover.js', 'w', encoding='utf-8') as f:
    f.write(content)
