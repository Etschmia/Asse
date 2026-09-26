/* Aces über Europa – Browser-Hommage (eigener Code, keine Original-Assets)
 * Logik in 320×200 (VW/VH), gerendert über SCALE in bis zu 1280×800.
 * v3: echte 3D-Kamera, flach schattierte Polygonmodelle, Dunst, Wolken,
 *     Zielanzeige mit Vorhaltepunkt, Außenansicht. Tastatursteuerung, Bf 109 G-6 Standard.
 */
(() => {
"use strict";
const VW = 320, VH = 200;
const FOC = 170;      // Brennweite in Logik-Pixeln (~87° Sichtfeld)
const NEAR = 0.6;     // Nahebene (m)
const MONO = '"Courier New", monospace';
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const screenEl = document.getElementById('screen');
const statusEl = document.getElementById('status');
const helpEl = document.getElementById('help');

const VGA_MODES = [
  {name:'320×200', scale:1, detail:0},
  {name:'640×400', scale:2, detail:1},
  {name:'960×600', scale:3, detail:2},
  {name:'1280×800 HD', scale:4, detail:2},
];
let SCALE = 3; // Backing-Store-Skalierung, Logik bleibt 320×200 (VW/VH)
let SEAM = 0.3;
let vgaIdx = 2;
function setVgaMode(i){
  vgaIdx = ((i % VGA_MODES.length) + VGA_MODES.length) % VGA_MODES.length;
  const m = VGA_MODES[vgaIdx];
  SCALE = m.scale;
  SEAM = 0.9 / SCALE;
  canvas.width = VW * SCALE;
  canvas.height = VH * SCALE;
  ctx.imageSmoothingEnabled = m.detail > 0; // klassisch: pixelige Sprites
  ctx.lineJoin = 'round';
  screenEl.classList.toggle('scan', m.detail === 0);
  document.getElementById('btnVga').textContent = 'VGA: ' + m.name + ' (V)';
  G.vgaHi = vgaIdx > 0;
  G.detail = m.detail;
}
function autoVga(){
  const w = (canvas.clientWidth || 640) * (window.devicePixelRatio || 1);
  let best = 2;
  for(let i = 0; i < VGA_MODES.length; i++) if(VW * VGA_MODES[i].scale <= w * 1.15) best = Math.max(best, i);
  return best;
}
function cycleVga(){
  setVgaMode(vgaIdx + 1);
  const m = VGA_MODES[vgaIdx];
  setMsg('Auflösung: ' + m.name + (m.detail === 0 ? ' – klassisch (256 Farben)' : ''));
}

// ---------- Zustand ----------
const G = {
  mode: 'title', // title | fly | dead
  paused: false,
  showMap: false,
  cockpit: true,
  extView: false, // Außenansicht (K)
  sound: true,
  vgaHi: false,
  detail: 2,    // 0 = klassisch, 1 = schärfer, 2 = HD
  hitMark: 0,   // Treffer-Bestätigung am Visier (Sekunden)
  hitKill: 0,   // Abschuss-Bestätigung (Sekunden)
  time: 0,
  deadT: 0,
  kills: 0,
  score: 0,
  wave: 0,
  waveClear: false,
  nextWaveT: 0,
  target: null,
  flakWarned: false,
  smokeT: 0,
  msg: '',
  msgT: 0,
  flash: 0,   // roter Treffer-Blitz
  shake: 0,
  started: false,
};
const AMMO_MG = 600, AMMO_KAN = 200; // 2× MG 131 à 300 Schuss, MG 151/20 mit 200 Schuss
const WEAPON_NAME = ['MG 131','MG 151/20','MG + Kanone'];
const P = {
  x:0, y:1200, z:-2500,
  B: basis(0,0,0),  // Lage als Achsen: vorn f, rechts r, oben u
  V: [0,0,125],     // Geschwindigkeit in Weltkoordinaten (m/s)
  wp:0, wq:0, wr:0, // Drehraten Rollen / Nicken / Gieren (rad/s)
  heading: 0,   // rad, 0 = Nord (+z), Uhrzeigersinn – aus B abgeleitet
  pitch: 0,     // rad
  roll: 0,      // rad, + = rechte Fläche unten
  speed: 450,   // km/h wahre Fahrt
  ias: 450,     // km/h angezeigte Fahrt (Fahrtmesser)
  alpha: 0, beta: 0, nz: 1, gSm: 1,
  trim: 0.05,   // Höhentrimmung (Anstellwinkel bei Knüppel mittig, rad)
  stall: false, dropDir: 1, onGround: false,
  sx: 0, sy: 0, sr: 0, // Knüppel/Pedale, Tastaturanteil (-1..1)
  throttle: 0.75,
  ammoMG: AMMO_MG, ammoKan: AMMO_KAN, weapon: 0,
  mgCd: 0, kanCd: 0,
  hp: 100,
  flaps: false,
  gear: false,
  vy: 0,
  dead: false,
};
const MOUSE = {x:0, y:0, l:false, r:false, locked:false, sens:0.0035};

let enemies=[], bullets=[], ebullets=[], parts=[], clouds=[], patches=[], statics=[], flak=[];
let keys={};

// ---------- Mathe-Helfer ----------
function rnd(a,b){ return a + Math.random()*(b-a); }
function clamp(v,a,b){ return v<a?a:(v>b?b:v); }
function dot(a,b){ return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]; }
function norm(a){ const l=Math.hypot(a[0],a[1],a[2])||1; return [a[0]/l,a[1]/l,a[2]/l]; }
function wrap(a){ while(a>Math.PI)a-=Math.PI*2; while(a<-Math.PI)a+=Math.PI*2; return a; }
function hash2(i,j){
  let h = (Math.imul(i,374761393) + Math.imul(j,668265263)) | 0;
  h = Math.imul(h ^ (h>>>13), 1274126177);
  h ^= h>>>16;
  return (h>>>0)/4294967296;
}
// Orientierung: vorn f, rechts r, oben u (rechtshändig, x=Ost, y=oben, z=Nord)
function basis(h,p,r){
  const sh=Math.sin(h),ch=Math.cos(h),sp=Math.sin(p),cp=Math.cos(p),sr=Math.sin(r),cr=Math.cos(r);
  const f=[sh*cp, sp, ch*cp];
  const r0=[ch,0,-sh];
  const u0=[-sh*sp, cp, -ch*sp];
  return {
    f,
    r:[r0[0]*cr-u0[0]*sr, r0[1]*cr-u0[1]*sr, r0[2]*cr-u0[2]*sr],
    u:[u0[0]*cr+r0[0]*sr, u0[1]*cr+r0[1]*sr, u0[2]*cr+r0[2]*sr],
  };
}

// ---------- Farben / Licht / Dunst ----------
function hex(c){ return [parseInt(c.slice(1,3),16),parseInt(c.slice(3,5),16),parseInt(c.slice(5,7),16)]; }
function mix(a,b,t){ return [a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, a[2]+(b[2]-a[2])*t]; }
function css(a){
  let r=a[0],g=a[1],b=a[2];
  if(G.detail===0){ r=Math.round(r/36)*36; g=Math.round(g/36)*36; b=Math.round(b/36)*36; } // VGA-Palette andeuten
  return 'rgb('+clamp(r|0,0,255)+','+clamp(g|0,0,255)+','+clamp(b|0,0,255)+')';
}
const HAZE = hex('#c8d5df');
const LANDFAR = hex('#5f7d4a');
const SEA = hex('#2f5c7c');
const SAND = hex('#cbbd8c');
const SUN = norm([0.45,0.5,0.74]);
function fogK(d){ return 1-Math.exp(-d/15000); }
const FIELD_COLS = ['#5d8a3f','#4f7d38','#6c9446','#8fa052','#b3a45c','#a08a55','#7a6a48','#55803d','#678c3c','#739a4a','#9c9450'].map(hex);
const HEDGE = hex('#2e4a24');

// ---------- Welt ----------
function coastZ(x){ return 4800 + 900*Math.sin(x/2600) + 350*Math.sin(x/970+1.3); }
function englandZ(x){ return 26000 + 1500*Math.sin(x/5000); }

function addPatch(x,z,pts,col,vis){ patches.push({x,z,pts,c:hex(col),vis:vis||9000}); }
function rectPts(x0,x1,z0,z1){ return [[x0,z0],[x1,z0],[x1,z1],[x0,z1]]; }
function blobPts(x,z,r,n){ const o=[]; for(let k=0;k<n;k++){ const a=k/n*Math.PI*2, rr=r*rnd(0.7,1.1); o.push([x+Math.sin(a)*rr, z+Math.cos(a)*rr]); } return o; }

function buildWorld(){
  clouds=[];
  for(let i=0;i<26;i++){
    const s=rnd(90,210), puffs=[];
    const n=5+(Math.random()*5|0);
    for(let k=0;k<n;k++) puffs.push({dx:rnd(-1,1)*s, dy:rnd(-0.05,0.35)*s, dz:rnd(-0.6,0.6)*s, r:rnd(0.45,0.8)*s});
    clouds.push({x:rnd(-9000,9000), y:rnd(1300,2300), z:rnd(-9000,9000), puffs});
  }
  patches=[]; statics=[];
  // Feldflugplatz (eigener Start, bei 0,0; Bahn in Nord-Süd-Richtung)
  addPatch(0,0,rectPts(-200,200,-650,650),'#79a45a',12000);
  addPatch(0,0,rectPts(-30,30,-520,520),'#8fb36c',12000);
  addPatch(0,-560,rectPts(-30,30,-566,-554),'#eeeeea',5000);   // Lande-T
  addPatch(0,-580,rectPts(-5,5,-600,-566),'#eeeeea',5000);
  for(const [cx,cz] of [[-30,-520],[30,-520],[-30,520],[30,520]]) addPatch(cx,cz,rectPts(cx-6,cx+6,cz-6,cz+6),'#eeeeea',4000);
  statics.push({kind:'m', m:MODELS.hangar, x:120, z:-200, B:basis(Math.PI/2,0,0), vis:7000});
  statics.push({kind:'m', m:MODELS.hangar, x:120, z:-150, B:basis(Math.PI/2,0,0), vis:7000});
  statics.push({kind:'m', m:MODELS.tower,  x:110, z:40,   B:basis(0,0,0), vis:6000});
  // Dörfer und Wälder – nur an Land
  let placed=0;
  for(let tries=0; tries<200 && placed<42; tries++){
    const x=rnd(-9000,9000), z=rnd(-9000,9000);
    if(z>coastZ(x)-450) continue;
    if(Math.abs(x)<600 && Math.abs(z)<1000) continue;
    placed++;
    if(Math.random()<0.42){
      const n=4+(Math.random()*6|0);
      for(let k=0;k<n;k++){
        const m=[MODELS.house1,MODELS.house2,MODELS.house3,MODELS.barn][Math.random()*4|0];
        statics.push({kind:'m', m, x:x+rnd(-150,150), z:z+rnd(-150,150), B:basis(rnd(0,Math.PI),0,0), vis:4500});
      }
      if(Math.random()<0.6) statics.push({kind:'m', m:MODELS.church, x, z, B:basis(rnd(0,Math.PI),0,0), vis:6000});
      addPatch(x,z,blobPts(x,z,190,9),'#6f7f4c',8000);
    } else {
      const r=rnd(220,440);
      addPatch(x,z,blobPts(x,z,r,11),'#2c4a26',11000);
      for(let k=0;k<24;k++){
        const a=rnd(0,Math.PI*2), d=Math.sqrt(Math.random())*r*0.8;
        statics.push({kind:'tree', x:x+Math.sin(a)*d, z:z+Math.cos(a)*d, h:rnd(12,20), vis:2600});
      }
    }
  }
  // Flak-Stellungen an der Küste
  flak=[];
  for(let i=0;i<4;i++){
    const x=rnd(1000,5000)*(i%2?-1:1);
    const z=rnd(1000,coastZ(x)-500);
    flak.push({x, z, cd:rnd(2,6)});
    addPatch(x,z,blobPts(x,z,16,8),'#6d6048',5000);
  }
}

function mkEnemy(type, x, y, z){
  const hp0 = type==='b17'?120:(type==='mustang'?45:35);
  return {
    type, x, y, z,
    heading: rnd(0,Math.PI*2), pitch:0, roll:0,
    vx:0, vy:0, vz:0,
    speed: type==='b17'?300:rnd(330,430),
    hp: hp0, maxHp: hp0,
    alive:true, dying:false, fallT:0,
    fireCd: rnd(1,3), wob: rnd(0,9), hitT:0, smokeT:0,
    mode:'angriff', modeT:0, breakDir:0, breakP:0,
    alt0: y,
  };
}

function spawnWave(n){
  G.wave = n;
  enemies = enemies.filter(e=>e.dying); // abstürzende Maschinen weiter zeigen
  const count = n===1 ? 3 : (n===2 ? 5 : 6);
  for(let i=0;i<count;i++){
    let type='spit';
    if(n>=2 && i===0) type='b17';
    else if(n>=2 && i%3===0) type='mustang';
    else if(n>=3 && i%2===0) type='mustang';
    const a = rnd(0,Math.PI*2), d = rnd(1500,3500);
    const y = type==='b17' ? rnd(1800,2500) : rnd(800,2200);
    const e = mkEnemy(type, P.x+Math.sin(a)*d, y, P.z+Math.cos(a)*d);
    if(type==='b17') e.heading=Math.atan2(-e.x,-e.z);
    enemies.push(e);
  }
  G.target = null;
  setMsg('Welle '+n+': '+(n===1?'3× Spitfire im Anflug!':(n===2?'B-17 + Jagdschutz!':'Abfangjäger überall!')));
  status('Welle '+n+' – Gegner: '+enemies.filter(e=>e.alive).length+'  (T = Ziel wechseln)');
}

function resetMission(){
  P.x=0; P.y=1200; P.z=-2500; P.B=basis(0,0,0); P.V=[0,0,450/3.6];
  P.wp=P.wq=P.wr=0; P.sx=P.sy=P.sr=0; MOUSE.x=MOUSE.y=0;
  P.throttle=0.75; P.ammoMG=AMMO_MG; P.ammoKan=AMMO_KAN; P.hp=100;
  P.flaps=false; P.gear=false; P.mgCd=0; P.kanCd=0; P.dead=false; P.onGround=false; P.stall=false; P.gSm=1;
  P.trim=trimFor(450/3.6,1200); syncEuler();
  bullets=[]; ebullets=[]; parts=[]; enemies=[];
  G.kills=0; G.score=0; G.flash=0; G.shake=0; G.hitMark=0; G.hitKill=0; G.mode='fly'; G.paused=false; G.started=true;
  G.waveClear=false; G.nextWaveT=0; G.target=null; G.flakWarned=false; G.deadT=0;
  buildWorld();
  spawnWave(1);
}

// ---------- Meldungen ----------
function setMsg(t, dur=3.5){ G.msg=t; G.msgT=dur; }
function status(t){ statusEl.textContent=t; }

// ---------- Audio (WebAudio, simpel) ----------
let AC=null, engOsc=null, engGain=null, engFilter=null;
function audioInit(){
  if(AC) return;
  try{
    AC = new (window.AudioContext||window.webkitAudioContext)();
    engOsc = AC.createOscillator(); engOsc.type='sawtooth'; engOsc.frequency.value=70;
    engFilter = AC.createBiquadFilter(); engFilter.type='lowpass'; engFilter.frequency.value=400;
    engGain = AC.createGain(); engGain.gain.value=0.0;
    engOsc.connect(engFilter); engFilter.connect(engGain); engGain.connect(AC.destination);
    engOsc.start();
  }catch(e){ AC=null; }
}
function engineSound(){
  if(!AC||!engOsc) return;
  const on = G.sound && G.mode==='fly' && !G.paused;
  engGain.gain.setTargetAtTime(on?0.05:0.0, AC.currentTime, 0.2);
  engOsc.frequency.setTargetAtTime(45 + P.throttle*70 + P.speed*0.05, AC.currentTime, 0.2);
}
function noiseBurst(dur=0.12, vol=0.25, freq=1200){
  if(!AC||!G.sound) return;
  const n = Math.floor(AC.sampleRate*dur);
  const buf = AC.createBuffer(1,n,AC.sampleRate);
  const d = buf.getChannelData(0);
  for(let i=0;i<n;i++) d[i]=(Math.random()*2-1)*(1-i/n);
  const src=AC.createBufferSource(); src.buffer=buf;
  const f=AC.createBiquadFilter(); f.type='bandpass'; f.frequency.value=freq;
  const g=AC.createGain(); g.gain.value=vol;
  src.connect(f); f.connect(g); g.connect(AC.destination); src.start();
}

// ---------- Eingabe ----------
const HELP_TOGGLE = ()=>{ helpEl.classList.toggle('hidden'); };
function toggleView(){
  G.extView=!G.extView;
  document.getElementById('btnView').textContent='Ansicht: '+(G.extView?'außen (K)':'Cockpit (K)');
  if(G.mode==='fly') setMsg(G.extView?'Außenansicht':'Cockpitsicht',1.5);
}
function toggleCockpit(){ G.cockpit=!G.cockpit; document.getElementById('btnCockpit').textContent='Cockpit: '+(G.cockpit?'an (C)':'aus (C)'); }
function toggleSound(){ G.sound=!G.sound; document.getElementById('btnSound').textContent='Sound: '+(G.sound?'an (L)':'aus (L)'); }
window.addEventListener('keydown', e=>{
  const k = e.key;
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(k)) e.preventDefault();
  if(k==='F1'){ e.preventDefault(); HELP_TOGGLE(); return; }
  if(k==='Escape'&&performance.now()<escIgnoreUntil) return; // Esc hat nur die Maus freigegeben
  keys[k.toLowerCase()]=true; keys[k]=true;
  audioInit(); if(AC&&AC.state==='suspended') AC.resume();
  if(e.repeat) return;
  if(k==='Enter'){ if(G.mode!=='fly') resetMission(); else if(G.paused) G.paused=false; }
  else if(k==='h'||k==='H') HELP_TOGGLE();
  else if(k==='p'||k==='P'||k==='Escape') { if(G.mode==='fly') G.paused=!G.paused; status(G.paused?'PAUSE – Weiter mit P / Enter':'Weiter gehts!'); }
  else if(k==='n'||k==='N') resetMission();
  else if(k==='r'||k==='R') resetMission();
  else if(k==='m'||k==='M') G.showMap=!G.showMap;
  else if(k==='c'||k==='C') toggleCockpit();
  else if(k==='k'||k==='K') toggleView();
  else if(k==='t'||k==='T') cycleTarget();
  else if(k==='v'||k==='V') cycleVga();
  else if(k==='x'||k==='X') cheatRepair();
  else if(k==='b'||k==='B') cheatAmmo();
  else if(k==='l'||k==='L') toggleSound();
  else if(k==='f'||k==='F') { if(G.mode==='fly'){ P.flaps=!P.flaps; setMsg(P.flaps?'Landeklappen AUSGEFAHREN':'Landeklappen EINGEFAHREN'); } }
  else if(k==='g'||k==='G') { if(G.mode==='fly'){ P.gear=!P.gear; setMsg(P.gear?'Fahrwerk AUSGEFAHREN':'Fahrwerk EINGEFAHREN'); } }
  else if(k==='1'||k==='2'||k==='3') selectWeapon(+k-1);
  else if(k==='Home') { MOUSE.x=0; MOUSE.y=0; setMsg('Knüppel mittig',1); }
});
function selectWeapon(i){
  P.weapon=((i%3)+3)%3;
  document.getElementById('btnWeapon').textContent='Waffe: '+WEAPON_NAME[P.weapon]+' (1/2/3)';
  if(G.mode==='fly') setMsg('Waffe: '+WEAPON_NAME[P.weapon],1.5);
}
// Maus: Klick ins Bild fängt den Zeiger, Bewegung = Steuerknüppel, links = Feuer, rechts = Kanone, Rad = Gas
let escIgnoreUntil=0;
canvas.addEventListener('mousedown', e=>{
  audioInit(); if(AC&&AC.state==='suspended') AC.resume();
  if(G.mode==='title') resetMission();
  if(!MOUSE.locked){
    if(canvas.requestPointerLock) canvas.requestPointerLock();
    if(G.paused) G.paused=false;
    e.preventDefault(); return;
  }
  if(e.button===0) MOUSE.l=true;
  else if(e.button===2) MOUSE.r=true;
  else if(e.button===1){ MOUSE.x=0; MOUSE.y=0; e.preventDefault(); }
});
window.addEventListener('mouseup', e=>{ if(e.button===0) MOUSE.l=false; else if(e.button===2) MOUSE.r=false; });
canvas.addEventListener('contextmenu', e=>e.preventDefault());
document.addEventListener('mousemove', e=>{
  if(!MOUSE.locked||G.mode!=='fly'||G.paused) return;
  if(Math.abs(e.movementX)>200||Math.abs(e.movementY)>200) return; // Ausreißer mancher Browser beim Pointer-Lock
  MOUSE.x=clamp(MOUSE.x+e.movementX*MOUSE.sens,-1,1);
  MOUSE.y=clamp(MOUSE.y+e.movementY*MOUSE.sens,-1,1);  // Maus zu sich = ziehen
});
canvas.addEventListener('wheel', e=>{
  if(G.mode!=='fly') return;
  e.preventDefault();
  P.throttle=clamp(P.throttle-Math.sign(e.deltaY)*0.05,0,1);
},{passive:false});
document.addEventListener('pointerlockchange', ()=>{
  MOUSE.locked=document.pointerLockElement===canvas;
  if(!MOUSE.locked){
    MOUSE.l=MOUSE.r=false;
    if(G.mode==='fly'&&!G.paused){ G.paused=true; escIgnoreUntil=performance.now()+300; status('PAUSE – Maus freigegeben. Klick ins Bild = weiter'); }
  } else status('Maussteuerung aktiv: Bewegung = Knüppel, links = Feuer, rechts = Kanone, Rad = Gas, Mitteltaste = Knüppel mittig. Esc gibt die Maus frei.');
});
window.addEventListener('keyup', e=>{ keys[e.key.toLowerCase()]=false; keys[e.key]=false; });
window.addEventListener('blur', ()=>{ keys={}; MOUSE.l=MOUSE.r=false; });

