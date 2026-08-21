const sharp = require('./server/node_modules/sharp');
const B = 'http://localhost:4000';
let ok = 0, ko = 0;
const check = (label, cond) => { console.log(`${cond ? 'PASS' : 'FAIL'} - ${label}`); cond ? ok++ : ko++; };

(async () => {
  const m = await (await fetch(B + '/manifest.webmanifest')).json();
  check('manifest name = XMATOR RH — Gestion des congés', m.name === 'XMATOR RH — Gestion des congés');
  check('manifest short_name = XMATOR RH', m.short_name === 'XMATOR RH');
  check('manifest : 3 icônes déclarées', m.icons.length === 3);
  check('manifest display standalone', m.display === 'standalone');

  const dims = { 'icon-192.png': [192, 192], 'icon-512.png': [512, 512], 'maskable-512.png': [512, 512], 'apple-touch-icon.png': [180, 180] };
  for (const [f, [w, h]] of Object.entries(dims)) {
    const r = await fetch(B + '/icons/' + f);
    const meta = await sharp(`client/dist/icons/${f}`).metadata();
    check(`/icons/${f} -> ${r.status} ${r.headers.get('content-type')} ${meta.width}x${meta.height}`,
      r.status === 200 && r.headers.get('content-type') === 'image/png' && meta.width === w && meta.height === h);
  }

  const sw = await (await fetch(B + '/sw.js')).text();
  check('sw.js cache = xmator-rh-v2', sw.includes("const CACHE = 'xmator-rh-v2'"));
  check('sw.js précache icon-192', sw.includes('"icons/icon-192.png"'));
  check('sw.js précache maskable-512', sw.includes('"icons/maskable-512.png"'));
  check('sw.js précache manifest', sw.includes('"manifest.webmanifest"'));

  const html = await (await fetch(B + '/')).text();
  check('index.html : lien manifest', html.includes('/manifest.webmanifest'));
  check('index.html : apple-touch-icon', html.includes('/icons/apple-touch-icon.png'));
  check('index.html : titre iOS XMATOR RH', html.includes('content="XMATOR RH"'));
  check('index.html : theme-color', html.includes('#1c34cc'));

  const p = await fetch(B + '/photos/292.webp');
  check('régression photo employé 200 image/webp', p.status === 200 && p.headers.get('content-type') === 'image/webp');

  console.log(`\n${ok} PASS / ${ko} FAIL`);
  process.exit(ko ? 1 : 0);
})().catch((e) => { console.error('ERREUR:', e.message); process.exit(1); });
