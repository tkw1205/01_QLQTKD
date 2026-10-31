import os
os.environ['PYTHONUTF8'] = '1'

with open('src/ai/orchestrator.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Use exact single-quoted string match (no triple quotes) by building from parts
old_lines = [
    '  if (!isHoldActiveNow) {\n',
    '    const falseHoldRegex =\n',
    '      /(?:Ch\u00fang t\u00f4i|Em|Salon|T\u00f4i)?\\s*(?:s\u1ebd\\s+)?gi\u1eef ch\u1ed7 t\u1ea1m th\u1eddi\\s*(?:cho b\u1ea1n\\s*)?(?:trong\\s*(?:5|10)\\s*ph\u00fat)?[^.!?\\n]*[.!?]?/gi;\n',
    '\n',
    '    if (falseHoldRegex.test(finalContent)) {\n',
    "      console.log('[AI] Safety handler: Cleared false hold claim since no active hold exists in DB.');\n",
    '\n',
    '      finalContent = finalContent\n',
    "        .replace(falseHoldRegex, '')\n",
    "        .replace(/\\s{2,}/g, ' ')\n",
    '        .trim();\n',
    '    }\n',
    '  }',
]
old_block = ''.join(old_lines)

# Backtick character
bt = chr(96)
triple_bt = bt * 3

new_lines = [
    '  // Safety check 4: Xo\u00e0 JSON gi\u1ea3 / code block m\u00e0 AI t\u1ef1 b\u1ecba ra trong c\u00e2u tr\u1ea3 l\u1eddi.\n',
    '  const codeBlockRegex = /' + triple_bt + '[\\s\\S]*?' + triple_bt + '/g;\n',
    '  if (codeBlockRegex.test(finalContent)) {\n',
    "    console.log('[AI] Safety handler: Stripped hallucinated code block / fake tool JSON from response.');\n",
    '    finalContent = finalContent\n',
    "      .replace(codeBlockRegex, '')\n",
    "      .replace(/\\n{3,}/g, '\\n\\n')\n",
    '      .trim();\n',
    '  }\n',
    '\n',
    '  // Safety check 5: Xo\u00e0 c\u00e1c c\u00e2u m\u00f4 ph\u1ecfng th\u00f4ng b\u00e1o gi\u1ea3 t\u1eeb c\u00f4ng c\u1ee5.\n',
    '  const fakeToolNoticeRegex =\n',
    '    /(?:D\u01b0\u1edbi \u0111\u00e2y l\u00e0|\u0110\u00e2y l\u00e0)\\s*(?:th\u00f4ng b\u00e1o|k\u1ebft qu\u1ea3|ph\u1ea3n h\u1ed3i)\\s*(?:t\u1eeb|c\u1ee7a)\\s*(?:c\u00f4ng c\u1ee5|h\u1ec7 th\u1ed1ng|tool)[^\\n]*\\n?/gi;\n',
    '  if (fakeToolNoticeRegex.test(finalContent)) {\n',
    "    console.log('[AI] Safety handler: Stripped fake tool notice from response.');\n",
    '    finalContent = finalContent\n',
    "      .replace(fakeToolNoticeRegex, '')\n",
    "      .replace(/\\n{3,}/g, '\\n\\n')\n",
    '      .trim();\n',
    '  }\n',
    '\n',
    '  if (!isHoldActiveNow) {\n',
    '    // M\u1edf r\u1ed9ng regex \u0111\u1ec3 b\u1eaft th\u00eam "\u0111\u00e3 gi\u1eef ch\u1ed7" / "\u0111\u00e3 \u0111\u01b0\u1ee3c gi\u1eef ch\u1ed7"\n',
    '    const falseHoldRegex =\n',
    '      /(?:Ch\u00fang t\u00f4i|Em|Salon|T\u00f4i|[Kk]hung gi\u1edd [\\d:]+\\s*(?:ng\u00e0y [\\d\\-\\/]+)?)?\\s*(?:(?:s\u1ebd|\u0111\u00e3|\u0111\u00e3 \u0111\u01b0\u1ee3c)\\s+)?(?:gi\u1eef ch\u1ed7 t\u1ea1m th\u1eddi|gi\u1eef ch\u1ed7|\u0111\u00e3 \u0111\u01b0\u1ee3c gi\u1eef ch\u1ed7|\u0111\u00e3 gi\u1eef ch\u1ed7)\\s*(?:cho b\u1ea1n\\s*)?(?:trong\\s*(?:5|10)\\s*ph\u00fat)?[^.!?\\n]*[.!?]?/gi;\n',
    '\n',
    '    if (falseHoldRegex.test(finalContent)) {\n',
    "      console.log('[AI] Safety handler: Cleared false hold claim since no active hold exists in DB.');\n",
    '\n',
    '      finalContent = finalContent\n',
    "        .replace(falseHoldRegex, '')\n",
    "        .replace(/\\s{2,}/g, ' ')\n",
    '        .trim();\n',
    '    }\n',
    '  }',
]
new_block = ''.join(new_lines)

if old_block in content:
    content = content.replace(old_block, new_block, 1)
    print('Fix 2: OK')
else:
    print('Fix 2: NOT FOUND, debugging...')
    idx = content.find('  if (!isHoldActiveNow)')
    actual = content[idx: idx + len(old_block)]
    for i, (a, b) in enumerate(zip(old_block, actual)):
        if a != b:
            print(f'  Diff at {i}: old={repr(a)} actual={repr(b)}')
            print(f'  old[{i-10}:{i+10}] = {repr(old_block[max(0,i-10):i+20])}')
            print(f'  actual[{i-10}:{i+10}] = {repr(actual[max(0,i-10):i+20])}')
            break
    import sys; sys.exit(1)

with open('src/ai/orchestrator.js', 'w', encoding='utf-8') as f:
    f.write(content)

print('File written successfully.')
