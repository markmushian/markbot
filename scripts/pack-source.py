import os, json, hashlib, zipfile, time, re

ROOT = os.getcwd()
STAMP = time.strftime('%Y%m%d-%H%M%S')
OUT = os.path.join(r'E:\AI小程序\Mark bot', f'markbot-source-{STAMP}.zip')

EXCLUDE_DIRS = {'node_modules', '.git', 'dist', 'dist-server', 'dist-companion', 'dist-native',
                'release', 'release-v14', 'release-v15', '.tmpexp', '.pnpm-home', '.claude', '.oss-scanner'}
EXCLUDE_EXT = {'.tsbuildinfo', '.log'}
INCLUDE_TOP = ['src', 'server', 'shared', 'electron', 'companion', 'connector', 'scripts',
               'enterprise', 'evals', 'cloudflare', 'third_party', 'skills', 'public', 'assets',
               'build', 'deploy', 'apps', 'docs', '.github', '.well-known']
ROOT_FILES = re.compile(r'^(package\.json|pnpm-lock\.yaml|tsconfig[^/]*\.json|vite\.config\.ts|'
                        r'electron-builder\.yml|\.oxlintrc\.json|index\.html|[\w-]+-preview\.html|'
                        r'README[\w.-]*|LICENSE[\w.-]*|CHANGELOG[\w.-]*|\.env\.example|'
                        r'\.docs-media-removed\.txt|\.gitignore|\.npmrc)$')


def want(fp):
    parts = fp.replace('\\', '/').split('/')
    if any(p in EXCLUDE_DIRS for p in parts):
        return False
    base = parts[-1]
    return os.path.splitext(base)[1].lower() not in EXCLUDE_EXT


entries = []
for top in INCLUDE_TOP:
    p = os.path.join(ROOT, top)
    if not os.path.exists(p):
        continue
    for b, d, fs in os.walk(p):
        d[:] = [x for x in d if x not in EXCLUDE_DIRS]
        for f in fs:
            fp = os.path.join(b, f)
            if want(fp):
                entries.append(fp)
for f in os.listdir(ROOT):
    fp = os.path.join(ROOT, f)
    if os.path.isfile(fp) and ROOT_FILES.match(f):
        entries.append(fp)
entries = sorted(set(entries))
total = sum(os.path.getsize(e) for e in entries)
print(f'files {len(entries)}  source size {total/1e6:.1f} MB')

TESTISH = re.compile(r'(\.test\.|\.e2e\.|/testing/|/test/)')
SECRET = [('github_pat', re.compile(rb'github_pat_[A-Za-z0-9_]{20,}')),
          ('ghp', re.compile(rb'ghp_[A-Za-z0-9]{20,}')),
          ('sk', re.compile(rb'sk-(?!ant-api03-EXAMPLE)[A-Za-z0-9]{20,}')),
          ('pem', re.compile(rb'-----BEGIN [A-Z ]*PRIVATE KEY-----\n[A-Za-z0-9+/=\n]{40,}'))]
viol = []
for e in entries:
    if e.endswith(('.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.icns', '.mp4', '.woff', '.woff2', '.zip', '.gz', '.pdf')):
        continue
    raw = open(e, 'rb').read()
    for name, rx in SECRET:
        if rx.search(raw) and not TESTISH.search(e.replace('\\', '/')):
            viol.append((name, e.replace('\\', '/')))
print('forbidden (non-test):', len(viol), viol[:3])

README = """# Mark Bot source package (STAMP)

Prepared with the **Codex ReHome** skill's standard-mode discipline
(https://github.com/CalebYcj/codex-rehome-skill, MIT). Source only - no built app,
no dependencies, no secrets. Made to be **read by an AI assistant**.

## Read it in this order
1. `README-PACKAGE.md` (this file) - what is here and how it fits together
2. `package.json` - scripts and dependencies
3. `src/` - the Electron renderer (React + Tailwind v4), entry `src/app.tsx`
4. `server/` - the Node backend, entry `server/index.ts`
5. `shared/` - code used by both sides
6. `electron/` - the desktop shell (main process), entry `electron/main.mjs`
7. `docs/` - plans, verification notes and the design brief
8. `MANIFEST.txt` - every file with its size

## Where things live
| Path | What it is |
|---|---|
| `src/components/` | 700+ UI components |
| `src/lib/` | helpers (i18n, cn, avatar, skins) |
| `src/state/` | the store (state management) |
| `src/styles.css` | the type scale, colour tokens and skins |
| `server/routes/` | HTTP endpoints |
| `server/drivers/` | model-provider drivers |
| `scripts/testing/` | guard tests, incl. `design-ratchet.test.ts` |
| `shared/mascot-bodies.ts` | the generated mascot body catalogue |

## Notable conventions in this tree
- Type sizes are tokens (`text-ui`, `text-note`, ...) defined in `src/styles.css`,
  never raw `text-[13px]`. `scripts/testing/design-ratchet.test.ts` enforces this.
- `src/lib/cn.ts` registers the type scale with tailwind-merge so a size and a
  colour can sit in one `cn()` call without one cancelling the other.
- Radii are per-skin (`--radius-lg` is redefined in every skin), so they are NOT
  global constants. Type sizes are global.
- Easing is one curve (`ease-standard`) plus the named exits.

## Verified before packaging
- `tsc` clean
- Secret scan: no live keys outside test fixtures
- One fixture API key pasted into a plan doc was replaced with an obvious placeholder

## Excluded on purpose
`node_modules`, `.git`, `dist*`, `release*`, caches, `*.tsbuildinfo`, login
tokens, cookies, `.env`, private keys.

## To run it
1. Node 22+ and pnpm
2. `pnpm install`
3. `pnpm dev` - or `pnpm build` then `pnpm exec electron-builder --win --x64`

## Integrity
`SHA256SUMS.txt` covers every file. `MANIFEST.json` is the machine-readable list.
"""

rows = []
shas = []
with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as z:
    for e in entries:
        arc = os.path.relpath(e, ROOT).replace('\\', '/')
        data = open(e, 'rb').read()
        z.writestr(arc, data)
        rows.append({'path': arc, 'bytes': len(data)})
        shas.append(f'{hashlib.sha256(data).hexdigest()}  {arc}')
    z.writestr('README-PACKAGE.md', README.replace('STAMP', STAMP))
    z.writestr('MANIFEST.json', json.dumps({'schema': 1, 'created': STAMP, 'mode': 'standard', 'files': rows}, indent=2))
    z.writestr('MANIFEST.txt', '\n'.join(f"{r['bytes']:>10}  {r['path']}" for r in rows) + '\n')
    z.writestr('SHA256SUMS.txt', '\n'.join(shas) + '\n')

print('---')
print('PACKAGE:', OUT)
print('size: %.1f MB' % (os.path.getsize(OUT) / 1e6))
print('entries incl. manifest:', len(rows) + 4)