// Buttons
document.getElementById('btnStart').onclick=()=>{ audioInit(); resetMission(); };
document.getElementById('btnHelp').onclick=HELP_TOGGLE;
document.getElementById('btnPause').onclick=()=>{ if(G.mode==='fly'){G.paused=!G.paused;} };
document.getElementById('btnNew').onclick=()=>resetMission();
document.getElementById('btnVga').onclick=()=>cycleVga();
document.getElementById('btnView').onclick=()=>toggleView();
document.getElementById('btnRepair').onclick=()=>{ audioInit(); cheatRepair(); };
document.getElementById('btnAmmo').onclick=()=>{ audioInit(); cheatAmmo(); };
document.getElementById('btnSound').onclick=()=>toggleSound();
document.getElementById('btnCockpit').onclick=()=>toggleCockpit();
document.getElementById('btnWeapon').onclick=()=>selectWeapon(P.weapon+1);

// ---------- Physik ----------
// Flugmodell Bf 109 G-6: vereinfacht, aber mit echten Kräften. Wirkung der Ruder hängt vom
// Staudruck ab (Fahrt + Luftdichte/Höhe), Auftrieb vom Anstellwinkel, oberhalb davon Abriss.
const FM = {
  m:3100, S:16.1, c:1.65, b:9.9, g:9.81,
  CLa:4.8, aS:0.27, aSflap:0.25, aNeg:-0.2,     // Auftriebsanstieg, Abrisswinkel (rad)
  CD0:0.024, k:0.075,                             // Nullwiderstand, induzierter Widerstand
  Pmax:1.15e6, hCrit:5700, eta:0.82, Tstatic:14000, // DB 605: Leistung, Volldruckhöhe, Luftschraube
  Iyy:4800, Cma:-0.9, Cmq:-20, deMax:0.24,       // Nicken: Stabilität, Dämpfung, Höhenruder (voll = etwa Rüttelgrenze)
  Izz:7500, Cnb:0.09, Cndr:0.025, Cnr:-0.5, CYb:-0.8, // Gieren: Windfahne, Seitenruder, Dämpfung
  nMax:7.5, nMin:-3.5,                            // mit Muskelkraft erreichbares Lastvielfaches
};
function rho(h){ return 1.225*Math.exp(-Math.max(0,h)/8500); }
function trimFor(v,h){ return FM.m*FM.g/(0.5*rho(h)*v*v*FM.S*FM.CLa)-0.02; }
function liftCoef(a,flaps){
  const aS=flaps?FM.aSflap:FM.aS, add=flaps?0.35:0;
  if(a>aS) return FM.CLa*(aS+0.02)*Math.max(0.5,1-(a-aS)*2)+add;
  if(a<FM.aNeg) return FM.CLa*(FM.aNeg+0.02)*Math.max(0.5,1-(FM.aNeg-a)*2);
  return FM.CLa*(a+0.02)+add;
}
function syncEuler(){
  const B=P.B;
  P.pitch=Math.asin(clamp(B.f[1],-1,1));
  P.heading=Math.atan2(B.f[0],B.f[2]);
  P.roll=Math.atan2(-B.r[1],B.u[1]);
}
function cross(a,b){ return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]; }
function integrateAttitude(dt){
  const B=P.B, f=B.f, r=B.r, u=B.u;
  // Rollen + = rechte Fläche runter, Nicken + = Nase hoch, Gieren + = Nase nach rechts
  const w=[-P.wp*f[0]-P.wq*r[0]+P.wr*u[0], -P.wp*f[1]-P.wq*r[1]+P.wr*u[1], -P.wp*f[2]-P.wq*r[2]+P.wr*u[2]];
  const df=cross(w,f), du=cross(w,u);
  const nf=norm([f[0]+df[0]*dt, f[1]+df[1]*dt, f[2]+df[2]*dt]);
  let nu=[u[0]+du[0]*dt, u[1]+du[1]*dt, u[2]+du[2]*dt];
  const d=dot(nu,nf); nu=norm([nu[0]-nf[0]*d, nu[1]-nf[1]*d, nu[2]-nf[2]*d]);
  P.B={f:nf, r:cross(nu,nf), u:nu};
}
// Ein Integrationsschritt; da/de/dr = Quer-/Höhen-/Seitenruder (-1..1). Gibt false bei Absturz zurück.
function flightStep(dt,da,de,dr){
  const B=P.B, V=P.V;
  const sp=Math.hypot(V[0],V[1],V[2]), spS=Math.max(sp,1);
  const rh=rho(P.y), sig=rh/1.225, qbar=0.5*rh*sp*sp, qn=qbar/7500;
  const a=Math.atan2(-dot(V,B.u),dot(V,B.f)), be=Math.asin(clamp(dot(V,B.r)/spS,-1,1));
  const ias=sp*Math.sqrt(sig);
  P.alpha=a; P.beta=be; P.speed=sp*3.6; P.ias=ias*3.6;
  const aS=P.flaps?FM.aSflap:FM.aS;
  const exc=a>aS?a-aS:(a<FM.aNeg?FM.aNeg-a:0);
  const stalled=exc>0;
  if(stalled&&!P.stall) P.dropDir=Math.abs(be)>0.03?Math.sign(be):(Math.random()<0.5?-1:1); // Abkippen
  P.stall=stalled;
  // Kräfte: Auftrieb ⟂ Anströmung, Widerstand, Seitenkraft, Schub, Gewicht
  const CL=liftCoef(clamp(a,-1.2,1.2),P.flaps);
  const CD=FM.CD0+(P.flaps?0.035:0)+(P.gear?0.025:0)+FM.k*CL*CL+exc*1.2+0.4*be*be;
  const Vh=[V[0]/spS,V[1]/spS,V[2]/spS];
  const ud=dot(B.u,Vh), Ld=norm([B.u[0]-Vh[0]*ud, B.u[1]-Vh[1]*ud, B.u[2]-Vh[2]*ud]);
  const L=qbar*FM.S*CL, D=qbar*FM.S*CD, Y=qbar*FM.S*FM.CYb*be;
  const pw=FM.Pmax*P.throttle*(P.y<FM.hCrit?1:rh/rho(FM.hCrit));  // oberhalb Volldruckhöhe weniger Leistung
  const T=Math.min(FM.eta*pw/Math.max(sp,20), FM.Tstatic*P.throttle);
  for(let i=0;i<3;i++) V[i]+=(L*Ld[i]-D*Vh[i]+Y*B.r[i]+T*B.f[i])/FM.m*dt;
  V[1]-=FM.g*dt;
  P.nz=(L*dot(Ld,B.u)-D*dot(Vh,B.u))/(FM.m*FM.g);
  // Nicken: Knüppel verschiebt den Gleichgewichts-Anstellwinkel; bei hoher Fahrt begrenzen die
  // Steuerkräfte den Ausschlag (Lastvielfaches), bei wenig Fahrt wird das Ruder weich.
  const qS=qbar*FM.S*FM.CLa;
  const authP=qS>1?clamp(FM.nMax*FM.m*FM.g/qS/FM.deMax,0.15,1):1;
  const authN=qS>1?clamp(-FM.nMin*FM.m*FM.g/qS/FM.deMax,0.15,1):1;
  const deE=de>0?de*authP:de*authN;
  const Cm=FM.Cma*(clamp(a,-0.6,0.6)-P.trim)-FM.Cma*FM.deMax*deE+FM.Cmq*P.wq*FM.c/(2*spS);
  P.wq=clamp(P.wq+qbar*FM.S*FM.c*Cm/FM.Iyy*dt,-3,3);
  // Rollen: Rollrate wächst mit der Fahrt, wird oberhalb ~380 km/h wieder schwerer (Querruderkräfte)
  const pmax=ias<105?1.9*Math.max(ias,15)/105:1.9*Math.pow(105/ias,0.9);
  const tau=clamp(0.35*60/Math.max(ias,20),0.08,0.8);
  let pd=(da*pmax*(stalled?0.35:1)-P.wp)/tau-6*be*qn;          // V-Stellung: Schieben rollt
  if(stalled) pd+=P.dropDir*exc*15*clamp(qn*3,0.3,1.5);  // Vorflügel: gutmütiges Abkippen
  P.wp=clamp(P.wp+pd*dt,-4,4);
  // Gieren: Windfahnenstabilität, Seitenruder, Dämpfung; im Abriss Trudelneigung
  const Cn=FM.Cnb*be+FM.Cndr*dr+FM.Cnr*P.wr*FM.b/(2*spS);
  let rd=qbar*FM.S*FM.b*Cn/FM.Izz;
  if(stalled) rd+=P.dropDir*exc*6;
  P.wr=clamp(P.wr+rd*dt,-2,2);
  integrateAttitude(dt);
  P.x+=V[0]*dt; P.y+=V[1]*dt; P.z+=V[2]*dt;
  syncEuler();
  // Boden: Landung nur mit Fahrwerk, sanft, langsam, Flächen fast waagerecht – und nicht im Kanal
  if(P.y<=2){
    const water=P.z>coastZ(P.x);
    const ok=P.gear&&!water&&V[1]>-5&&P.ias<280&&Math.abs(P.roll)<0.35&&P.pitch>-0.12;
    if(!ok){ crash(water?'NOTWASSERUNG im Kanal – Maschine versinkt.':(P.gear?'HARTE LANDUNG – Fahrwerk gebrochen, Maschine zerschellt.':'BODENBERÜHRUNG – Maschine zerschellt.')); return false; }
    P.y=2; P.onGround=true;
    let hs=Math.hypot(V[0],V[2]);
    hs=Math.max(0,hs-(P.throttle<0.15?5:0.6)*dt);          // Rollreibung, im Leerlauf bremsen
    P.B=basis(P.heading+dr*0.5*dt,clamp(P.pitch,0,0.2),P.roll*0.9); // Spornrad: Nase 0–11°
    syncEuler();
    V[0]=Math.sin(P.heading)*hs; V[2]=Math.cos(P.heading)*hs; if(V[1]<0) V[1]=0;
    P.wp=0; P.wr=0; P.nz=1; if(P.wq<0&&P.pitch<=0.001) P.wq=0;
  } else if(P.y>3) P.onGround=false;
  return true;
}
// Tastatur fährt Ausschläge rampenförmig an (kurz tippen = kleiner Ausschlag)
function ramp(v,t,dt){ const rate=t===0?5:(v*t<0?6:2.2); return v+clamp(t-v,-rate*dt,rate*dt); }
// Expo-Kennlinie: fein um die Mitte, voller Ausschlag am Anschlag
function expo(s){ return 0.35*s+0.65*s*s*s; }
function spawnBullet(side,up,mv,grav,kan){
  const B=P.B, f=B.f, sp=0.005*mv;
  const x=P.x+f[0]*8+B.r[0]*side+B.u[0]*up, y=P.y+f[1]*8+B.r[1]*side+B.u[1]*up, z=P.z+f[2]*8+B.r[2]*side+B.u[2]*up;
  bullets.push({x,y,z,
    vx:P.V[0]+f[0]*mv+rnd(-0.5,0.5)*sp, vy:P.V[1]+f[1]*mv+rnd(-0.5,0.5)*sp, vz:P.V[2]+f[2]*mv+rnd(-0.5,0.5)*sp,
    life:kan?1.9:1.6, g:grav, kan});
}
function viewVec(h, p){ const c=Math.cos(p); return {x:Math.sin(h)*c, y:Math.sin(p), z:Math.cos(h)*c}; }
function dist3(ax,ay,az,bx,by,bz){ const dx=ax-bx,dy=ay-by,dz=az-bz; return Math.sqrt(dx*dx+dy*dy+dz*dz); }
function mkPart(kind,x,y,z,vx,vy,vz,life,r0,r1,g,drag){
  return {kind,x,y,z,vx,vy,vz,life,max:life,r0,r1,g:g||0,drag:drag||0};
}

