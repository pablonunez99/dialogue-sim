import sharp from 'sharp';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EXPRESSIONS, LOCATIONS, NPCS } from '../public/data/world.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const portraitDir = path.join(rootDir, 'public', 'assets', 'portraits');
const greenDir = path.join(portraitDir, 'green-source');
const locationDir = path.join(rootDir, 'public', 'assets', 'locations');

await mkdir(portraitDir, { recursive: true });
await mkdir(greenDir, { recursive: true });
await mkdir(locationDir, { recursive: true });

for (const location of LOCATIONS) {
  await writeSvgAsFile(path.join(rootDir, 'public', location.asset), makeLocationSvg(location));
}

for (const npc of NPCS) {
  for (const expression of EXPRESSIONS) {
    const transparentSvg = makePortraitSvg(npc, expression, false);
    const greenSvg = makePortraitSvg(npc, expression, true);
    await sharp(Buffer.from(transparentSvg)).png().toFile(path.join(portraitDir, `${npc.id}-${expression}.png`));
    await sharp(Buffer.from(greenSvg)).png().toFile(path.join(greenDir, `${npc.id}-${expression}-green.png`));
  }
}

console.log(`Generados ${NPCS.length * EXPRESSIONS.length} retratos transparentes en ${portraitDir}`);
console.log(`Generadas ${NPCS.length * EXPRESSIONS.length} fuentes con fondo verde en ${greenDir}`);

async function writeSvgAsFile(filePath, svg) {
  await writeFile(filePath, svg, 'utf8');
}

