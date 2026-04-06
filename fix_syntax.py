import sys

path = 'c:/Mood-based-Recommender/js/app.js'
with open(path, 'r', encoding='utf-8') as f:
    content = f.read()

# Fix the broken renderStories (look for the unique malformed part)
# div.innerHTML = \
#     <img src="\" ...
# \*;

import re
pattern = r'div\.innerHTML = \\\s+<img src="\\" class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700">\s+<div class="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/70"></div>\s+<div class="absolute top-3 left-3 w-9 h-9 rounded-full border-2 border-primary overflow-hidden shadow-lg ring-2 ring-black/50">\s+<img src="\\" class="w-full h-full object-cover bg-white">\s+</div>\s+<span class="absolute bottom-3 left-3 right-3 text-white text-\[10px\] font-black uppercase tracking-tighter truncate drop-shadow-md">\\</span>\s+\\;'

replacement = """div.innerHTML = `
                    <img src="${s.content}" class="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700">
                    <div class="absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/70"></div>
                    <div class="absolute top-3 left-3 w-9 h-9 rounded-full border-2 border-primary overflow-hidden shadow-lg ring-2 ring-black/50">
                        <img src="${s.author_avatar}" class="w-full h-full object-cover bg-white">
                    </div>
                    <span class="absolute bottom-3 left-3 right-3 text-white text-[10px] font-black uppercase tracking-tighter truncate drop-shadow-md">${s.author_name}</span>
                `;"""

new_content = re.sub(pattern, replacement, content)

with open(path, 'w', encoding='utf-8') as f:
    f.write(new_content)

print("Fixed.")