function update(dt){
  if(G.mode==='dead'&&!G.paused){ G.deadT+=dt; if(G.msgT>0) G.msgT-=dt; updateParts(dt); return; }
  if(G.mode!=='fly'||G.paused) return;
  G.time+=dt;
  if(G.msgT>0) G.msgT-=dt;
  if(G.flash>0) G.flash-=dt*2;
  if(G.shake>0) G.shake-=dt*3;
  if(G.hitMark>0) G.hitMark-=dt;
  if(G.hitKill>0) G.hitKill-=dt;
  if(P.mgCd>0) P.mgCd-=dt;
  if(P.kanCd>0) P.kanCd-=dt;

  // --- Steuerung: Tastatur + Maus ergeben Knüppel/Pedal-Stellung ---
  P.sx=ramp(P.sx,(keys['ArrowRight']?1:0)-(keys['ArrowLeft']?1:0),dt);
  P.sy=ramp(P.sy,(keys['ArrowDown']?1:0)-(keys['ArrowUp']?1:0),dt);   // ↓ = ziehen
  P.sr=ramp(P.sr,(keys['d']?1:0)-(keys['a']?1:0),dt);
  const da=expo(clamp(P.sx+MOUSE.x,-1,1)), de=expo(clamp(P.sy+MOUSE.y,-1,1)), dr=expo(P.sr);
  // Gas (W/S, +/-, Mausrad) und Höhentrimmung (Q = kopflastig, E = schwanzlastig)
  if(keys['w']||keys['+']||keys['=']) P.throttle=Math.min(1,P.throttle+dt*0.6);
  if(keys['s']||keys['-']||keys['_']) P.throttle=Math.max(0,P.throttle-dt*0.6);
  if(keys['q']) P.trim=Math.max(-0.08,P.trim-dt*0.04);
  if(keys['e']) P.trim=Math.min(0.2,P.trim+dt*0.04);

  // --- Flugmodell in kleinen Schritten (stabil auch bei hoher Fahrt) ---
  const nSub=Math.ceil(dt/0.008);
  for(let i=0;i<nSub;i++) if(!flightStep(dt/nSub,da,de,dr)) return;
  P.vy=P.V[1];
  P.gSm+=(P.nz-P.gSm)*Math.min(1,dt*1.5);
  // Rückmeldung: Rütteln kurz vor dem Abriss, Warnungen, Strukturgrenzen
  const aS=P.flaps?FM.aSflap:FM.aS;
  if(P.alpha>aS*0.85&&!P.onGround) G.shake=Math.max(G.shake,Math.min(0.8,(P.alpha/aS-0.85)*3));
  if(P.stall&&!P.onGround&&Math.random()<dt*1.5) setMsg('ABRISS! Knüppel nachlassen, Nase runter!',1.5);
  if(P.ias>760){ P.hp-=dt*6; if(Math.random()<dt*3) setMsg('ACHTUNG: Übergeschwindigkeit! Struktur!'); }
  if(P.nz>10||P.nz<-5){ P.hp-=dt*25; if(Math.random()<dt*4) setMsg('ÜBERLASTUNG! Zelle ächzt!'); }
  if(P.hp<=0){ P.hp=0; return crash('STRUKTURBRUCH – Tragfläche abgerissen.'); }
  if(P.onGround&&Math.hypot(P.V[0],P.V[2])<15){
    P.ammoMG=Math.min(AMMO_MG,P.ammoMG+dt*120); P.ammoKan=Math.min(AMMO_KAN,P.ammoKan+dt*40); P.hp=Math.min(100,P.hp+dt*10);
    setMsg('Am Boden: Aufmunitionieren + Reparatur …',0.2);
  }

  // --- Waffen: 1 = MG 131, 2 = MG 151/20, 3 = beide; Leertaste/linke Maus = Auswahl, rechte Maus = Kanone ---
  const trig=keys[' ']||MOUSE.l;
  const fireMG=trig&&P.weapon!==1, fireKan=(trig&&P.weapon!==0)||MOUSE.r;
  if(fireMG&&P.mgCd<=0&&P.ammoMG>=2){
    P.mgCd=0.067; P.ammoMG-=2;
    spawnBullet(-0.35,0.35,900,4,false); spawnBullet(0.35,0.35,900,4,false);
    noiseBurst(0.08,0.2,1800);
    G.shake=Math.min(0.6,G.shake+0.1);
  }
  if(fireKan&&P.kanCd<=0&&P.ammoKan>=1){
    P.kanCd=0.086; P.ammoKan-=1;
    spawnBullet(0,-0.1,750,9.8,true);
    noiseBurst(0.12,0.32,650);
    G.shake=Math.min(0.8,G.shake+0.18);
  }
  P.ammoMG=Math.floor(P.ammoMG*100)/100;
  if((fireMG&&P.ammoMG<2)||(fireKan&&P.ammoKan<1)){ if(Math.random()<dt*2) setMsg((fireKan&&P.ammoKan<1?'KANONE':'MG')+' LEER – anderes Gerät wählen (1/2/3) oder landen!',1.5); }

  // Eigene Rauchfahne bei Schaden (entsteht hinter der Maschine)
  if(P.hp<45){
    G.smokeT-=dt;
    if(G.smokeT<=0){
      const f=P.B.f;
      G.smokeT=P.hp<25?0.04:0.07;
      parts.push(mkPart(P.hp<25?'dsmoke':'smoke', P.x-f[0]*7, P.y-f[1]*7+0.5, P.z-f[2]*7, rnd(-2,2),rnd(0,2),rnd(-2,2), rnd(1.5,2.5), 4, rnd(12,18), -1, 0.3));
    }
  }

  updateBullets(dt);
  if(G.mode!=='fly') return;
  updateEnemies(dt);
  if(G.mode!=='fly') return;
  updateParts(dt);
  updateFlak(dt);
  updateTarget();

  // Welle geschafft? Kurze Pause, dann die nächste
  if(!enemies.some(e=>e.alive)){
    if(!G.waveClear){
      G.waveClear=true; G.nextWaveT=4;
      const bonus = 100+G.wave*50;
      G.score+=bonus;
      setMsg('Welle '+G.wave+' vernichtet! +'+bonus+' Punkte – nächste Welle …');
    } else {
      G.nextWaveT-=dt;
      if(G.nextWaveT<=0){ G.waveClear=false; spawnWave(G.wave+1); }
    }
  }
  engineSound();
}

// ---------- Ziel-Auswahl (T) ----------
function updateTarget(){
  if(G.target&&!G.target.alive) G.target=null;
  if(!G.target){
    let best=null, bd=Infinity;
    for(const e of enemies){ if(!e.alive) continue; const d=dist3(e.x,e.y,e.z,P.x,P.y,P.z); if(d<bd){bd=d;best=e;} }
    G.target=best;
  }
}
function cycleTarget(){
  if(G.mode!=='fly') return;
  const list=enemies.filter(e=>e.alive).sort((a,b)=>dist3(a.x,a.y,a.z,P.x,P.y,P.z)-dist3(b.x,b.y,b.z,P.x,P.y,P.z));
  if(!list.length) return;
  const i=list.indexOf(G.target);
  G.target=list[(i+1)%list.length];
  const e=G.target;
  setMsg('Ziel: '+TYPE_NAME[e.type]+' – '+Math.round(dist3(e.x,e.y,e.z,P.x,P.y,P.z))+' m',1.5);
}

// ---------- Cheats (X = Reparatur, B = Munition) ----------
function cheatRepair(){
  if(!G.started||(G.mode!=='fly'&&G.mode!=='dead')){ setMsg('Erst ENTER = Start, dann X = Reparatur'); return; }
  if(G.mode==='dead'){
    // Wiederbeleben in der Luft (Cheat)
    G.mode='fly'; P.dead=false; G.paused=false;
    P.hp=100; P.ammoMG=Math.max(P.ammoMG,300); P.ammoKan=Math.max(P.ammoKan,100);
    P.y=Math.max(P.y,900); if(!(P.y>50)) P.y=1200;
    P.B=basis(P.heading,0,0); P.V=[P.B.f[0]*115,0,P.B.f[2]*115];
    P.wp=P.wq=P.wr=0; P.onGround=false; P.stall=false; P.trim=trimFor(115,P.y); syncEuler();
    G.flash=0; G.shake=0;
    setMsg('CHEAT: Flugzeug instand gesetzt – zurück in der Luft!');
    status('CHEAT Reparatur: 100 % Hülle, weiter gehts!');
  } else {
    P.hp=100; G.flash=0;
    setMsg('CHEAT: Flugzeug instand gesetzt – 100 % Hülle');
    status('CHEAT Reparatur: 100 % Hülle');
  }
  noiseBurst(0.2,0.15,600);
}
function cheatAmmo(){
  if(!G.started||(G.mode!=='fly'&&G.mode!=='dead')){ setMsg('Erst ENTER = Start, dann B = Munition'); return; }
  P.ammoMG=AMMO_MG; P.ammoKan=AMMO_KAN;
  const t='Volle Munition – MG '+AMMO_MG+', Kanone '+AMMO_KAN;
  if(G.mode==='dead'){ setMsg('CHEAT: '+t+' (trotzdem ENTER für Neustart)'); }
  else { setMsg('CHEAT: '+t); }
  status('CHEAT '+t);
  noiseBurst(0.2,0.15,900);
}

function crash(reason){
  G.mode='dead'; P.dead=true; G.deadT=0;
  explode(P.x,Math.max(P.y,2),P.z,true);
  noiseBurst(0.8,0.5,300);
  setMsg('',0);
  status(reason+'  Abschüsse: '+G.kills+'  Punkte: '+G.score+'  Welle: '+G.wave+'  – ENTER / R für Neustart');
}

const TYPE_NAME = {spit:'Spitfire Mk.V', mustang:'P-51D Mustang', b17:'B-17G', bf109:'Bf 109 G-6'};
const TYPE_PTS = {spit:100, mustang:150, b17:400};
function getKillText(e){
  return e.type==='b17'?'B-17 ABGESCHOSSEN!':(e.type==='mustang'?'Mustang abgeschossen!':'Spitfire abgeschossen!');
}
function killEnemy(e, rammed){
  e.alive=false; e.dying=true; e.fallT=0;
  G.kills++; G.score+=TYPE_PTS[e.type]||100;
  G.hitKill=0.9; G.hitMark=0.4;
  for(let i=0;i<6;i++) parts.push(mkPart('fire', e.x+rnd(-3,3), e.y+rnd(-3,3), e.z+rnd(-3,3), rnd(-8,8),rnd(-4,8),rnd(-8,8), rnd(0.4,0.8), 3, rnd(9,16)));
  noiseBurst(0.5,0.4,500);
  setMsg((rammed?'Gerammt! ':'')+getKillText(e)+'  ('+G.kills+' Abschüsse)');
  if(!rammed){ P.ammoMG=Math.min(AMMO_MG,P.ammoMG+40); P.ammoKan=Math.min(AMMO_KAN,P.ammoKan+10); }
}

function updateBullets(dt){
  // eigene
  for(let i=bullets.length-1;i>=0;i--){
    const b=bullets[i]; b.life-=dt;
    b.x+=b.vx*dt; b.y+=b.vy*dt; b.z+=b.vz*dt; b.vy-=dt*(b.g||4);
    if(b.life<=0||b.y<0){bullets.splice(i,1);continue;}
    for(const e of enemies){
      if(!e.alive) continue;
      const r = e.type==='b17'?28:15;
      if(dist3(b.x,b.y,b.z,e.x,e.y,e.z)<r){
        e.hp-= b.kan ? (e.type==='b17'?20:32) : (e.type==='b17'?6:11);
        if(b.kan) parts.push(mkPart('fire', b.x,b.y,b.z, e.vx*0.8,e.vy*0.8,e.vz*0.8, 0.3, 2, 6));
        e.hitT=0.3;
        G.hitMark=0.4;
        spark(b.x,b.y,b.z,8);
        parts.push(mkPart('fire', b.x,b.y,b.z, e.vx*0.8,e.vy*0.8,e.vz*0.8, 0.15, 1, 3.5));
        noiseBurst(0.06,0.18,2600); // Treffer-Bestätigung (hell)
        bullets.splice(i,1);
        if(e.hp<=0&&e.alive) killEnemy(e,false);
        break;
      }
    }
  }
  // feindliche
  for(let i=ebullets.length-1;i>=0;i--){
    const b=ebullets[i]; b.life-=dt;
    b.x+=b.vx*dt; b.y+=b.vy*dt; b.z+=b.vz*dt;
    if(b.life<=0){ebullets.splice(i,1);continue;}
    if(dist3(b.x,b.y,b.z,P.x,P.y,P.z)<12){
      ebullets.splice(i,1);
      P.hp-=rnd(4,9);
      G.flash=1; G.shake=0.8;
      noiseBurst(0.15,0.3,700);
      if(P.hp<=0){ P.hp=0; return crash('ABGESCHOSSEN – Fallschirm? Zu spät.'); }
      else if(P.hp<30) setMsg('SCHWER BESCHÄDIGT! '+Math.round(P.hp)+'% Hülle');
    }
  }
}