function makePortraitSvg(npc, expression, greenBackground) {
  const face = expressionFace(expression);
  const hat = npc.outfit === 'smith' ? makeSmithApron(npc) : npc.outfit === 'healer' ? makeHealerCloak(npc) : makeCivilClothes(npc);
  const bg = greenBackground ? '<rect width="900" height="1200" fill="#00ff00"/>' : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1200" viewBox="0 0 900 1200">
  ${bg}
  <g transform="translate(0 20)">
    <ellipse cx="455" cy="1120" rx="250" ry="45" fill="#000" opacity="${greenBackground ? '0' : '0.22'}"/>
    <path d="M256 1035 C278 835 322 715 450 715 C579 715 628 842 650 1035 Z" fill="${npc.color}"/>
    <path d="M285 1035 C318 886 356 782 450 782 C546 782 584 887 616 1035 Z" fill="#2b241f" opacity="0.22"/>
    ${hat}
    <path d="M295 500 C285 340 350 225 452 225 C557 225 620 342 607 501 C596 634 536 735 450 735 C365 735 307 632 295 500 Z" fill="${npc.skin}"/>
    <path d="M294 515 C250 504 239 438 274 416 C302 399 318 429 320 468 C322 503 315 525 294 515 Z" fill="${shade(npc.skin, -10)}"/>
    <path d="M606 515 C650 504 661 438 626 416 C598 399 582 429 580 468 C578 503 585 525 606 515 Z" fill="${shade(npc.skin, -10)}"/>
    <path d="M286 360 C308 256 365 185 452 185 C538 185 595 253 617 360 C556 315 510 300 450 306 C389 300 345 315 286 360 Z" fill="${npc.hair}"/>
    <path d="M302 390 C343 315 382 288 452 288 C522 288 562 315 599 390 C577 276 516 215 450 218 C382 215 324 278 302 390 Z" fill="${shade(npc.hair, 12)}" opacity="0.78"/>
    <path d="M336 468 Q375 ${face.browY} 410 468" stroke="#2b1b17" stroke-width="13" stroke-linecap="round" fill="none"/>
    <path d="M490 468 Q526 ${face.browYRight} 565 468" stroke="#2b1b17" stroke-width="13" stroke-linecap="round" fill="none"/>
    ${face.eyes}
    <path d="M448 500 C435 548 431 574 462 582" stroke="${shade(npc.skin, -22)}" stroke-width="9" stroke-linecap="round" fill="none" opacity="0.55"/>
    ${face.mouth}
    <path d="M357 636 C405 675 501 675 548 636" stroke="${shade(npc.skin, -18)}" stroke-width="8" stroke-linecap="round" fill="none" opacity="0.34"/>
    <path d="M330 746 C384 805 515 805 570 746" fill="#14120f" opacity="0.18"/>
  </g>
</svg>`;
}

function expressionFace(expression) {
  const eyes = {
    neutral: '<ellipse cx="375" cy="500" rx="18" ry="13" fill="#1b1512"/><ellipse cx="526" cy="500" rx="18" ry="13" fill="#1b1512"/>',
    happy: '<path d="M355 500 Q375 520 397 500" stroke="#1b1512" stroke-width="11" stroke-linecap="round" fill="none"/><path d="M506 500 Q526 520 548 500" stroke="#1b1512" stroke-width="11" stroke-linecap="round" fill="none"/>',
    angry: '<ellipse cx="375" cy="504" rx="17" ry="11" fill="#1b1512"/><ellipse cx="526" cy="504" rx="17" ry="11" fill="#1b1512"/>',
    sad: '<ellipse cx="375" cy="506" rx="16" ry="12" fill="#1b1512"/><ellipse cx="526" cy="506" rx="16" ry="12" fill="#1b1512"/>',
    surprised: '<ellipse cx="375" cy="500" rx="22" ry="24" fill="#f8ead7"/><ellipse cx="526" cy="500" rx="22" ry="24" fill="#f8ead7"/><circle cx="375" cy="501" r="11" fill="#1b1512"/><circle cx="526" cy="501" r="11" fill="#1b1512"/>',
    thinking: '<ellipse cx="375" cy="501" rx="15" ry="11" fill="#1b1512"/><path d="M506 500 Q526 512 548 500" stroke="#1b1512" stroke-width="10" stroke-linecap="round" fill="none"/>'
  };

  const mouth = {
    neutral: '<path d="M402 622 Q451 640 500 622" stroke="#5a2a25" stroke-width="11" stroke-linecap="round" fill="none"/>',
    happy: '<path d="M390 608 Q451 674 512 608" stroke="#5a2a25" stroke-width="13" stroke-linecap="round" fill="none"/>',
    angry: '<path d="M396 642 Q451 612 506 642" stroke="#5a2a25" stroke-width="13" stroke-linecap="round" fill="none"/>',
    sad: '<path d="M400 650 Q451 618 502 650" stroke="#5a2a25" stroke-width="12" stroke-linecap="round" fill="none"/>',
    surprised: '<ellipse cx="452" cy="628" rx="31" ry="39" fill="#4a211f"/>',
    thinking: '<path d="M401 628 Q451 650 501 628" stroke="#5a2a25" stroke-width="10" stroke-linecap="round" fill="none"/><circle cx="528" cy="614" r="5" fill="#5a2a25"/>'
  };

  return {
    browY: expression === 'angry' ? 493 : expression === 'sad' ? 444 : expression === 'surprised' ? 430 : 456,
    browYRight: expression === 'angry' ? 443 : expression === 'sad' ? 493 : expression === 'surprised' ? 430 : 456,
    eyes: eyes[expression],
    mouth: mouth[expression]
  };
}

function makeCivilClothes(npc) {
  return `<path d="M328 780 L450 930 L572 780 L620 1035 L280 1035 Z" fill="${shade(npc.color, 15)}"/>
  <path d="M418 760 L450 842 L482 760" fill="#ead6b1"/>
  <circle cx="450" cy="872" r="18" fill="#d9a441"/>`;
}

function makeSmithApron(npc) {
  return `<path d="M330 780 L570 780 L610 1035 L290 1035 Z" fill="${shade(npc.color, 8)}"/>
  <path d="M360 805 L540 805 L555 1035 L345 1035 Z" fill="#4b3327"/>
  <path d="M384 870 H518" stroke="#1d1612" stroke-width="18" stroke-linecap="round"/>`;
}

function makeHealerCloak(npc) {
  return `<path d="M294 1035 C318 842 356 752 450 730 C544 752 584 842 606 1035 Z" fill="${shade(npc.color, 12)}"/>
  <path d="M360 793 Q450 870 540 793 L506 1035 H394 Z" fill="#d7c7a0"/>
  <path d="M450 820 L450 930 M410 875 H490" stroke="#6d8f68" stroke-width="12" stroke-linecap="round"/>`;
}

function makeLocationSvg(location) {
  const variants = {
    plaza: {
      sky: '#7ea2a8',
      ground: '#74634d',
      back: '<rect x="60" y="310" width="240" height="210" fill="#6f4e3a"/><polygon points="35,310 180,200 325,310" fill="#493421"/><rect x="610" y="285" width="250" height="230" fill="#75563e"/><polygon points="585,285 735,180 885,285" fill="#3f2b1d"/><ellipse cx="455" cy="535" rx="82" ry="36" fill="#3c3b35"/><rect x="392" y="420" width="126" height="112" fill="#6f6b5b"/>'
    },
    forja: {
      sky: '#4d5960',
      ground: '#3f3932',
      back: '<rect x="120" y="240" width="670" height="360" fill="#3b312a"/><polygon points="100,240 450,92 812,240" fill="#1f1b18"/><rect x="548" y="330" width="130" height="130" fill="#201815"/><circle cx="612" cy="420" r="58" fill="#e06b31"/><rect x="180" y="455" width="210" height="65" fill="#141312"/><path d="M230 450 H342 L318 410 H252 Z" fill="#5f6670"/>'
    },
    bosque: {
      sky: '#7c9990',
      ground: '#3f5d43',
      back: '<rect x="80" y="180" width="64" height="450" fill="#4b3326"/><circle cx="110" cy="165" r="130" fill="#365d42"/><rect x="710" y="150" width="72" height="480" fill="#4b3326"/><circle cx="745" cy="130" r="145" fill="#2f523b"/><path d="M360 480 C420 398 502 398 560 480 V618 H360 Z" fill="#687063"/><path d="M402 620 C424 545 478 545 500 620" fill="#2d342e"/>'
    },
    taberna: {
      sky: '#3d2f28',
      ground: '#5f4636',
      back: '<rect x="0" y="0" width="900" height="620" fill="#4b3529"/><rect x="92" y="120" width="220" height="250" fill="#2b211b"/><rect x="595" y="155" width="205" height="235" fill="#2b211b"/><rect x="350" y="335" width="190" height="140" fill="#231914"/><circle cx="445" cy="405" r="64" fill="#d27c36"/><rect x="150" y="500" width="600" height="70" fill="#6d4a2d"/>'
    }
  };
  const variant = variants[location.id] ?? variants.plaza;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900">
  <defs>
    <linearGradient id="sky" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0" stop-color="${variant.sky}"/>
      <stop offset="1" stop-color="#1d221f"/>
    </linearGradient>
  </defs>
  <rect width="1600" height="900" fill="url(#sky)"/>
  <g transform="scale(1.78 1.45) translate(0 0)">${variant.back}</g>
  <path d="M0 650 C270 600 410 700 650 640 C930 570 1150 680 1600 620 V900 H0 Z" fill="${variant.ground}"/>
  <path d="M0 730 C380 690 555 800 880 715 C1140 648 1300 750 1600 710 V900 H0 Z" fill="#2f2b24" opacity="0.55"/>
  <g opacity="0.28">
    <circle cx="1280" cy="180" r="90" fill="#f0d899"/>
    <rect x="0" y="0" width="1600" height="900" fill="#000" opacity="0.12"/>
  </g>
</svg>`;
}

function shade(hex, amount) {
  const clean = hex.replace('#', '');
  const number = Number.parseInt(clean, 16);
  const r = clamp((number >> 16) + amount);
  const g = clamp(((number >> 8) & 255) + amount);
  const b = clamp((number & 255) + amount);
  return `#${[r, g, b].map((value) => value.toString(16).padStart(2, '0')).join('')}`;
}

function clamp(value) {
  return Math.max(0, Math.min(255, value));
}
