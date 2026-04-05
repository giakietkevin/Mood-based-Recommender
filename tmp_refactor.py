"""
Refactor index.html → split CSS + JS into separate files.
Safe strategy: keep global scope (no modules), correct load order.
"""
import re, os, textwrap

# ── Read source ──────────────────────────────────────────────────────────────
src = open('index.html', encoding='utf-8').read()

# ── Create directories ───────────────────────────────────────────────────────
os.makedirs('css', exist_ok=True)
os.makedirs('js', exist_ok=True)

result = src  # we'll do replacements on this

# ══════════════════════════════════════════════════════════════════════════════
# STEP 1: Extract <style> → css/app.css
# ══════════════════════════════════════════════════════════════════════════════
style_match = re.search(r'(<style[^>]*>)(.*?)(</style>)', src, re.DOTALL)
if style_match:
    css_content = style_match.group(2)
    open('css/app.css', 'w', encoding='utf-8').write(css_content.strip() + '\n')
    result = result.replace(
        style_match.group(0),
        '    <link rel="stylesheet" href="/css/app.css">'
    )
    print(f'[OK] css/app.css  ({len(css_content)} chars)')
else:
    print('[SKIP] No <style> block found')

# ══════════════════════════════════════════════════════════════════════════════
# STEP 2: Find all <script> blocks
# ══════════════════════════════════════════════════════════════════════════════
all_scripts = list(re.finditer(r'<script[^>]*>.*?</script>', src, re.DOTALL))
print(f'\nFound {len(all_scripts)} script blocks:')
for i, m in enumerate(all_scripts):
    ln = src[:m.start()].count('\n') + 1
    ln2 = src[:m.end()].count('\n') + 1
    lines = ln2 - ln + 1
    preview = m.group()[:80].replace('\n', ' ').replace('\r', '')
    print(f'  [{i:02d}] L{ln}-L{ln2} ({lines} lines): {preview}')

# ══════════════════════════════════════════════════════════════════════════════
# STEP 3: Identify blocks by content / attributes
#
# Strategy:
#   - External src scripts → keep as <script src="..."> in HTML (no change)  
#   - Inline scripts > 50 lines → extract to js/
#   - Patch social script (last one, has PATCH comment) → js/social.js
#   - All other big inline blocks → js/app.js  (one file, safe)
#   - Tiny inline blocks → keep inline
# ══════════════════════════════════════════════════════════════════════════════

external_scripts = []   # keep as-is
inline_blocks = []      # (match, line_count, is_patch)

for m in all_scripts:
    tag = m.group()
    # External (has src attribute)
    if re.search(r'<script\s[^>]*src=', tag):
        external_scripts.append(m)
        continue
    inner = re.search(r'<script[^>]*>(.*?)</script>', tag, re.DOTALL)
    if not inner:
        continue
    body = inner.group(1)
    lines = body.count('\n')
    is_patch = 'PATCH: Social Interactions' in body or 'Patch Social v2' in body
    inline_blocks.append((m, lines, is_patch, body))

print(f'\nExternal scripts: {len(external_scripts)}')
print(f'Inline blocks: {len(inline_blocks)}')
for m, lines, is_patch, body in inline_blocks:
    ln = src[:m.start()].count('\n') + 1
    print(f'  L{ln}: {lines} lines, patch={is_patch}')

# ══════════════════════════════════════════════════════════════════════════════
# STEP 4: Extract social patch → js/social.js
# ══════════════════════════════════════════════════════════════════════════════
patch_block = next(((m, body) for m, lines, is_patch, body in inline_blocks if is_patch), None)
if patch_block:
    pm, pbody = patch_block
    open('js/social.js', 'w', encoding='utf-8').write(pbody.strip() + '\n')
    result = result.replace(pm.group(0), '<script src="/js/social.js"></script>')
    print(f'\n[OK] js/social.js  ({len(pbody)} chars)')

# ══════════════════════════════════════════════════════════════════════════════
# STEP 5: Extract large inline blocks → js/app.js
#   (all non-patch inline blocks with > 10 lines, merged together in order)
# ══════════════════════════════════════════════════════════════════════════════
big_blocks = [(m, body) for m, lines, is_patch, body in inline_blocks
              if not is_patch and lines > 10]

if big_blocks:
    # Combine in document order
    app_js_parts = []
    for m, body in big_blocks:
        ln = src[:m.start()].count('\n') + 1
        app_js_parts.append(f'\n/* ---- extracted from index.html L{ln} ---- */\n')
        app_js_parts.append(body.strip())
    
    app_js_content = '\n'.join(app_js_parts)
    open('js/app.js', 'w', encoding='utf-8').write(app_js_content + '\n')
    
    # Replace first big block with <script src="js/app.js">, remove the rest
    first_replaced = False
    for m, body in big_blocks:
        if not first_replaced:
            result = result.replace(m.group(0), '<script src="/js/app.js"></script>')
            first_replaced = True
        else:
            result = result.replace(m.group(0), '')
    
    print(f'[OK] js/app.js  ({len(app_js_content)} chars, {len(big_blocks)} blocks merged)')

# ══════════════════════════════════════════════════════════════════════════════
# STEP 6: Save updated index.html
# ══════════════════════════════════════════════════════════════════════════════
# Backup original
import shutil
shutil.copy('index.html', 'index.html.bak')

open('index.html', 'w', encoding='utf-8').write(result)
print(f'\n[OK] index.html updated (backup: index.html.bak)')

# Stats
orig_lines = src.count('\n')
new_lines  = result.count('\n')
print(f'     Original: {orig_lines} lines → New: {new_lines} lines  (saved {orig_lines - new_lines})')