function updateEnemies(dt){
  for(const e of enemies){
    if(e.dying){
      // Brennend abstürzen, am Boden explodieren
      e.fallT+=dt;
      if(e.hitT>0) e.hitT-=dt;
      e.pitch+=(-0.85-e.pitch)*Math.min(1,dt*0.8);
      e.roll+=dt*(e.type==='b17'?0.6:2.4);
      e.heading+=dt*0.3;
      const ev=viewVec(e.heading,e.pitch), ems=(e.type==='b17'?260:420)/3.6;
      e.vx=ev.x*ems; e.vy=ev.y*ems; e.vz=ev.z*ems;
      e.x+=e.vx*dt; e.y+=e.vy*dt; e.z+=e.vz*dt;
      emitSmoke(e,dt,true);
      if(e.y<=3||e.fallT>25){
        if(e.y<=3){ explode(e.x,3,e.z,e.type==='b17'); noiseBurst(0.6,0.3,250); }
        e.dying=false;
      }
      continue;
    }
    if(!e.alive) continue;
    if(e.hitT>0) e.hitT-=dt;
    e.wob+=dt*2;
    const dx=P.x-e.x, dy=P.y-e.y, dz=P.z-e.z;
    const dh=Math.hypot(dx,dz)||1;
    const d=Math.hypot(dh,dy);
    let wantH, wantP;
    if(e.type==='b17'){
      // Bomber: Kurs auf den Flugplatz, Höhe halten
      const ox=-e.x, oz=-e.z;
      wantH = Math.hypot(ox,oz)>600 ? Math.atan2(ox,oz) : e.heading;
      wantP = clamp((e.alt0-e.y)*0.002,-0.1,0.1);
    } else if(e.mode==='abdrehen'){
      e.modeT-=dt;
      wantH=Math.atan2(dx,dz)+Math.PI+e.breakDir; wantP=e.breakP;
      if(e.modeT<=0) e.mode='angriff';
    } else {
      wantH=Math.atan2(dx,dz);
      wantP=Math.atan2(dy,dh)*0.8+Math.sin(e.wob)*0.1;
      if(d<170){ e.mode='abdrehen'; e.modeT=rnd(2.5,4.5); e.breakDir=rnd(-0.9,0.9); e.breakP=rnd(-0.25,0.35); }
    }
    const turn=e.type==='b17'?0.25:1.2;
    const rate=clamp(wrap(wantH-e.heading)*2,-turn,turn);
    e.heading+=rate*dt;
    e.roll+=(clamp(rate*0.9,-1.2,1.2)-e.roll)*Math.min(1,dt*3);
    e.pitch+=(clamp(wantP,-0.7,0.7)-e.pitch)*Math.min(1,dt*2);
    const ev=viewVec(e.heading,e.pitch), ems=e.speed/3.6;
    e.vx=ev.x*ems; e.vy=ev.y*ems; e.vz=ev.z*ems;
    e.x+=e.vx*dt; e.y+=e.vy*dt; e.z+=e.vz*dt;
    if(e.y<50){e.y=50;}
    if(e.y>6000)e.y=6000;
    // Rammen?
    if(d<22){ e.hp-=30; P.hp-=35; G.flash=1; G.shake=1; explode((e.x+P.x)/2,(e.y+P.y)/2,(e.z+P.z)/2,false);
      if(P.hp<=0) return crash('RAMMSTOSS – beide Maschinen verloren.');
      if(e.hp<=0) killEnemy(e,true);
    }
    e.fireCd-=dt;
    const nx=dx/(d||1),ny=dy/(d||1),nz=dz/(d||1);
    if(e.type==='b17'){
      // Bordschützen schießen in alle Richtungen
      if(e.fireCd<=0&&d<750){
        e.fireCd=rnd(0.3,0.6);
        const sp=900;
        ebullets.push({x:e.x,y:e.y,z:e.z,vx:nx*sp+rnd(-40,40),vy:ny*sp+rnd(-40,40),vz:nz*sp+rnd(-40,40),life:1.4});
        noiseBurst(0.05,0.06,1100);
      }
    } else if(e.fireCd<=0&&d<900&&d>40){
      // Feuern wenn Spieler im Kegel vor der Nase
      const dp=ev.x*nx+ev.y*ny+ev.z*nz;
      if(dp>0.965){
        e.fireCd = rnd(0.5,1.2);
        const sp=900;
        ebullets.push({x:e.x,y:e.y,z:e.z,vx:nx*sp+rnd(-25,25),vy:ny*sp+rnd(-25,25),vz:nz*sp+rnd(-25,25),life:1.8});
        noiseBurst(0.07,0.08,900);
      } else e.fireCd=0.25;
    }
    emitSmoke(e,dt,false);
  }
}
function emitSmoke(e,dt,dying){
  const hpF=e.hp/e.maxHp;
  if(!dying&&hpF>=0.55) return;
  e.smokeT-=dt;
  if(e.smokeT>0) return;
  const heavy=dying||hpF<0.25;
  e.smokeT=dying?0.045:(heavy?0.06:0.09);
  const ev=viewVec(e.heading,e.pitch), bk=e.type==='b17'?10:5, big=e.type==='b17'?1.25:1;
  const x=e.x-ev.x*bk, y=e.y-ev.y*bk, z=e.z-ev.z*bk;
  // Wölkchen starten schon groß und überlappen → geschlossene Rauchfahne statt Punktreihe
  parts.push(mkPart(heavy?'dsmoke':'smoke', x,y,z, rnd(-2,2),rnd(0,3),rnd(-2,2), rnd(1.8,3), 5*big, rnd(14,22)*big, -1, 0.3));
  if(heavy) parts.push(mkPart('fire', x,y,z, e.vx*0.3,e.vy*0.3,e.vz*0.3, 0.25, 1.5, 4));
}

function updateParts(dt){
  if(parts.length>900) parts.splice(0,parts.length-900);
  for(let i=parts.length-1;i>=0;i--){const p=parts[i];p.life-=dt;
    p.vy-=p.g*dt;
    if(p.drag){ const k=Math.max(0,1-p.drag*dt); p.vx*=k; p.vy*=k; p.vz*=k; }
    p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;
    if(p.life<=0||(p.y<0&&(p.kind==='debris'||p.kind==='spark')))parts.splice(i,1);}
}
function spark(x,y,z,n){for(let i=0;i<n;i++)parts.push(mkPart('spark',x,y,z,rnd(-60,60),rnd(-20,60),rnd(-60,60),rnd(0.2,0.5),0,0,9.8));}
function explode(x,y,z,big){
  const n=big?1.8:1;
  for(let i=0;i<8*n;i++) parts.push(mkPart('fire', x+rnd(-4,4)*n,y+rnd(-2,5)*n,z+rnd(-4,4)*n, rnd(-15,15)*n,rnd(-5,15)*n,rnd(-15,15)*n, rnd(0.5,1.1), rnd(3,6)*n, rnd(10,22)*n, 0, 1.5));
  for(let i=0;i<8*n;i++) parts.push(mkPart('dsmoke', x+rnd(-6,6)*n,y+rnd(0,6)*n,z+rnd(-6,6)*n, rnd(-6,6),rnd(2,8),rnd(-6,6), rnd(2.5,4.5), 6*n, rnd(20,35)*n, -1, 0.5));
  for(let i=0;i<12*n;i++) parts.push(mkPart('debris', x,y,z, rnd(-60,60),rnd(-10,70),rnd(-60,60), rnd(1.5,3), 0,0, 9.8, 0.2));
  spark(x,y,z,14);
}

function updateFlak(dt){
  for(const f of flak){
    f.cd-=dt;
    const d=dist3(f.x,0,f.z,P.x,P.y,P.z);
    if(f.cd<=0&&d<4000&&P.y<3500){
      f.cd=rnd(2.5,6);
      // Sprengpunkt in der Nähe des Spielers: schwarze Wolke mit kurzem Blitz
      const ox=rnd(-80,80),oy=rnd(-40,40),oz=rnd(-80,80);
      const x=P.x+ox, y=P.y+oy, z=P.z+oz;
      parts.push(mkPart('fire', x,y,z, 0,0,0, 0.22, 2, 8));
      parts.push(mkPart('flak', x,y,z, rnd(-2,2),rnd(0,1),rnd(-2,2), 3.2, 3, 17));
      for(let k=0;k<3;k++) parts.push(mkPart('flak', x+rnd(-4,4),y+rnd(-3,3),z+rnd(-4,4), rnd(-2,2),rnd(0,1),rnd(-2,2), rnd(2.5,3.5), 2, rnd(8,12)));
      noiseBurst(0.3,0.12,200);
      if(!G.flakWarned){ G.flakWarned=true; setMsg('FLAK! Schwarze Wölkchen = Sprengpunkte – Kurs/Höhe ändern!',4); }
      if(Math.abs(ox)<22&&Math.abs(oy)<14&&Math.abs(oz)<22){P.hp-=rnd(6,14);G.flash=1;setMsg('FLAKTREFFER! '+Math.round(P.hp)+'%');if(P.hp<=0)return crash('FLAK-VOLLTREFFER über dem Kanal.');}
    }
  }
}

// ---------- 3D-Modelle (eigene Low-Poly-Konstruktion) ----------
function newModel(){ return {v:[], f:[], rad:0}; }
function newell(P){
  let x=0,y=0,z=0;
  for(let i=0;i<P.length;i++){ const a=P[i], b=P[(i+1)%P.length];
    x+=(a[1]-b[1])*(a[2]+b[2]); y+=(a[2]-b[2])*(a[0]+b[0]); z+=(a[0]-b[0])*(a[1]+b[1]); }
  return [x,y,z];
}
// Fläche mit Normalen; hint = grobe Außenrichtung
function face(m,P,col,hint,opt){
  let n=newell(P); const L=Math.hypot(n[0],n[1],n[2]); if(L<1e-9) return null;
  n=[n[0]/L,n[1]/L,n[2]/L];
  if(hint&&dot(n,hint)<0) n=[-n[0],-n[1],-n[2]];
  const i0=m.v.length;
  for(const p of P){ m.v.push(p); const r=Math.hypot(p[0],p[1],p[2]); if(r>m.rad) m.rad=r; }
  const f={i:P.map((_,k)=>i0+k), n, c:col[0]==='#'?hex(col):col, sub:[], ds:!!(opt&&opt.ds), flat:!!(opt&&opt.flat)};
  m.f.push(f); return f;
}
// Abzeichen: wird direkt nach der Trägerfläche gezeichnet (kein Z-Fighting)
function decal(m,parent,P,col){ if(!parent) return; const i0=m.v.length; for(const p of P) m.v.push(p); parent.sub.push({i:P.map((_,k)=>i0+k), c:hex(col)}); }
function onPlane(c,u,v,pts){ return pts.map(([a,b])=>[c[0]+u[0]*a+v[0]*b, c[1]+u[1]*a+v[1]*b, c[2]+u[2]*a+v[2]*b]); }
function circ2(r,n){ n=n||12; const o=[]; for(let k=0;k<n;k++){ const a=k/n*Math.PI*2; o.push([Math.cos(a)*r,Math.sin(a)*r]); } return o; }
function cross2(s,w){ return [[-w,s],[w,s],[w,w],[s,w],[s,-w],[w,-w],[w,-s],[-w,-s],[-w,-w],[-s,-w],[-s,w],[-w,w]]; }
function star2(r){ const o=[]; for(let k=0;k<10;k++){ const a=Math.PI/2+k*Math.PI/5, rr=k%2?r*0.4:r; o.push([Math.cos(a)*rr,Math.sin(a)*rr]); } return o; }
function rect2(a0,a1,b0,b1){ return [[a0,b0],[a1,b0],[a1,b1],[a0,b1]]; }
function roundel(m,parent,c,u,v,rings){ for(const [r,col] of rings) decal(m,parent,onPlane(c,u,v,circ2(r,14)),col); }
function usStar(m,parent,c,u,v,r){
  decal(m,parent,onPlane(c,u,v,rect2(-1.9*r,1.9*r,-0.42*r,0.2*r)),'#e8e8e4');
  decal(m,parent,onPlane(c,u,v,circ2(r,14)),'#1f3570');
  decal(m,parent,onPlane(c,u,v,star2(r*0.95)),'#ececea');
}
function balkenkreuz(m,parent,c,u,v,s){
  decal(m,parent,onPlane(c,u,v,cross2(s,s*0.42)),'#ececea');
  decal(m,parent,onPlane(c,u,v,cross2(s*0.86,s*0.2)),'#151515');
}
// Rumpf als Spant-Loft: st = [{z,w,h,y}] von der Nase zum Heck, N Seiten (k=0 oben)
function loft(m,st,N,colFn,xo){
  xo=xo||0;
  const rings=st.map(s=>{ const r=[]; for(let k=0;k<N;k++){ const a=k*2*Math.PI/N; r.push([xo+s.w*Math.sin(a), s.y+s.h*Math.cos(a), s.z]); } return r; });
  const faces=[];
  for(let i=0;i<st.length-1;i++){
    faces.push([]);
    for(let k=0;k<N;k++){
      const k2=(k+1)%N, am=(k+0.5)*2*Math.PI/N;
      faces[i].push(face(m,[rings[i][k],rings[i][k2],rings[i+1][k2],rings[i+1][k]], colFn(i,k,Math.cos(am),(st[i].z+st[i+1].z)/2), [Math.sin(am),Math.cos(am),0]));
    }
  }
  if(st[0].w>0.06) face(m,rings[0].slice(),colFn(0,0,1,st[0].z),[0,0,1]);
  const l=st.length-1; if(st[l].w>0.06) face(m,rings[l].slice(),colFn(l-1,0,1,st[l].z),[0,0,-1]);
  return faces;
}
function sideX(st,z){ // halbe Rumpfbreite bei z (für Abzeichen)
  for(let i=0;i<st.length-1;i++){ const a=st[i], b=st[i+1];
    if(z<=a.z&&z>=b.z){ const t=(a.z-z)/(a.z-b.z); return (a.w+(b.w-a.w)*t)*0.951; } }
  return 0.3;
}
function wing(m,half,yf,top,bot){
  const res={};
  for(const sd of [1,-1]){
    const P=half.map(([x,z])=>[x*sd,yf(x),z]);
    res[sd>0?'tr':'tl']=face(m,P,top,[0,1,0]);
    res[sd>0?'br':'bl']=face(m,P.slice().reverse(),bot,[0,-1,0]);
  }
  return res;
}
function fin(m,pts,col,x){ x=x||0; const P=pts.map(([y,z])=>[x,y,z]); return {r:face(m,P,col,[1,0,0]), l:face(m,P.slice().reverse(),col,[-1,0,0])}; }
function box(m,x0,x1,y0,y1,z0,z1,col,noBottom){
  face(m,[[x0,y1,z0],[x1,y1,z0],[x1,y1,z1],[x0,y1,z1]],col,[0,1,0]);
  if(!noBottom) face(m,[[x0,y0,z0],[x1,y0,z0],[x1,y0,z1],[x0,y0,z1]],col,[0,-1,0]);
  face(m,[[x1,y0,z0],[x1,y1,z0],[x1,y1,z1],[x1,y0,z1]],col,[1,0,0]);
  face(m,[[x0,y0,z0],[x0,y1,z0],[x0,y1,z1],[x0,y0,z1]],col,[-1,0,0]);
  face(m,[[x0,y0,z1],[x1,y0,z1],[x1,y1,z1],[x0,y1,z1]],col,[0,0,1]);
  face(m,[[x0,y0,z0],[x1,y0,z0],[x1,y1,z0],[x0,y1,z0]],col,[0,0,-1]);
}
function prop(m,x,y,z,r){ face(m,onPlane([x,y,z],[1,0,0],[0,1,0],circ2(r,14)),'rgba(45,45,45,0.13)',[0,0,1],{ds:true,flat:true}); }
// Kabinenhaube: A=Frontscheibe unten, B=Dach vorn, C=Dach hinten, D=hinten unten, T=Rückenverkleidung
function canopy(m,o){
  const A=[[-o.wb,o.yb,o.zA],[o.wb,o.yb,o.zA]], B=[[-o.wt,o.yt,o.zB],[o.wt,o.yt,o.zB]];
  const C=[[-o.wt,o.yt,o.zC],[o.wt,o.yt,o.zC]], D=[[-o.wb,o.yb,o.zD],[o.wb,o.yb,o.zD]];
  const gl=o.glass||'#94bccd';
  face(m,[A[0],A[1],B[1],B[0]],gl,[0,0.4,1]);
  face(m,[B[0],B[1],C[1],C[0]],gl,[0,1,0]);
  face(m,[A[0],B[0],C[0],D[0]],gl,[-1,0.3,0]);
  face(m,[A[1],B[1],C[1],D[1]],gl,[1,0.3,0]);
  if(o.T){
    face(m,[D[0],C[0],o.T],o.fair,[-1,0.5,-0.2]);
    face(m,[C[1],D[1],o.T],o.fair,[1,0.5,-0.2]);
    face(m,[C[0],C[1],o.T],o.fair,[0,1,-0.3]);
  } else face(m,[C[0],C[1],D[1],D[0]],gl,[0,0.3,-1]);
}

