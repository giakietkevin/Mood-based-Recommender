with open('js/app.js', 'r', encoding='utf-8') as f:
    content = f.read()

old_code = "videoElem.className = 'max-w-full max-h-full rounded-xl';"
new_code = "videoElem.className = 'w-full h-full object-contain bg-black rounded-xl pointer-events-auto relative z-10';"

if old_code in content:
    content = content.replace(old_code, new_code)
    with open('js/app.js', 'w', encoding='utf-8') as f:
        f.write(content)
    print("Replaced successfully")
else:
    print("Old code not found")
