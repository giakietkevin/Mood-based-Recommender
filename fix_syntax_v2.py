import sys

path = 'c:/Mood-based-Recommender/js/app.js'
with open(path, 'r', encoding='utf-8') as f:
    lines = f.readlines()

out = []
fixing = False
for line in lines:
    if 'div.innerHTML = \\' in line:
        fixing = True
        out.append('                div.innerHTML = `\n')
        continue
    if fixing and '\\;' in line:
        fixing = False
        out.append('                `;\n')
        continue
    if fixing:
        # Restore variables
        if '<img src="\\"' in line:
             line = line.replace('src="\\"', 'src="${s.content}"')
        if '<img src="\\"' in line: # second one
             line = line.replace('src="\\"', 'src="${s.author_avatar}"')
        if 'drop-shadow-md">\\' in line:
             line = line.replace('drop-shadow-md">\\', 'drop-shadow-md">${s.author_name}')
        out.append(line)
    else:
        out.append(line)

with open(path, 'w', encoding='utf-8') as f:
    f.writelines(out)

print("Fixed.")