function buildSpit(){
  const m=newModel();
  const G1='#4a5a35', G2='#77776a', UND='#a7adab', SKY='#c9d3b0';
  const st=[
    {z:4.45,w:0.02,h:0.02,y:0},{z:4.1,w:0.3,h:0.3,y:0},{z:3.85,w:0.42,h:0.46,y:0.02},
    {z:2.6,w:0.47,h:0.6,y:0.05},{z:1.1,w:0.5,h:0.66,y:0.08},{z:-0.6,w:0.45,h:0.64,y:0.08},
    {z:-2.2,w:0.33,h:0.52,y:0.08},{z:-3.3,w:0.2,h:0.42,y:0.12},{z:-4.2,w:0.08,h:0.3,y:0.18},{z:-4.65,w:0.02,h:0.12,y:0.25},
  ];
  const L=loft(m,st,10,(i,k,up,zm)=>{
    if(i<2) return SKY;                       // Spinner
    if(zm<-2.2&&zm>-3.3) return SKY;          // Rumpfband
    if(up>-0.2) return ((i+k)%3===0)?G2:G1;   // Tarnung oben
    return UND;
  });
  // Auspuff
  for(const [k,sd] of [[2,1],[7,-1]]) decal(m,L[3][k],onPlane([sd*sideX(st,3.2),0.28,3.2],[0,0,1],[0,1,0],rect2(-0.55,0.55,-0.06,0.06)),'#2a2522');
  // Elliptische Tragfläche
  const S=5.65, xs=[0,1,2,3,3.8,4.5,5.0,5.4,5.62], half=[];
  const e=x=>Math.sqrt(Math.max(0,1-(x/S)*(x/S)));
  for(const x of xs) half.push([x,0.1+1.35*e(x)]);
  for(let i=xs.length-1;i>=0;i--) half.push([xs[i],0.1-1.0*e(xs[i])]);
  const yw=x=>-0.38+0.06*x;
  const W=wing(m,half,yw,G1,UND);
  for(const sd of [1,-1]){
    const t=sd>0?W.tr:W.tl;
    decal(m,t,[[sd*0.9,yw(0.9),0.95],[sd*2.9,yw(2.9),0.8],[sd*3.7,yw(3.7),-0.2],[sd*1.4,yw(1.4),-0.6]],G2);
    roundel(m,t,[sd*3.4,yw(3.4),0.25],[1,0,0],[0,0,1],[[0.75,'#2a3a6e'],[0.3,'#9c2424']]);
  }
  // Höhenleitwerk + Seitenleitwerk
  const tp=[[0,-3.5],[0.8,-3.6],[1.4,-3.8],[1.65,-4.05],[1.4,-4.3],[0.8,-4.45],[0,-4.5]];
  wing(m,tp,()=>0.2,G1,UND);
  const F=fin(m,[[0.35,-3.7],[1.25,-4.05],[1.45,-4.45],[1.3,-4.8],[0.3,-4.75]],G1);
  for(const [side,sd] of [[F.r,1],[F.l,-1]]){
    decal(m,side,[[0,0.45,-4.08],[0,1.0,-4.18],[0,1.0,-4.36],[0,0.45,-4.3]],'#9c2424');
    decal(m,side,[[0,0.45,-4.3],[0,1.0,-4.36],[0,1.0,-4.5],[0,0.45,-4.46]],'#e8e8e4');
    decal(m,side,[[0,0.45,-4.46],[0,1.0,-4.5],[0,1.0,-4.64],[0,0.45,-4.62]],'#2a3a6e');
  }
  // Kokarden am Rumpf
  for(const [k,sd] of [[2,1],[7,-1]]) roundel(m,L[5][k],[sd*sideX(st,-1.5),0.12,-1.5],[0,0,1],[0,1,0],[[0.42,'#d6b23a'],[0.36,'#2a3a6e'],[0.22,'#e8e8e4'],[0.12,'#9c2424']]);
  canopy(m,{zA:0.95,zB:0.45,zC:-0.35,zD:-0.5,yb:0.62,yt:0.98,wb:0.3,wt:0.2,T:[0,0.72,-1.8],fair:G1});
  box(m,0.9,1.35,-0.62,-0.4,0.9,-0.2,UND);   // Kühler unter der rechten Fläche
  prop(m,0,0,4.05,1.6);
  return m;
}

function buildMustang(){
  const m=newModel();
  const NM='#bcc1c6', NM2='#a3a9ae', OD='#4f5332', RED='#b02a20', WHT='#e6e6e2', BLK='#1c1c1c';
  const st=[
    {z:4.95,w:0.02,h:0.02,y:0},{z:4.55,w:0.3,h:0.3,y:0},{z:4.25,w:0.42,h:0.5,y:0.02},{z:2.5,w:0.46,h:0.62,y:0.02},
    {z:1.0,w:0.46,h:0.64,y:0.04},{z:-0.4,w:0.42,h:0.62,y:0.04},{z:-1.6,w:0.37,h:0.6,y:0.04},{z:-1.95,w:0.35,h:0.58,y:0.05},
    {z:-2.3,w:0.33,h:0.55,y:0.05},{z:-2.65,w:0.3,h:0.52,y:0.06},{z:-3.0,w:0.26,h:0.48,y:0.07},{z:-4.3,w:0.1,h:0.32,y:0.15},{z:-4.85,w:0.02,h:0.12,y:0.22},
  ];
  const L=loft(m,st,10,(i,k,up,zm)=>{
    if(i<2) return RED;
    if(zm<-1.6&&zm>-3.0) return (Math.floor((-1.6-zm)/0.35)%2)?BLK:WHT; // Invasionsstreifen
    if(i>=2&&i<=3&&(k===0||k===9)) return OD;                             // Blendschutz
    return up>-0.2?NM:NM2;
  });
  const half=[[0,1.25],[5.4,0.55],[5.64,0.35],[5.64,-0.15],[5.4,-0.4],[0,-1.35]];
  const yw=x=>-0.45+0.087*x;
  const W=wing(m,half,yw,NM,NM2);
  usStar(m,W.tl,[-3.9,yw(3.9),0.05],[1,0,0],[0,0,1],0.55);
  usStar(m,W.br,[3.9,yw(3.9),0.05],[1,0,0],[0,0,1],0.55);
  wing(m,[[0,-3.6],[2.0,-4.0],[2.1,-4.25],[2.0,-4.5],[0,-4.6]],()=>0.15,NM,NM2);
  fin(m,[[0.4,-3.2],[1.35,-4.3],[1.45,-4.65],[1.2,-4.95],[0.25,-4.9]],NM);
  for(const [k,sd] of [[2,1],[7,-1]]) usStar(m,L[11][k],[sd*sideX(st,-3.55),0.12,-3.55],[0,0,1],[0,1,0],0.3);
  canopy(m,{zA:1.1,zB:0.7,zC:-0.2,zD:-0.75,yb:0.6,yt:1.06,wb:0.3,wt:0.2});
  box(m,-0.28,0.28,-1.0,-0.55,-2.1,-0.3,NM2);   // Kühlerhutze
  decal(m,m.f[m.f.length-2],[[-0.24,-0.97,-0.3],[0.24,-0.97,-0.3],[0.24,-0.6,-0.3],[-0.24,-0.6,-0.3]],'#1a1a1a');
  prop(m,0,0,4.6,1.7);
  return m;
}

function buildB17(){
  const m=newModel();
  const OD='#5a5b3c', GRY='#8a8d84', GL='#9cc3d5', DK='#2e2e2a';
  const st=[
    {z:11.4,w:0.05,h:0.05,y:0.1},{z:11.0,w:0.8,h:0.8,y:0.1},{z:9.8,w:1.15,h:1.2,y:0.1},{z:7.5,w:1.3,h:1.45,y:0.15},
    {z:3,w:1.35,h:1.55,y:0.2},{z:-2,w:1.25,h:1.5,y:0.25},{z:-6,w:0.95,h:1.25,y:0.35},{z:-9.5,w:0.55,h:0.95,y:0.55},
    {z:-11.2,w:0.35,h:0.6,y:0.7},{z:-11.5,w:0.1,h:0.2,y:0.7},
  ];
  const L=loft(m,st,10,(i,k,up)=>{
    if(i===0) return GL;
    if(i===1&&up>-0.5) return GL;            // Bugverglasung
    if(i===2&&up>0.6) return GL;             // Cockpitfenster
    if(i===8) return GL;                     // Heckstand
    return up>-0.2?OD:GRY;
  });
  const yw=x=>-0.3+0.045*x;
  const W=wing(m,[[0,4.2],[15.2,1.2],[15.8,0.8],[15.8,-1.2],[15,-1.5],[0,-2.2]],yw,OD,GRY);
  usStar(m,W.tl,[-10.5,yw(10.5),0.2],[1,0,0],[0,0,1],1.1);
  usStar(m,W.br,[10.5,yw(10.5),0.2],[1,0,0],[0,0,1],1.1);
  // Vier Motoren
  for(const xo of [-8.6,-4.2,4.2,8.6]){
    const y0=yw(Math.abs(xo))-0.1;
    loft(m,[{z:5.6,w:0.05,h:0.05,y:y0},{z:5.3,w:0.58,h:0.58,y:y0},{z:4.6,w:0.72,h:0.72,y:y0},{z:1.5,w:0.62,h:0.62,y:y0-0.05},{z:-0.8,w:0.28,h:0.32,y:y0}],8,
      (i,k,up)=>i===0?DK:(up>-0.2?OD:GRY),xo);
    prop(m,xo,y0,5.7,1.9);
  }
  wing(m,[[0,-8.2],[6.4,-10.6],[6.6,-11.0],[6.4,-11.9],[0,-11.9]],()=>0.9,OD,GRY);
  fin(m,[[1.4,-3.5],[2.2,-7.5],[5.6,-10.6],[5.8,-11.4],[5.2,-12.0],[0.9,-11.6]],OD);
  for(const [k,sd] of [[2,1],[7,-1]]) usStar(m,L[5][k],[sd*sideX(st,-4.2),0.35,-4.2],[0,0,1],[0,1,0],0.75);
  box(m,-0.5,0.5,1.55,2.05,6.3,5.3,GL,true);   // oberer Drehturm
  box(m,-0.45,0.45,-1.4,-0.9,10.3,9.4,DK);      // Kinnturm
  box(m,-0.55,0.55,-1.75,-1.2,-1.4,-2.4,DK);    // Kugelturm
  return m;
}

function buildBf109(){
  const m=newModel();
  const R74='#5b6264', R75='#70767a', R76='#aebdcb', R76M='#8e9ba6', YEL='#e0b21c', SPIN='#2c3228';
  const st=[
    {z:4.45,w:0.02,h:0.02,y:0},{z:4.1,w:0.28,h:0.3,y:0},{z:3.8,w:0.4,h:0.46,y:0},{z:2.6,w:0.44,h:0.58,y:0.05},
    {z:1.2,w:0.46,h:0.62,y:0.08},{z:-0.4,w:0.42,h:0.6,y:0.1},{z:-2.2,w:0.3,h:0.48,y:0.12},{z:-3.6,w:0.16,h:0.36,y:0.18},{z:-4.5,w:0.04,h:0.2,y:0.25},
  ];
  const L=loft(m,st,10,(i,k,up,zm)=>{
    if(i<2) return SPIN;
    if(i===2&&up<-0.3) return YEL;                  // gelbe Motorunterseite
    if(zm<-2.2&&zm>-3.6&&up<0.8) return YEL;         // Rumpfband
    if(up>0.45) return ((i*2+k)%3===0)?R75:R74;
    if(up>-0.25) return ((i+k)%2)?R76M:R76;
    return R76;
  });
  const half=[[0,1.1],[4.6,0.45],[4.9,0.3],[4.96,0.05],[4.85,-0.25],[4.5,-0.4],[0,-1.0]];
  const yw=x=>-0.42+0.11*x;
  const W=wing(m,half,yw,R74,R76);
  for(const sd of [1,-1]){
    const t=sd>0?W.tr:W.tl, b=sd>0?W.br:W.bl;
    decal(m,t,[[sd*0.6,yw(0.6),0.9],[sd*2.2,yw(2.2),0.7],[sd*2.8,yw(2.8),-0.3],[sd*0.8,yw(0.8),-0.8]],R75);
    balkenkreuz(m,t,[sd*3.2,yw(3.2),0.05],[1,0,0],[0,0,1],0.5);
    balkenkreuz(m,b,[sd*3.2,yw(3.2),0.05],[1,0,0],[0,0,1],0.5);
  }
  wing(m,[[0,-3.55],[1.4,-3.75],[1.6,-3.95],[1.5,-4.2],[0,-4.3]],()=>0.55,R74,R76);
  fin(m,[[0.3,-3.3],[1.2,-3.95],[1.4,-4.3],[1.25,-4.6],[0.2,-4.55]],R75);
  for(const [k,sd] of [[2,1],[7,-1]]) balkenkreuz(m,L[5][k],[sd*sideX(st,-1.5),0.12,-1.5],[0,0,1],[0,1,0],0.4);
  canopy(m,{zA:0.9,zB:0.5,zC:-0.4,zD:-0.6,yb:0.62,yt:0.95,wb:0.3,wt:0.22,T:[0,0.72,-1.9],fair:R74,glass:'#88a9b8'});
  box(m,-0.36,-0.16,0.55,0.72,2.9,1.6,R74);   // MG-Beulen (G-6)
  box(m,0.16,0.36,0.55,0.72,2.9,1.6,R74);
  box(m,-0.6,-0.3,-0.62,-0.45,1.0,-0.1,R76);  // Kühler unter den Flächen
  box(m,0.3,0.6,-0.62,-0.45,1.0,-0.1,R76);
  prop(m,0,0,4.0,1.5);
  return m;
}

function houseInto(m,ox,oz,w,d,h,rh,wall,roof){
  const x=w/2, z=d/2, o=0.6;
  face(m,[[ox-x,0,oz+z],[ox+x,0,oz+z],[ox+x,h,oz+z],[ox,h+rh,oz+z],[ox-x,h,oz+z]],wall,[0,0,1]);
  face(m,[[ox-x,0,oz-z],[ox+x,0,oz-z],[ox+x,h,oz-z],[ox,h+rh,oz-z],[ox-x,h,oz-z]],wall,[0,0,-1]);
  face(m,[[ox+x,0,oz-z],[ox+x,0,oz+z],[ox+x,h,oz+z],[ox+x,h,oz-z]],wall,[1,0,0]);
  face(m,[[ox-x,0,oz-z],[ox-x,0,oz+z],[ox-x,h,oz+z],[ox-x,h,oz-z]],wall,[-1,0,0]);
  face(m,[[ox+x+o,h-0.4,oz-z-o],[ox+x+o,h-0.4,oz+z+o],[ox,h+rh,oz+z+o],[ox,h+rh,oz-z-o]],roof,[1,1,0]);
  face(m,[[ox-x-o,h-0.4,oz-z-o],[ox-x-o,h-0.4,oz+z+o],[ox,h+rh,oz+z+o],[ox,h+rh,oz-z-o]],roof,[-1,1,0]);
}
function house(w,d,h,rh,wall,roof){ const m=newModel(); houseInto(m,0,0,w,d,h,rh,wall,roof); return m; }
function buildChurch(){
  const m=newModel();
  houseInto(m,0,0,10,22,9,6,'#d9d2c2','#5a4a42');
  box(m,-3,3,0,22,11,17,'#cfc7b5',true);
  const t=[0,34,14], c=[[-3,22,11],[3,22,11],[3,22,17],[-3,22,17]];
  for(let k=0;k<4;k++){ const a=c[k], b=c[(k+1)%4]; face(m,[a,b,t],'#4a5a52',[(a[0]+b[0])/2,1,(a[2]+b[2])/2-14]); }
  return m;
}
function buildTower(){ const m=newModel(); box(m,-3,3,0,12,-3,3,'#d0cabb',true); box(m,-4,4,12,15,-4,4,'#7a8a90',true); return m; }

const MODELS = {
  spit: buildSpit(), mustang: buildMustang(), b17: buildB17(), bf109: buildBf109(),
  house1: house(9,12,5,4,'#dcd3bf','#8e3b28'), house2: house(8,10,5,3.5,'#9b5b3f','#5a3a2c'),
  house3: house(7,9,4,3,'#cdbd9e','#4d5358'), barn: house(12,20,6,5,'#6b4a32','#5f625e'),
  church: buildChurch(), hangar: house(30,24,8,4,'#6d6a5e','#4c5048'), tower: buildTower(),
};
// Sichtbarer Maßstab (arcade: Gegner etwas größer, damit man sie erkennt)
const VIS = {spit:2, mustang:2, b17:1.5, bf109:1};

// ---------- Sprites (prozedural) ----------
function makeSprite(stops, shade){
  const c=document.createElement('canvas'); c.width=c.height=64;
  const g=c.getContext('2d');
  const gr=g.createRadialGradient(30,28,2,32,32,32);
  for(const [t,col] of stops) gr.addColorStop(t,col);
  g.fillStyle=gr; g.fillRect(0,0,64,64);
  if(shade){
    g.globalCompositeOperation='source-atop';
    const lg=g.createLinearGradient(0,14,0,62); lg.addColorStop(0,'rgba(0,0,0,0)'); lg.addColorStop(1,shade);
    g.fillStyle=lg; g.fillRect(0,0,64,64);
  }
  return c;
}
const SPR = {
  cloud: makeSprite([[0,'rgba(255,255,255,1)'],[0.5,'rgba(250,251,253,0.95)'],[0.78,'rgba(236,240,246,0.6)'],[1,'rgba(226,232,240,0)']],'rgba(140,152,172,0.6)'),
  smoke: makeSprite([[0,'rgba(165,165,160,0.85)'],[0.6,'rgba(140,140,136,0.45)'],[1,'rgba(130,130,130,0)']]),
  dark:  makeSprite([[0,'rgba(28,26,24,0.95)'],[0.55,'rgba(38,36,34,0.7)'],[1,'rgba(50,50,50,0)']]),
  fire:  makeSprite([[0,'rgba(255,255,225,1)'],[0.3,'rgba(255,210,90,0.95)'],[0.65,'rgba(255,110,20,0.6)'],[1,'rgba(200,40,0,0)']]),
};

// ---------- Kamera + Projektion ----------
const CAM={x:0,y:0,z:0,h:0,p:0,r:0,f:[0,0,1],rt:[1,0,0],u:[0,1,0],cx:VW/2,cy:VH*0.46};
function setCam(x,y,z,h,p,r,cy){
  const B=basis(h,p,r);
  CAM.x=x; CAM.y=y; CAM.z=z; CAM.h=h; CAM.p=p; CAM.r=r; CAM.f=B.f; CAM.rt=B.r; CAM.u=B.u; CAM.cx=VW/2; CAM.cy=cy;
}
function setCamB(x,y,z,B,cy){
  CAM.x=x; CAM.y=y; CAM.z=z; CAM.f=B.f; CAM.rt=B.r; CAM.u=B.u; CAM.cx=VW/2; CAM.cy=cy;
}
function lookCam(x,y,z,tx,ty,tz,cy){
  const dx=tx-x, dy=ty-y, dz=tz-z;
  setCam(x,y,z,Math.atan2(dx,dz),Math.atan2(dy,Math.hypot(dx,dz)),0,cy);
}
function toCam(x,y,z){
  const dx=x-CAM.x, dy=y-CAM.y, dz=z-CAM.z, R=CAM.rt, U=CAM.u, F=CAM.f;
  return [dx*R[0]+dy*R[1]+dz*R[2], dx*U[0]+dy*U[1]+dz*U[2], dx*F[0]+dy*F[1]+dz*F[2]];
}
function scr(c){ return [CAM.cx+c[0]/c[2]*FOC, CAM.cy-c[1]/c[2]*FOC]; }
function clipNear(P){
  const out=[];
  for(let i=0;i<P.length;i++){
    const a=P[i], b=P[(i+1)%P.length], ai=a[2]>=NEAR, bi=b[2]>=NEAR;
    if(ai) out.push(a);
    if(ai!==bi){ const t=(NEAR-a[2])/(b[2]-a[2]); out.push([a[0]+(b[0]-a[0])*t, a[1]+(b[1]-a[1])*t, NEAR]); }
  }
  return out;
}
function polyPath(C){
  for(const c of C) if(c[2]<NEAR){ C=clipNear(C); break; }
  if(C.length<3) return false;
  ctx.beginPath();
  for(let i=0;i<C.length;i++){ const s=scr(C[i]); if(i) ctx.lineTo(s[0],s[1]); else ctx.moveTo(s[0],s[1]); }
  ctx.closePath();
  return true;
}
function fillCam(C, fill, stroke){
  if(!polyPath(C)) return;
  ctx.fillStyle=fill; ctx.fill();
  if(stroke){ ctx.strokeStyle=stroke; ctx.lineWidth=SEAM; ctx.stroke(); }
}

// ---------- Kamera je Modus (nur Darstellung) ----------
function setupCamera(){
  if(G.mode==='dead'){
    const a=G.deadT*0.25+P.heading+Math.PI, ty=Math.max(P.y,0);
    lookCam(P.x+Math.sin(a)*90, ty+35, P.z+Math.cos(a)*90, P.x,ty,P.z, VH*0.5);
  } else if(G.extView){
    const B=P.B;
    setCamB(P.x-B.f[0]*17+B.u[0]*3.8, P.y-B.f[1]*17+B.u[1]*3.8, P.z-B.f[2]*17+B.u[2]*3.8, B, VH*0.5);
  } else {
    setCamB(P.x,P.y,P.z,P.B,VH*0.46);
  }
}

// ---------- Zeichnen ----------
let HZ=null, whiteout=0;
function draw(){
  ctx.setTransform(SCALE,0,0,SCALE,0,0);
  ctx.globalAlpha=1; ctx.textAlign='left';
  if(G.mode==='title'){ drawTitle(); return; }
  setupCamera();
  if(G.shake>0&&G.mode==='fly'&&!G.extView){ctx.translate(rnd(-1,1)*G.shake*2,rnd(-1,1)*G.shake*2);}
  renderWorld(null);
  const cockpitView = G.mode==='fly' && !G.extView;
  if(cockpitView&&P.hp<45) drawCockpitSmoke();
  if(G.mode==='fly'){
    // Hohe g-Last: Grau-/Schwarzsehen, negative g: Rotsehen
    const gk=P.gSm;
    if(gk>5){
      const a=clamp((gk-5)/3,0,0.92), rg=ctx.createRadialGradient(VW/2,VH*0.46,Math.max(4,90*(1-a)),VW/2,VH*0.46,200);
      rg.addColorStop(0,'rgba(0,0,0,0)'); rg.addColorStop(0.35,`rgba(0,0,0,${a*0.7})`); rg.addColorStop(1,`rgba(0,0,0,${Math.min(1,a*1.2)})`);
      ctx.fillStyle=rg; ctx.fillRect(-4,-4,VW+8,VH+8);
    } else if(gk<-2){ ctx.fillStyle=`rgba(150,0,0,${clamp((-gk-2)/2.5,0,0.7)})`; ctx.fillRect(-4,-4,VW+8,VH+8); }
    drawTarget(); if(cockpitView) drawSight();
  }
  if(cockpitView&&G.cockpit) drawCockpit();
  if(G.mode==='fly') drawStick(cockpitView&&G.cockpit?46:6, cockpitView&&G.cockpit?120:VH-30);
  drawHud();
  if(G.showMap) drawMap();
  if(G.msgT>0&&G.msg) drawCenterText(G.msg,32);
  if(G.flash>0){ctx.fillStyle=`rgba(170,0,0,${Math.min(0.4,G.flash*0.4)})`;ctx.fillRect(-4,-4,VW+8,VH+8);}
  if(G.mode==='dead'){drawCenterText('ABGESTÜRZT – ENTER / R für Neustart',VH*0.3);drawCenterText('Abschüsse: '+G.kills+'   Punkte: '+G.score+'   Welle: '+G.wave,VH*0.3+13);}
  if(G.paused){ctx.fillStyle='rgba(0,0,0,0.6)';ctx.fillRect(0,0,VW,VH);drawCenterText('PAUSE – Weiter mit P',VH/2-4);}
}

function renderWorld(extra){
  whiteout=0;
  HZ=horizon();
  drawSky();
  drawGround();
  const objs=[];
  const add=(x,y,z,fn)=>{ const dx=x-CAM.x, dy=y-CAM.y, dz=z-CAM.z; objs.push({d:dx*dx+dy*dy+dz*dz, fn}); };
  // Häuser, Hallen, Bäume
  for(const s of statics){
    const dx=s.x-CAM.x, dz=s.z-CAM.z;
    if(dx*dx+dz*dz+CAM.y*CAM.y>s.vis*s.vis) continue;
    if(s.kind==='tree') add(s.x,s.h*0.5,s.z,()=>drawTree(s));
    else add(s.x,4,s.z,()=>drawModel(s.m,s.x,0,s.z,s.B,1,0,false));
  }
  // Wolken
  for(const c of clouds) for(const p of c.puffs){
    const x=c.x+p.dx, y=c.y+p.dy, z=c.z+p.dz;
    add(x,y,z,()=>drawPuff(x,y,z,p.r));
  }
  // Flugzeuge
  for(const e of enemies) if(e.alive||e.dying){
    const B=basis(e.heading,e.pitch,e.roll);
    add(e.x,e.y,e.z,()=>drawModel(MODELS[e.type],e.x,e.y,e.z,B,VIS[e.type],e.hitT>0?Math.min(0.7,e.hitT*2.5):0,true));
  }
  if(G.extView&&G.mode==='fly'){
    const B=P.B;
    add(P.x,P.y,P.z,()=>drawModel(MODELS.bf109,P.x,P.y,P.z,B,1,0,true));
  }
  for(const p of parts) add(p.x,p.y,p.z,()=>drawPart(p));
  for(const b of bullets) add(b.x,b.y,b.z,b.kan?()=>drawTracer(b,26,'rgba(255,235,190,0.6)','#ffffff',1.6):()=>drawTracer(b,20,'rgba(255,170,60,0.55)','#fff3b8'));
  for(const b of ebullets) add(b.x,b.y,b.z,()=>drawTracer(b,16,'rgba(255,80,60,0.55)','#ffe2d6'));
  if(extra) extra(add);
  objs.sort((a,b)=>b.d-a.d);
  for(const o of objs) o.fn();
  ctx.globalAlpha=1;
  if(whiteout>0){ ctx.fillStyle=`rgba(236,240,245,${Math.min(0.88,whiteout)})`; ctx.fillRect(-4,-4,VW+8,VH+8); }
}

// Horizont: Punkt auf der Horizontlinie, Richtung der Linie und Normale zum Boden hin
function horizon(){
  // Sehstrahl zu Bildpunkt (X,Y) = rt*X + u*Y + f*FOC; Horizont wo dessen Höhenanteil 0 ist
  const a=CAM.rt[1], b=CAM.u[1], c=CAM.f[1]*FOC, L=Math.hypot(a,b);
  if(L<1e-6) return {x:VW/2, y:c>0?VH+5000:-5000, dx:1, dy:0, nx:0, ny:1}; // senkrecht: nur Himmel bzw. Boden
  const X0=-a*c/(L*L), Y0=-b*c/(L*L), nx=-a/L, ny=b/L;
  return {x:CAM.cx+X0, y:CAM.cy-Y0, dx:ny, dy:-nx, nx, ny};
}

function drawSky(){
  const h=HZ;
  const g=ctx.createLinearGradient(h.x,h.y,h.x-h.nx*190,h.y-h.ny*190);
  if(G.detail===0){
    const cols=['#c8d5df','#aac3d9','#8fb1d3','#789fcb','#628dc0','#507cb4','#406ca8','#335d9c'];
    for(let i=0;i<8;i++){ g.addColorStop(i/8,cols[i]); g.addColorStop(Math.min(1,(i+1)/8-0.001),cols[i]); }
  } else {
    g.addColorStop(0,'#c8d5df'); g.addColorStop(0.07,'#b1c8dc'); g.addColorStop(0.3,'#86abd2'); g.addColorStop(0.65,'#5585bf'); g.addColorStop(1,'#34609f');
  }
  ctx.fillStyle=g; ctx.fillRect(-10,-10,VW+20,VH+20);
  // Sonne als runde Scheibe mit Schein
  const c=[dot(SUN,CAM.rt),dot(SUN,CAM.u),dot(SUN,CAM.f)];
  if(c[2]>0.1){
    const s=scr(c);
    if(G.detail>0){
      const gl=ctx.createRadialGradient(s[0],s[1],1,s[0],s[1],45);
      gl.addColorStop(0,'rgba(255,252,230,0.75)'); gl.addColorStop(0.25,'rgba(255,245,210,0.25)'); gl.addColorStop(1,'rgba(255,240,200,0)');
      ctx.fillStyle=gl; ctx.fillRect(s[0]-45,s[1]-45,90,90);
    }
    ctx.fillStyle='#fffbea'; ctx.beginPath(); ctx.arc(s[0],s[1],4.5,0,Math.PI*2); ctx.fill();
  }
}

// Bodenverlauf: Bildabstand unter dem Horizont ~ FOC*Höhe/Entfernung → Dunst nach Entfernung
function groundGrad(base,Dmin){
  const h=HZ, alt=Math.max(4,CAM.y), o=FOC*alt/Dmin;
  const g=ctx.createLinearGradient(h.x,h.y,h.x+h.nx*o,h.y+h.ny*o);
  g.addColorStop(0,css(HAZE));
  for(const D of [80000,40000,20000,10000,5000,2500,1200,600,300]){ if(D<=Dmin) break; g.addColorStop(Dmin/D,css(mix(base,HAZE,fogK(D)))); }
  g.addColorStop(1,css(mix(base,HAZE,fogK(Dmin))));
  return g;
}
function drawGround(){
  const h=HZ, E=4000;
  ctx.fillStyle=groundGrad(LANDFAR,2500);
  ctx.beginPath();
  ctx.moveTo(h.x-h.dx*E,h.y-h.dy*E); ctx.lineTo(h.x+h.dx*E,h.y+h.dy*E);
  ctx.lineTo(h.x+h.dx*E+h.nx*E,h.y+h.dy*E+h.ny*E); ctx.lineTo(h.x-h.dx*E+h.nx*E,h.y-h.dy*E+h.ny*E);
  ctx.closePath(); ctx.fill();
  drawCells();
  for(const pt of patches) drawPatch(pt);
  // Strand, Ärmelkanal, englische Küste am Horizont
  const X0=Math.floor((CAM.x-50000)/1000)*1000, X1=X0+100000;
  const beach=[], sea=[];
  for(let x=CAM.x-20000;x<=CAM.x+20000;x+=500) beach.push(toCam(x,0,coastZ(x)-80));
  for(let x=CAM.x+20000;x>=CAM.x-20000;x-=500) beach.push(toCam(x,0,coastZ(x)+5));
  fillCam(beach,groundGrad(SAND,400),null);
  for(let x=X0;x<=X1;x+=1000) sea.push(toCam(x,0,coastZ(x)));
  const zf=Math.max(CAM.z,coastZ(CAM.x))+150000;
  sea.push(toCam(X1,0,zf)); sea.push(toCam(X0,0,zf));
  fillCam(sea,groundGrad(SEA,400),null);
  const eng=[];
  for(let x=X0;x<=X1;x+=4000) eng.push(toCam(x,0,englandZ(x)));
  eng.push(toCam(X1,0,zf+50000)); eng.push(toCam(X0,0,zf+50000));
  fillCam(eng,groundGrad(LANDFAR,400),null);
}
function drawCells(){
  const S=500, R=G.detail>=1?7000:5000;
  const i0=Math.floor((CAM.x-R)/S), i1=Math.floor((CAM.x+R)/S), j0=Math.floor((CAM.z-R)/S), j1=Math.floor((CAM.z+R)/S);
  for(let i=i0;i<=i1;i++) for(let j=j0;j<=j1;j++){
    const x0=i*S, z0=j*S, xc=x0+S/2, zc=z0+S/2;
    const dh=Math.hypot(xc-CAM.x,zc-CAM.z);
    if(dh>R) continue;
    if(z0>coastZ(xc)+250) continue; // reine Wasserzelle
    const c1=toCam(x0,0,z0), c2=toCam(x0+S,0,z0), c3=toCam(x0+S,0,z0+S), c4=toCam(x0,0,z0+S);
    if(c1[2]<NEAR&&c2[2]<NEAR&&c3[2]<NEAR&&c4[2]<NEAR) continue;
    const d=Math.hypot(dh,CAM.y);
    let col=FIELD_COLS[(hash2(i,j)*FIELD_COLS.length)|0];
    col=mix(col,LANDFAR,clamp((d-R*0.6)/(R*0.4),0,1));
    const fog=fogK(d), fill=css(mix(col,HAZE,fog));
    const hedge = G.detail>=1 && d<3500 ? css(mix(HEDGE,HAZE,fog)) : fill;
    fillCam([c1,c2,c3,c4],fill,hedge);
    // Ackerfurchen in der Nähe (Geschwindigkeitsgefühl im Tiefflug)
    const hv=hash2(j,i);
    if(G.detail>=1&&d<2500&&hv<0.6){
      const sc=css(mix(mix(col,[20,20,10],0.13),HAZE,fog)), alongX=hv<0.3;
      for(let s=0;s<6;s+=2){
        const a=x0+S*s/6, b=x0+S*(s+1)/6, za=z0+S*s/6, zb=z0+S*(s+1)/6;
        fillCam(alongX ? [toCam(a,0,z0),toCam(b,0,z0),toCam(b,0,z0+S),toCam(a,0,z0+S)]
                       : [toCam(x0,0,za),toCam(x0+S,0,za),toCam(x0+S,0,zb),toCam(x0,0,zb)], sc, null);
      }
    }
  }
}
function drawPatch(pt){
  const d=Math.hypot(pt.x-CAM.x,pt.z-CAM.z,CAM.y);
  if(d>pt.vis) return;
  fillCam(pt.pts.map(p=>toCam(p[0],0,p[1])), css(mix(pt.c,HAZE,fogK(d))), null);
}

function drawTree(s){
  const b=toCam(s.x,0,s.z); if(b[2]<NEAR) return;
  const t=toCam(s.x,s.h,s.z); if(t[2]<NEAR) return;
  const sb=scr(b), st=scr(t), w=s.h*0.3*FOC/b[2];
  if(w<0.2) return;
  const fog=fogK(Math.hypot(s.x-CAM.x,CAM.y,s.z-CAM.z));
  const mx=sb[0]+(st[0]-sb[0])*0.15, my=sb[1]+(st[1]-sb[1])*0.15;
  let px=-(st[1]-sb[1]), py=st[0]-sb[0]; const L=Math.hypot(px,py)||1; px=px/L*w; py=py/L*w;
  ctx.fillStyle=css(mix(hex('#1d3719'),HAZE,fog));
  ctx.beginPath(); ctx.moveTo(st[0],st[1]); ctx.lineTo(mx,my); ctx.lineTo(mx-px,my-py); ctx.closePath(); ctx.fill();
  ctx.fillStyle=css(mix(hex('#36602b'),HAZE,fog));
  ctx.beginPath(); ctx.moveTo(st[0],st[1]); ctx.lineTo(mx,my); ctx.lineTo(mx+px,my+py); ctx.closePath(); ctx.fill();
}

function lightK(n){ return 0.5+0.12*n[1]+0.62*Math.max(0,dot(n,SUN)); }
function shadeCss(c,k,fog,flash){
  let r=c[0]*k, g=c[1]*k, b=c[2]*k;
  if(flash>0){ r+=(255-r)*flash; g+=(250-g)*flash; b+=(215-b)*flash; }
  return css([r+(HAZE[0]-r)*fog, g+(HAZE[1]-g)*fog, b+(HAZE[2]-b)*fog]);
}
// Polygonmodell mit Flat-Shading, Backface-Culling und Maler-Sortierung
function drawModel(M,px,py,pz,B,sc,flash,isAc){
  const c0=toCam(px,py,pz), R=M.rad*sc;
  if(c0[2]<-R) return;
  const dist=Math.hypot(px-CAM.x,py-CAM.y,pz-CAM.z), fog=fogK(dist);
  if(c0[2]>R){
    const s=scr(c0), rp=R*FOC/c0[2];
    if(s[0]+rp<-4||s[0]-rp>VW+4||s[1]+rp<-4||s[1]-rp>VH+4) return;
    if(rp<1.2){
      if(!isAc) return;
      const q=Math.max(rp*1.1,2/SCALE);
      ctx.fillStyle=css(mix([40,42,44],HAZE,fog*0.8)); ctx.fillRect(s[0]-q/2,s[1]-q/2,q,q);
      return;
    }
  }
  const Rt=CAM.rt, U=CAM.u, Fw=CAM.f;
  const ax=[dot(B.r,Rt),dot(B.r,U),dot(B.r,Fw)], ay=[dot(B.u,Rt),dot(B.u,U),dot(B.u,Fw)], az=[dot(B.f,Rt),dot(B.f,U),dot(B.f,Fw)];
  const V=M.v, cv=new Array(V.length);
  for(let i=0;i<V.length;i++){
    const v=V[i], x=v[0]*sc, y=v[1]*sc, z=v[2]*sc;
    cv[i]=[c0[0]+x*ax[0]+y*ay[0]+z*az[0], c0[1]+x*ax[1]+y*ay[1]+z*az[1], c0[2]+x*ax[2]+y*ay[2]+z*az[2]];
  }
  const vis=[];
  for(const f of M.f){
    const n=f.n, nc0=n[0]*ax[0]+n[1]*ay[0]+n[2]*az[0], nc1=n[0]*ax[1]+n[1]*ay[1]+n[2]*az[1], nc2=n[0]*ax[2]+n[1]*ay[2]+n[2]*az[2];
    const p=cv[f.i[0]], front=nc0*p[0]+nc1*p[1]+nc2*p[2]<0;
    if(!front&&!f.ds) continue;
    let z=0; for(const i of f.i) z+=cv[i][2];
    vis.push({f,z:z/f.i.length,front});
  }
  vis.sort((a,b)=>b.z-a.z);
  for(const it of vis){
    const f=it.f;
    if(f.flat){ ctx.globalAlpha=1-fog; fillCam(f.i.map(i=>cv[i]),f.c,null); ctx.globalAlpha=1; continue; }
    const n=f.n;
    let wn=[n[0]*B.r[0]+n[1]*B.u[0]+n[2]*B.f[0], n[0]*B.r[1]+n[1]*B.u[1]+n[2]*B.f[1], n[0]*B.r[2]+n[1]*B.u[2]+n[2]*B.f[2]];
    if(!it.front) wn=[-wn[0],-wn[1],-wn[2]];
    const k=lightK(wn), col=shadeCss(f.c,k,fog,flash);
    fillCam(f.i.map(i=>cv[i]),col,col);
    for(const s of f.sub) fillCam(s.i.map(i=>cv[i]),shadeCss(s.c,k,fog,flash),null);
  }
}

function drawPuff(x,y,z,r){
  const c=toCam(x,y,z), d=Math.hypot(x-CAM.x,y-CAM.y,z-CAM.z);
  if(d<r){ whiteout=Math.max(whiteout,(1-d/r)*1.3); return; }
  if(c[2]<r*0.5) return;
  const s=scr(c), size=r*FOC/c[2]*2.2;
  if(s[0]+size<0||s[0]-size>VW||s[1]+size<0||s[1]-size>VH) return;
  ctx.globalAlpha=0.92*(1-fogK(d)*0.85)*clamp((c[2]-r*0.5)/r,0,1);
  ctx.drawImage(SPR.cloud,s[0]-size/2,s[1]-size/2,size,size);
  ctx.globalAlpha=1;
}

function drawPart(p){
  const c=toCam(p.x,p.y,p.z); if(c[2]<NEAR) return;
  const s=scr(c), k=Math.max(0,p.life/p.max);
  if(p.kind==='spark'){
    const q=Math.max(1.5/SCALE,0.8);
    ctx.fillStyle=k>0.5?'#fff6c8':'#ffb040'; ctx.fillRect(s[0]-q/2,s[1]-q/2,q,q); return;
  }
  if(p.kind==='debris'){
    const q=Math.max(1.5/SCALE,1.2*FOC/c[2]);
    ctx.fillStyle='#2a2522'; ctx.fillRect(s[0]-q/2,s[1]-q/2,q,q); return;
  }
  const r=(p.r0+(p.r1-p.r0)*(1-k))*FOC/c[2];
  if(r<0.3||s[0]+r<0||s[0]-r>VW||s[1]+r<0||s[1]-r>VH) return;
  const spr=p.kind==='fire'?SPR.fire:((p.kind==='flak'||p.kind==='dsmoke')?SPR.dark:SPR.smoke);
  const fog=fogK(Math.hypot(p.x-CAM.x,p.y-CAM.y,p.z-CAM.z));
  ctx.globalAlpha=(p.kind==='fire'?Math.min(1,k*1.6):(p.kind==='flak'?Math.min(0.9,k*1.2):Math.min(0.55,k*0.8)))*(1-fog*0.8);
  ctx.drawImage(spr,s[0]-r,s[1]-r,r*2,r*2);
  ctx.globalAlpha=1;
}

// Leuchtspur als 3D-Strich
function drawTracer(b,len,glow,core,wm){
  const n=Math.hypot(b.vx,b.vy,b.vz)||1;
  let a=toCam(b.x-b.vx/n*len,b.y-b.vy/n*len,b.z-b.vz/n*len), c=toCam(b.x,b.y,b.z);
  if(a[2]<NEAR&&c[2]<NEAR) return;
  if(a[2]<NEAR){ const t=(NEAR-a[2])/(c[2]-a[2]); a=[a[0]+(c[0]-a[0])*t,a[1]+(c[1]-a[1])*t,NEAR]; }
  if(c[2]<NEAR){ const t=(NEAR-c[2])/(a[2]-c[2]); c=[c[0]+(a[0]-c[0])*t,c[1]+(a[1]-c[1])*t,NEAR]; }
  const s1=scr(a), s2=scr(c), w=clamp(90/Math.max(c[2],1),0.5,2)*(wm||1);
  ctx.lineCap='round';
  ctx.strokeStyle=glow; ctx.lineWidth=w;
  ctx.beginPath(); ctx.moveTo(s1[0],s1[1]); ctx.lineTo(s2[0],s2[1]); ctx.stroke();
  ctx.strokeStyle=core; ctx.lineWidth=w*0.45;
  ctx.beginPath(); ctx.moveTo(s1[0],s1[1]); ctx.lineTo(s2[0],s2[1]); ctx.stroke();
  ctx.lineCap='butt';
}

// Zielanzeige: Klammer + Typ + Entfernung, Vorhaltepunkt, Randpfeil wenn außer Sicht
function drawTarget(){
  const e=G.target; if(!e||!e.alive) return;
  const c=toCam(e.x,e.y,e.z), dist=dist3(e.x,e.y,e.z,P.x,P.y,P.z);
  const col='rgba(255,196,80,0.95)';
  const bottom=(G.cockpit&&!G.extView)?146:VH-6;
  ctx.strokeStyle=col; ctx.fillStyle=col; ctx.lineWidth=0.7; ctx.font='5px '+MONO; ctx.textAlign='center';
  let on=false, s=null;
  if(c[2]>NEAR){ s=scr(c); on=s[0]>6&&s[0]<VW-6&&s[1]>14&&s[1]<bottom; }
  if(on){
    const r=clamp(MODELS[e.type].rad*VIS[e.type]*FOC/c[2]*0.8,5,60), q=Math.max(2,r*0.35);
    ctx.beginPath();
    for(const [sx,sy] of [[-1,-1],[1,-1],[1,1],[-1,1]]){
      ctx.moveTo(s[0]+sx*r,s[1]+sy*(r-q)); ctx.lineTo(s[0]+sx*r,s[1]+sy*r); ctx.lineTo(s[0]+sx*(r-q),s[1]+sy*r);
    }
    ctx.stroke();
    ctx.fillText(TYPE_NAME[e.type]+'  '+Math.round(dist)+' m',s[0],s[1]+r+6);
    const hp=Math.max(0,e.hp/e.maxHp), bw=18;
    ctx.fillStyle='rgba(0,0,0,0.6)'; ctx.fillRect(s[0]-bw/2-0.5,s[1]-r-4,bw+1,2);
    ctx.fillStyle=hp>0.55?'#7ee07e':(hp>0.25?'#ffd040':'#ff5040'); ctx.fillRect(s[0]-bw/2,s[1]-r-3.5,bw*hp,1);
    // Vorhaltepunkt: wohin zielen, damit die Garbe trifft (Geschosse erben die eigene Fahrt)
    if(!G.extView&&dist<800){
      const kan=P.weapon===1, t=dist/(kan?750:900), gw=kan?9.8:4;
      const lc=toCam(e.x+(e.vx-P.V[0])*t, e.y+(e.vy-P.V[1])*t+0.5*gw*t*t, e.z+(e.vz-P.V[2])*t);
      if(lc[2]>NEAR){
        const l=scr(lc);
        ctx.strokeStyle='rgba(255,220,120,0.95)'; ctx.lineWidth=0.7;
        ctx.beginPath(); ctx.arc(l[0],l[1],2.5,0,Math.PI*2); ctx.stroke();
        ctx.fillStyle='rgba(255,220,120,0.95)'; ctx.fillRect(l[0]-0.5,l[1]-0.5,1,1);
      }
    }
  } else {
    let dx=c[0], dy=-c[1];
    if(c[2]<=NEAR&&Math.hypot(dx,dy)<1e-3) dy=1;
    const L=Math.hypot(dx,dy)||1; dx/=L; dy/=L;
    const ry=(bottom-14)/2-8, cy=14+(bottom-14)/2;
    const ax=VW/2+dx*(VW/2-18), ay=cy+dy*ry;
    ctx.beginPath();
    ctx.moveTo(ax+dx*6,ay+dy*6); ctx.lineTo(ax-dy*3.5,ay+dx*3.5); ctx.lineTo(ax+dy*3.5,ay-dx*3.5); ctx.closePath(); ctx.fill();
    ctx.fillText(Math.round(dist)+' m',ax-dx*9,ay-dy*9+2);
  }
  ctx.textAlign='left';
}

function drawSight(){
  // Revi-Reflexvisier: Kreis, Strich-Kreuz, Mittelpunkt
  const cx=VW/2, cy=CAM.cy;
  ctx.strokeStyle='rgba(255,150,50,0.9)'; ctx.fillStyle='rgba(255,150,50,0.9)'; ctx.lineWidth=0.7;
  ctx.beginPath(); ctx.arc(cx,cy,11,0,Math.PI*2); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx-17,cy); ctx.lineTo(cx-4,cy); ctx.moveTo(cx+4,cy); ctx.lineTo(cx+17,cy);
  ctx.moveTo(cx,cy+4); ctx.lineTo(cx,cy+15); ctx.moveTo(cx,cy-4); ctx.lineTo(cx,cy-8);
  ctx.stroke();
  ctx.fillRect(cx-0.6,cy-0.6,1.2,1.2);
  // Treffer-Bestätigung: gelbes X bei Treffer, rotes Kreuz bei Abschuss
  if(G.hitKill>0){
    ctx.strokeStyle='#ff3020';ctx.lineWidth=1.4;
    ctx.beginPath(); ctx.moveTo(cx-7,cy-7);ctx.lineTo(cx+7,cy+7); ctx.moveTo(cx+7,cy-7);ctx.lineTo(cx-7,cy+7); ctx.stroke();
    ctx.fillStyle='#ff3020';ctx.font='bold 6px '+MONO;ctx.textAlign='center';ctx.fillText('ABSCHUSS!',cx,cy-15);ctx.textAlign='left';
  } else if(G.hitMark>0){
    ctx.strokeStyle='#ffff40';ctx.lineWidth=0.9;
    ctx.beginPath(); ctx.moveTo(cx-6,cy-6);ctx.lineTo(cx-3,cy-3); ctx.moveTo(cx+6,cy-6);ctx.lineTo(cx+3,cy-3);
    ctx.moveTo(cx-6,cy+6);ctx.lineTo(cx-3,cy+3); ctx.moveTo(cx+6,cy+6);ctx.lineTo(cx+3,cy+3); ctx.stroke();
  }
  const low=P.weapon===1?P.ammoKan<30:(P.weapon===0?P.ammoMG<100:(P.ammoMG<100&&P.ammoKan<30));
  if(low){ctx.fillStyle='#ff4030';ctx.font='5px '+MONO;ctx.textAlign='center';ctx.fillText('MUNITION KNAPP',cx,cy+24);ctx.textAlign='left';}
}

function drawCockpitSmoke(){
  const t=performance.now()/1000;
  for(let i=0;i<3;i++){
    const r=18+i*6, x=VW/2+Math.sin(t*1.7+i*2)*30, y=128-((t*40+i*25)%60);
    ctx.globalAlpha=P.hp<25?0.45:0.25;
    ctx.drawImage(P.hp<25?SPR.dark:SPR.smoke,x-r,y-r,r*2,r*2);
  }
  ctx.globalAlpha=1;
}

function drawCockpit(){
  // Haubenstreben
  ctx.fillStyle='#2b2f31';
  ctx.beginPath(); ctx.moveTo(2,0); ctx.lineTo(10,0); ctx.lineTo(40,152); ctx.lineTo(31,152); ctx.closePath(); ctx.fill();
  ctx.beginPath(); ctx.moveTo(VW-2,0); ctx.lineTo(VW-10,0); ctx.lineTo(VW-40,152); ctx.lineTo(VW-31,152); ctx.closePath(); ctx.fill();
  ctx.strokeStyle='#4a5053'; ctx.lineWidth=0.6;
  ctx.beginPath(); ctx.moveTo(10,0); ctx.lineTo(40,152); ctx.moveTo(VW-10,0); ctx.lineTo(VW-40,152); ctx.stroke();
  // Instrumentenbrett mit gewölbter Oberkante
  const g=ctx.createLinearGradient(0,142,0,VH);
  g.addColorStop(0,'#383c3f'); g.addColorStop(1,'#1c1f21');
  ctx.fillStyle=g;
  ctx.beginPath(); ctx.moveTo(0,VH); ctx.lineTo(0,154); ctx.quadraticCurveTo(VW/2,138,VW,154); ctx.lineTo(VW,VH); ctx.closePath(); ctx.fill();
  ctx.strokeStyle='#121416'; ctx.lineWidth=1.4;
  ctx.beginPath(); ctx.moveTo(0,154); ctx.quadraticCurveTo(VW/2,138,VW,154); ctx.stroke();
  // Revi-Sockel
  ctx.fillStyle='rgba(170,215,225,0.14)';
  ctx.beginPath(); ctx.moveTo(153,140); ctx.lineTo(167,140); ctx.lineTo(165,130); ctx.lineTo(155,130); ctx.closePath(); ctx.fill();
  ctx.strokeStyle='rgba(200,230,235,0.35)'; ctx.lineWidth=0.4; ctx.stroke();
  const rg=ctx.createLinearGradient(0,139,0,148); rg.addColorStop(0,'#4a4f53'); rg.addColorStop(1,'#1c1f21');
  ctx.fillStyle=rg; ctx.beginPath(); ctx.moveTo(151,148); ctx.lineTo(152.5,140); ctx.lineTo(167.5,140); ctx.lineTo(169,148); ctx.closePath(); ctx.fill();
  // Instrumente
  const alt=Math.max(0,P.y);
  gauge(34,177,14,[{f:P.ias/750}],'km/h',Math.round(P.ias));
  gauge(74,177,14,[{f:(alt%1000)/1000,full:true},{f:alt/10000,full:true,len:0.55,w:1.3}],'Höhe',Math.round(alt)+' m');
  const vs=P.vy||0;
  gauge(114,177,14,[{f:(clamp(vs,-30,30)+30)/60}],'m/s',(vs>=0?'+':'')+Math.round(vs));
  compass(160,179,13);
  const rpm=1000+P.throttle*1800;
  gauge(206,177,14,[{f:(rpm-600)/2400}],'U/min',Math.round(rpm/10)*10);
  const ata=0.6+P.throttle*0.82;
  gauge(246,177,14,[{f:(ata-0.5)/1.3}],'ata',ata.toFixed(2));
  // Zelle + Munition als Balken, Lampen für Fahrwerk / Klappen
  bar(268,160,'ZELLE',P.hp/100,P.hp>50?'#7ee07e':(P.hp>25?'#ffd040':'#ff5040'));
  bar(283,160,P.weapon===1?'mg':'MG',P.ammoMG/AMMO_MG,P.weapon===1?'#9a8a60':'#ffd070');
  bar(298,160,P.weapon===0?'kan':'KAN',P.ammoKan/AMMO_KAN,P.weapon===0?'#9a8a60':'#ffb050');
  lamp(277,196,'FW',P.gear); lamp(302,196,'KL',P.flaps);
}
// Knüppel + Pedale + Trimmung + Anstellwinkel (zeigt, was Maus/Tastatur gerade kommandieren)
function drawStick(x,y){
  const S=20;
  ctx.fillStyle='rgba(0,0,0,0.45)'; ctx.fillRect(x-2,y-7,S+14,S+13);
  ctx.strokeStyle='rgba(200,220,210,0.5)'; ctx.lineWidth=0.4; ctx.strokeRect(x,y,S,S);
  ctx.beginPath(); ctx.moveTo(x+S/2,y); ctx.lineTo(x+S/2,y+S); ctx.moveTo(x,y+S/2); ctx.lineTo(x+S,y+S/2); ctx.stroke();
  const sx=clamp(P.sx+MOUSE.x,-1,1), sy=clamp(P.sy+MOUSE.y,-1,1);
  ctx.fillStyle='#ffd070'; ctx.beginPath(); ctx.arc(x+S/2+sx*S/2,y+S/2+sy*S/2,1.3,0,Math.PI*2); ctx.fill();
  // Pedale
  ctx.fillStyle='rgba(200,220,210,0.35)'; ctx.fillRect(x,y+S+2,S,1.2);
  ctx.fillStyle='#ffd070'; ctx.fillRect(x+S/2+P.sr*S/2-0.8,y+S+1.5,1.6,2.2);
  // Trimmung (Dreieck am rechten Rand)
  const ty=y+S/2-clamp((P.trim-0.05)/0.15,-1,1)*S/2;
  ctx.fillStyle='#9fe0ff'; ctx.beginPath(); ctx.moveTo(x+S+0.5,ty); ctx.lineTo(x+S+3,ty-1.5); ctx.lineTo(x+S+3,ty+1.5); ctx.closePath(); ctx.fill();
  // Anstellwinkel bis zum Abriss
  const aS=P.flaps?FM.aSflap:FM.aS, af=clamp(P.alpha/aS,0,1.2);
  ctx.fillStyle='rgba(0,0,0,0.6)'; ctx.fillRect(x+S+5,y,3,S);
  ctx.fillStyle=af>1?'#ff4030':(af>0.85?'#ffd040':'#7ee07e'); ctx.fillRect(x+S+5,y+S-S*Math.min(1,af),3,S*Math.min(1,af));
  ctx.fillStyle='#bfbfb2'; ctx.font='3.5px '+MONO; ctx.fillText('KNÜPPEL  α',x,y-2);
}
function gauge(x,y,r,needles,label,txt){
  ctx.fillStyle='#46494c'; ctx.beginPath(); ctx.arc(x,y,r+1.6,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='#0c0e0f'; ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
  const A0=Math.PI*0.75, SW=Math.PI*1.5;
  ctx.strokeStyle='#d8d8cc'; ctx.lineWidth=0.4;
  ctx.beginPath();
  for(let t=0;t<=10;t++){ const a=A0+SW*t/10, r1=r*(t%5===0?0.7:0.82);
    ctx.moveTo(x+Math.cos(a)*r1,y+Math.sin(a)*r1); ctx.lineTo(x+Math.cos(a)*r*0.94,y+Math.sin(a)*r*0.94); }
  ctx.stroke();
  ctx.textAlign='center';
  ctx.fillStyle='#bfbfb2'; ctx.font='3.5px '+MONO; ctx.fillText(label,x,y-r*0.3);
  ctx.fillStyle='#ffc860'; ctx.font='4px '+MONO; ctx.fillText(String(txt),x,y+r*0.62);
  ctx.textAlign='left';
  for(const n of needles){
    const a=n.full?(-Math.PI/2+Math.PI*2*n.f):(A0+SW*clamp(n.f,0,1)), l=r*(n.len||0.86);
    ctx.strokeStyle='#f4f4ea'; ctx.lineWidth=n.w||0.8;
    ctx.beginPath(); ctx.moveTo(x,y); ctx.lineTo(x+Math.cos(a)*l,y+Math.sin(a)*l); ctx.stroke();
  }
  ctx.fillStyle='#777'; ctx.beginPath(); ctx.arc(x,y,1,0,Math.PI*2); ctx.fill();
}
function compass(x,y,r){
  ctx.fillStyle='#46494c'; ctx.beginPath(); ctx.arc(x,y,r+1.6,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='#0c0e0f'; ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
  const hd=P.heading;
  ctx.textAlign='center'; ctx.font='4px '+MONO;
  const lab=['N','O','S','W'];
  ctx.strokeStyle='#d8d8cc'; ctx.lineWidth=0.4; ctx.beginPath();
  for(let k=0;k<12;k++){ const a=k*Math.PI/6-hd-Math.PI/2;
    ctx.moveTo(x+Math.cos(a)*r*0.8,y+Math.sin(a)*r*0.8); ctx.lineTo(x+Math.cos(a)*r*0.94,y+Math.sin(a)*r*0.94); }
  ctx.stroke();
  for(let k=0;k<4;k++){ const a=k*Math.PI/2-hd-Math.PI/2;
    ctx.fillStyle=k===0?'#ff7050':'#d8d8cc'; ctx.fillText(lab[k],x+Math.cos(a)*r*0.58,y+Math.sin(a)*r*0.58+1.4); }
  ctx.fillStyle='#ffc860'; ctx.beginPath(); ctx.moveTo(x,y-r+0.5); ctx.lineTo(x-1.5,y-r-2); ctx.lineTo(x+1.5,y-r-2); ctx.closePath(); ctx.fill();
  const deg=Math.round(((hd*180/Math.PI)%360+360)%360);
  ctx.font='3.5px '+MONO; ctx.fillText(String(deg).padStart(3,'0')+'°',x,y+1.2);
  ctx.textAlign='left';
}
function bar(x,y,label,f,col){
  ctx.fillStyle='#0c0e0f'; ctx.fillRect(x,y,12,26);
  ctx.strokeStyle='#46494c'; ctx.lineWidth=0.8; ctx.strokeRect(x-0.4,y-0.4,12.8,26.8);
  const h=24*clamp(f,0,1); ctx.fillStyle=col; ctx.fillRect(x+2,y+25-h,8,h);
  ctx.fillStyle='#bfbfb2'; ctx.font='3.5px '+MONO; ctx.textAlign='center'; ctx.fillText(label,x+6,y-1.5); ctx.textAlign='left';
}
function lamp(x,y,label,on){
  ctx.fillStyle=on?'#50ff60':'#3a1a1a'; ctx.beginPath(); ctx.arc(x-4,y-1.2,1.6,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='#bfbfb2'; ctx.font='3.5px '+MONO; ctx.fillText(label,x-1.5,y);
}

function drawHud(){
  const inCockpit=G.mode==='fly'&&!G.extView&&G.cockpit;
  ctx.fillStyle=inCockpit?'#24282b':'rgba(0,0,0,0.45)'; ctx.fillRect(0,0,VW,10);
  ctx.font='6px '+MONO;
  const kurs=String(Math.round(((P.heading*180/Math.PI)%360+360)%360)).padStart(3,'0');
  ctx.fillStyle='#a8e8a0';
  if(!inCockpit) ctx.font='5px '+MONO;
  ctx.fillText(`${Math.round(P.ias)} km/h  ${Math.round(Math.max(0,P.y))} m  Kurs ${kurs}°  ${P.nz.toFixed(1)} g  ${WEAPON_NAME[P.weapon]}`+(inCockpit?'':`  Zelle ${Math.round(P.hp)}%  MG ${Math.floor(P.ammoMG)}  Kan ${P.ammoKan}`+(P.gear?'  FW':'')+(P.flaps?'  KL':'')),4,7);
  ctx.font='6px '+MONO;
  ctx.fillStyle='#ffc868'; ctx.textAlign='right';
  ctx.fillText(`Abschüsse ${G.kills}  Welle ${G.wave}  Punkte ${G.score}`,VW-4,7);
  ctx.textAlign='left';
  if(G.mode==='fly'&&Math.floor(performance.now()/300)%2===0){
    const warn=P.stall&&!P.onGround?'ABRISS':(P.ias>720?'ÜBERGESCHWINDIGKEIT':(P.nz>7.8?'ÜBERLAST':(P.y<150&&!P.gear&&P.V[1]<-3?'BODENNÄHE':'')));
    if(warn){ ctx.fillStyle='#ff4030'; ctx.font='bold 6px '+MONO; ctx.textAlign='center'; ctx.fillText(warn,VW/2,19); ctx.textAlign='left'; }
  }
}

function drawMap(){
  const mx=VW-82,my=13,mw=78,mh=58, R=9000;
  ctx.fillStyle='rgba(8,14,20,0.82)';ctx.fillRect(mx,my,mw,mh);
  ctx.strokeStyle='#4aa8b0';ctx.lineWidth=0.6;ctx.strokeRect(mx+0.5,my+0.5,mw-1,mh-1);
  const toM=(x,z)=>[mx+mw/2+(x-P.x)/R*mw/2, my+mh/2-(z-P.z)/R*mh/2];
  ctx.save(); ctx.beginPath(); ctx.rect(mx+1,my+1,mw-2,mh-2); ctx.clip();
  // Küste
  ctx.fillStyle='rgba(40,90,130,0.6)'; ctx.beginPath();
  for(let x=P.x-R*1.2;x<=P.x+R*1.2;x+=400){ const p=toM(x,coastZ(x)); if(x===P.x-R*1.2) ctx.moveTo(p[0],p[1]); else ctx.lineTo(p[0],p[1]); }
  ctx.lineTo(mx+mw+10,my-10); ctx.lineTo(mx-10,my-10); ctx.closePath(); ctx.fill();
  const dot2=(x,z,col,s)=>{ const p=toM(x,z); ctx.fillStyle=col; ctx.fillRect(p[0]-s/2,p[1]-s/2,s,s); };
  dot2(0,0,'#ffffff',2.5);
  for(const f of flak) dot2(f.x,f.z,'#c07030',1.6);
  for(const e of enemies) if(e.alive){
    dot2(e.x,e.z,e.type==='b17'?'#ff60ff':'#ff4040',2);
    if(e===G.target){ const p=toM(e.x,e.z); ctx.strokeStyle='#ffc450'; ctx.lineWidth=0.6; ctx.beginPath(); ctx.arc(p[0],p[1],3,0,Math.PI*2); ctx.stroke(); }
  }
  ctx.restore();
  // Spieler-Pfeil (Norden oben)
  const cx=mx+mw/2, cy=my+mh/2, s=Math.sin(P.heading), c=Math.cos(P.heading);
  ctx.fillStyle='#60ff70'; ctx.beginPath();
  ctx.moveTo(cx+s*4,cy-c*4); ctx.lineTo(cx-c*2.5-s*2.5,cy-s*2.5+c*2.5); ctx.lineTo(cx+c*2.5-s*2.5,cy+s*2.5+c*2.5); ctx.closePath(); ctx.fill();
  ctx.fillStyle='#7cc8d0';ctx.font='4px '+MONO;ctx.fillText('KARTE (M)  N↑',mx+2,my+5);
}

function drawCenterText(t,y=VH/2){
  ctx.font='bold 7px '+MONO;
  const w=ctx.measureText(t).width;
  ctx.fillStyle='rgba(0,0,0,0.6)';ctx.fillRect(VW/2-w/2-4,y-8,w+8,11);
  ctx.fillStyle='#ffe070';ctx.fillText(t,VW/2-w/2,y);
}

const TITLE_B109 = basis(0.4,0.05,-0.3);
const TITLE_SPIT = basis(3.7,0.08,0.55);
function drawTitle(){
  const t=performance.now()/1000;
  const T=[0,1600,0], a=t*0.2;
  lookCam(T[0]+Math.sin(a)*16, T[1]+3+Math.sin(t*0.37)*1.5, T[2]+Math.cos(a)*16, T[0],T[1]-0.5,T[2], VH*0.52);
  renderWorld(add=>{
    add(T[0],T[1],T[2],()=>drawModel(MODELS.bf109,T[0],T[1],T[2],TITLE_B109,1,0,true));
    add(60,1625,140,()=>drawModel(MODELS.spit,60,1625,140,TITLE_SPIT,1,0,true));
  });
  ctx.fillStyle='rgba(0,0,0,0.35)'; ctx.fillRect(0,10,VW,36);
  ctx.textAlign='center';
  ctx.font='bold 18px Georgia, "Times New Roman", serif';
  ctx.fillStyle='#1a1408'; ctx.fillText('ACES ÜBER EUROPA',VW/2+1,33);
  ctx.fillStyle='#ffd27a'; ctx.fillText('ACES ÜBER EUROPA',VW/2,32);
  ctx.font='6px '+MONO; ctx.fillStyle='#ececec';
  ctx.fillText('BROWSER-EDITION  ·  Bf 109 G-6  ·  KANALFRONT 1944',VW/2,42);
  ctx.fillStyle='rgba(0,0,0,0.55)'; ctx.fillRect(34,152,252,42);
  ctx.fillStyle='#ffffff'; ctx.font='bold 7px '+MONO;
  ctx.fillText('ENTER = START      H = HILFE',VW/2,163);
  ctx.font='5px '+MONO; ctx.fillStyle='#d8d8d8';
  ctx.fillText('Pfeile steuern · Leertaste feuert · T Ziel · K Außenansicht',VW/2,172);
  ctx.fillStyle='#9a9a9a';
  ctx.fillText('Fan-Hommage, kein Original-Remake',VW/2,189);
  if(Math.floor(t*2)%2===0){ ctx.fillStyle='#ffd27a'; ctx.font='bold 6px '+MONO; ctx.fillText('— BEREIT —',VW/2,181); }
  ctx.textAlign='left';
}

// ---------- Loop ----------
let last=performance.now();
function loop(now){
  let dt=(now-last)/1000; last=now;
  dt=Math.min(0.05,dt);
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

// init
const GAME_VERSION = 'v3.0-Polygon';
buildWorld();
setVgaMode(autoVga());
status('Bereit. ENTER = Start mit Bf 109. H = Hilfe. (' + GAME_VERSION + ')');
try{ console.log('[aces] ' + GAME_VERSION + ' geladen.'); }catch(e){}
requestAnimationFrame(loop);
})();
