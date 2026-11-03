/* Asse über Europa – Browser-Hommage (eigener Code, keine Original-Assets)
 * Logik in 320×200 (VW/VH), gerendert über SCALE in bis zu 1280×800.
 * v4: Schnellstart (Enter, in der Luft) oder Einsatz vom Flugplatz (I) mit Briefing,
 *     Missionen Bomberabwehr / Freie Jagd / Begleitschutz, Laufbahn + Spielstände im Browser,
 *     Motorklang nach Drehzahl und Last, Gegner-KI mit Energie, Rotten und Taktik.
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
  mode: 'title', // title | briefing | fly | dead | debrief
  paused: false,
  menu: false,   // Spielstände (O) geöffnet
  menuSel: 1, menuMsg: '', menuDel: -1, menuInfo: [],
  showMap: false,
  mapZoom: 0,    // 0 = 9 km, 1 = 27 km
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
  killLog: {},  // Abschüsse dieses Flugs nach Typ
  wave: 0,
  waveClear: false,
  nextWaveT: 0,
  target: null,
  flakWarned: false,
  smokeT: 0,
  burnT: 0,
  msg: '',
  msgT: 0,
  radio: '',    // Funkspruch (oben links)
  radioT: 0,
  flash: 0,   // roter Treffer-Blitz
  shake: 0,
  started: false,
  seed: 1,      // Welt-Seed: Spielstände bauen dieselbe Landschaft wieder auf
  wx: null,     // Wetter der aktuellen Welt
  nextId: 1,    // fortlaufende Kennung der KI-Flugzeuge
  mission: null, // null = Schnellstart mit Wellen, sonst Einsatz vom Flugplatz
  brief: null,   // Einsatzbesprechung: vorgeschlagener Einsatz
  debrief: null, // Einsatzbericht
  quitT: 0, quitKey: '', // Zeitfenster für doppelt gedrückte Tasten (I / R)
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
  rpm: 2300, ata: 1.2, load: 0.75, // Motor: Drehzahl, Ladedruck, Last (0..1)
  ammoMG: AMMO_MG, ammoKan: AMMO_KAN, weapon: 0,
  mgCd: 0, kanCd: 0,
  hp: 100,
  flaps: false,
  gear: false,
  vy: 0,
  dead: false,
};
const MOUSE = {x:0, y:0, l:false, r:false, active:false};

let enemies=[], friends=[], bullets=[], ebullets=[], bombs=[], parts=[], clouds=[], patches=[], statics=[], flak=[];
let keys={};

// ---------- Mathe-Helfer ----------
let RNG = Math.random; // buildWorld setzt vorübergehend einen Seed-Generator ein
function seeded(s){
  s=s>>>0;
  return ()=>{ s=(s+0x6D2B79F5)|0; let t=Math.imul(s^(s>>>15),1|s); t=(t+Math.imul(t^(t>>>7),61|t))^t; return ((t^(t>>>14))>>>0)/4294967296; };
}
function rnd(a,b){ return a + RNG()*(b-a); }
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

const QUICK_WX = {clouds:34, base:1300};
// Gleicher Seed = gleiche Landschaft, Wolken und Flak (wichtig fürs Laden von Spielständen)
function buildWorld(seed, wx){
  G.seed = (seed>>>0) || 1;
  G.wx = wx = wx || QUICK_WX;
  RNG = seeded(G.seed);
  clouds=[];
  for(let i=0;i<wx.clouds;i++){
    const s=rnd(90,210), puffs=[];
    const n=5+(RNG()*5|0);
    for(let k=0;k<n;k++) puffs.push({dx:rnd(-1,1)*s, dy:rnd(-0.05,0.35)*s, dz:rnd(-0.6,0.6)*s, r:rnd(0.45,0.8)*s});
    clouds.push({x:rnd(-11000,11000), y:wx.base+rnd(0,1000), z:rnd(-10000,16000), puffs});
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
    if(RNG()<0.42){
      const n=4+(RNG()*6|0);
      for(let k=0;k<n;k++){
        const m=[MODELS.house1,MODELS.house2,MODELS.house3,MODELS.barn][RNG()*4|0];
        statics.push({kind:'m', m, x:x+rnd(-150,150), z:z+rnd(-150,150), B:basis(rnd(0,Math.PI),0,0), vis:4500});
      }
      if(RNG()<0.6) statics.push({kind:'m', m:MODELS.church, x, z, B:basis(rnd(0,Math.PI),0,0), vis:6000});
      addPatch(x,z,blobPts(x,z,190,9),'#6f7f4c',8000);
    } else {
      const r=rnd(220,440);
      addPatch(x,z,blobPts(x,z,r,11),'#2c4a26',11000);
      for(let k=0;k<24;k++){
        const a=rnd(0,Math.PI*2), d=Math.sqrt(RNG())*r*0.8;
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
  RNG = Math.random;
}

// ---------- Flugzeugtypen der KI ----------
// vmax = Höchstfahrt in Bodennähe (m/s, in Volldruckhöhe ~25 % mehr), vs = Abrissfahrt (abgestimmt auf die Bf 109:
// Spitfire kurvt dauerhaft ~15 % enger, Mustang ~10 % weiter), acc = Schubbeschleunigung,
// ind = Fahrtverlust durch Kurvenlast, nMax = Lastvielfaches, roll = Rollrate (rad/s), gunR = Kampfentfernung (m)
const ACT = {
  spit:    {vmax:150, vs:47, acc:7.5, ind:1.8, nMax:6.5, roll:3.4, hp:35,  ammo:260, gunR:450, style:'turn'},
  mustang: {vmax:162, vs:52, acc:7.0, ind:2.2, nMax:6.0, roll:2.8, hp:45,  ammo:320, gunR:520, style:'bnz'},
  b17:     {vmax:88,  vs:42, acc:2.2, ind:2.0, nMax:1.8, roll:0.6, hp:120, ammo:0,   gunR:750, style:'bomber'},
  ju88:    {vmax:100, vs:44, acc:2.6, ind:2.0, nMax:2.2, roll:0.8, hp:80,  ammo:0,   gunR:500, style:'bomber'},
};
// side: 'allied' = Gegner, 'axis' = eigene Bomber. Verweise nur über ids (Spielstand-tauglich).
function mkAI(type, side, x, y, z, o){
  o=o||{};
  const T=ACT[type], h=o.heading!==undefined?o.heading:rnd(0,Math.PI*2);
  const v=o.v||(T.style==='bomber'?T.vmax*0.9:T.vmax*0.85);
  const sk=o.skill!==undefined?o.skill:0.5;
  const e={
    id:G.nextId++, type, side, x, y, z,
    f:[Math.sin(h),0,Math.cos(h)], v, heading:h, pitch:0, roll:0, vx:Math.sin(h)*v, vy:0, vz:Math.cos(h)*v, n:1,
    hp:T.hp, maxHp:T.hp, alive:true, dying:false, fled:false, home:false, fallT:0,
    hitT:0, pHit:99, smokeT:0, ramCd:0,
    skill:sk, ace:sk>0.85,
    state:o.state||'attack', stT:0, think:Math.random()*0.5, dir:Math.random()<0.5?-1:1, jinkT:1, dive:false,
    tgtId:-1, thId:0, leadId:o.leadId||0, slot:o.slot||[0,0,0], escId:o.escId||0, prefF:!!o.prefF,
    wp:o.wp||null, wpId:o.wpId||0, pr:o.pr||1500, base:o.base||null, alt0:y, thr:o.thr||0.8, cruise:o.thr||0.8,
    ext:[0,0,1], aimOff:[0,0,0],
    ammo:T.ammo, gunCd:rnd(0.5,1.5), burst:0, pause:0,
    bombs:o.bombs||0, aim:o.aim||null, dropT:0, lastDD:1e9, bombed:false, jett:false, aborted:false, straggler:false,
  };
  return e;
}

// Schnellstart: Wellen wie bisher, aber mit der neuen KI
function spawnWave(n){
  G.wave = n;
  enemies = enemies.filter(e=>e.dying); // abstürzende Maschinen weiter zeigen
  const count = n===1 ? 3 : (n===2 ? 5 : 6);
  const sk = clamp(0.2+n*0.1,0.3,0.85);   // Welle 1 = Anfänger, ab Welle 5 erfahrene Piloten
  for(let i=0;i<count;i++){
    let type='spit';
    if(n>=2 && i===0) type='b17';
    else if(n>=2 && i%3===0) type='mustang';
    else if(n>=3 && i%2===0) type='mustang';
    const a = rnd(0,Math.PI*2), d = rnd(1500,3500);
    const x=P.x+Math.sin(a)*d, z=P.z+Math.cos(a)*d;
    if(type==='b17'){
      enemies.push(mkAI('b17','allied',x,rnd(1800,2500),z,{heading:Math.atan2(-x,-z), state:'inbound', skill:0.5,
        wp:{x:0,z:0}, aim:{x:0,z:0}, base:{x:x,z:40000}, bombs:6}));
    } else {
      enemies.push(mkAI(type,'allied',x,rnd(800,2200),z,{heading:Math.atan2(P.x-x,P.z-z), state:'attack', skill:clamp(sk*rnd(0.85,1.15)+(Math.random()<0.07?0.3:0),0.2,0.97)}));
    }
  }
  G.target = null;
  setMsg('Welle '+n+': '+(n===1?'3× Spitfire im Anflug!':(n===2?'B-17 + Jagdschutz!':'Abfangjäger überall!')));
  status('Welle '+n+' – Gegner: '+enemies.filter(e=>e.alive).length+'  (T = Ziel wechseln)');
}

// Gemeinsamer Neustart des Flugzustands (Schnellstart und Einsatz)
function resetFlight(){
  bullets=[]; ebullets=[]; bombs=[]; parts=[]; enemies=[]; friends=[];
  P.wp=P.wq=P.wr=0; P.sx=P.sy=P.sr=0; MOUSE.x=MOUSE.y=0;
  P.ammoMG=AMMO_MG; P.ammoKan=AMMO_KAN; P.hp=100; P.mgCd=0; P.kanCd=0; P.dead=false; P.stall=false; P.gSm=1; P.nz=1;
  G.kills=0; G.score=0; G.killLog={}; G.flash=0; G.shake=0; G.hitMark=0; G.hitKill=0; G.mode='fly'; G.paused=false; G.started=true; G.menu=false;
  G.wave=0; G.waveClear=false; G.nextWaveT=0; G.target=null; G.flakWarned=false; G.deadT=0; G.time=0; G.quitT=0; G.radio=''; G.radioT=0; G.nextId=1;
}
function quickStart(){
  G.mission=null; G.debrief=null;
  buildWorld((Math.random()*1e9)|0, QUICK_WX);
  resetFlight();
  P.x=0; P.y=1200; P.z=-2500; P.B=basis(0,0,0); P.V=[0,0,450/3.6];
  P.throttle=0.75; P.flaps=false; P.gear=false; P.onGround=false; P.rpm=2300;
  P.trim=trimFor(450/3.6,1200); syncEuler();
  spawnWave(1);
}

// ---------- Meldungen ----------
function setMsg(t, dur=3.5){ G.msg=t; G.msgT=dur; }
function status(t){ statusEl.textContent=t; }
function radio(t){ G.radio=t; G.radioT=7; }
function brg(dx,dz){ return ((Math.atan2(dx,dz)*180/Math.PI)%360+360)%360; }
const WIND8=['nördlich','nordöstlich','östlich','südöstlich','südlich','südwestlich','westlich','nordwestlich'];
function wind8(dx,dz){ return WIND8[Math.round(brg(dx,dz)/45)%8]; }
function km(d){ return (d/1000).toFixed(1).replace('.',',')+' km'; }
function deg3(dx,dz){ return String(Math.round(brg(dx,dz))%360).padStart(3,'0')+'°'; }

// ---------- Einsätze vom Flugplatz ----------
const MTYPES=['abwehr','jagd','begleit'];
const MNAME={abwehr:'Bomberabwehr', jagd:'Freie Jagd', begleit:'Begleitschutz'};
const MONTHS=['Januar','Februar','März','April','Mai','Juni','Juli','August','September','Oktober','November','Dezember'];
const TGT_NAMES=['das Flugzeugwerk','das Kraftwerk','das Treibstofflager','das Reparaturwerk','die Munitionsfabrik'];
// Schwierigkeit wächst mit der Zahl der geflogenen Einsätze (lvl 0..1)
function genBriefing(type){
  const lvl=Math.min(1,CAREER.missions/12);
  const b={type, lvl, wseed:(Math.random()*1e9)|0};
  const mo=3+(Math.random()*6|0), day=1+(Math.random()*28|0), hh=6+(Math.random()*12|0), mm=[0,15,30,45][Math.random()*4|0];
  b.date=day+'. '+MONTHS[mo]+' 1944'; b.time=String(hh).padStart(2,'0')+':'+String(mm).padStart(2,'0')+' Uhr';
  b.wx={clouds:Math.round(rnd(10,50)), base:Math.round(rnd(9,22))*100};
  b.wxText=(b.wx.clouds<20?'Leicht bewölkt':(b.wx.clouds<36?'Wechselnd bewölkt':'Stark bewölkt'))+', Wolkenuntergrenze '+b.wx.base+' m, Sicht gut.';
  b.skill=0.3+lvl*0.35;
  if(type==='abwehr'){
    b.nB=3+(Math.random()<0.3+lvl*0.5?1:0)+(lvl>0.6&&Math.random()<0.5?1:0);
    b.nEsc=Math.random()<0.3+lvl*0.5?2:0; if(lvl>0.7&&Math.random()<0.4) b.nEsc+=2;
    b.escType=Math.random()<0.4+lvl*0.4?'mustang':'spit';
    b.alt=Math.round(rnd(25,36))*100;
    b.tx=Math.round(rnd(-5000,5000)); b.tz=Math.round(rnd(-8500,-5000));
    b.ax=Math.round(rnd(-8000,8000)); b.az=15000;
    b.tname=TGT_NAMES[Math.random()*TGT_NAMES.length|0];
    b.need=Math.ceil(b.nB/2);
  } else if(type==='jagd'){
    b.ax=Math.round(rnd(-6000,6000)); b.az=Math.round(coastZ(b.ax)+rnd(2500,6000)); b.ar=3000;
    b.groups=2+(lvl>0.5&&Math.random()<0.5?1:0);
    b.mixed=Math.random()<0.3+lvl*0.5;
    b.need=2+(Math.random()<0.5+lvl*0.3?1:0)+(lvl>0.6?1:0);
    b.alt=Math.round(rnd(25,45))*100;
  } else {
    b.nF=3+(Math.random()<0.5?1:0);
    b.tx=Math.round(rnd(-5000,5000)); b.tz=Math.round(coastZ(b.tx)+rnd(5000,8000));
    b.nShips=3+(Math.random()*2|0);
    b.groups=2+(lvl>0.4&&Math.random()<0.6?1:0);
    b.alt=Math.round(rnd(22,30))*100;
    b.need=Math.ceil(b.nF/2);
    b.fx=Math.round(-b.tx*0.3); b.fz=-9000;
  }
  b.text=briefText(b);
  buildWorld(b.wseed,b.wx); // die Karte der Besprechung zeigt die echten Flak-Stellungen
  return b;
}
function briefText(b){
  const T=[];
  if(b.type==='abwehr'){
    T.push(['LAGE', b.nB+' B-17 „Fliegende Festungen“ haben den Kanal überquert und halten auf '+b.tname+' '+wind8(b.tx,b.tz)+' des Platzes zu ('+km(Math.hypot(b.tx,b.tz))+'). Flughöhe etwa '+b.alt+' m.']);
    T.push(['FEIND', b.nB+'× B-17G'+(b.nEsc?', Jagdschutz: '+b.nEsc+'× '+TYPE_NAME[b.escType]+' über dem Pulk':', kein Jagdschutz gemeldet')+'.']);
    T.push(['AUFTRAG','Alarmstart! Den Verband abfangen, bevor er das Ziel erreicht. Mindestens '+b.need+' Bomber abschießen oder zum Abdrehen zwingen. Danach zurück zum Platz und landen.']);
    T.push(['HINWEIS','Die Bordschützen schießen rundum. Von vorn oder schräg oben angreifen, kurz feuern, wegtauchen. Nicht hinter dem Pulk kleben. Schwer getroffene Bomber werfen ihre Bomben ab und drehen ab.']);
  } else if(b.type==='jagd'){
    T.push(['LAGE','Feindliche Jäger kreisen über dem Kanal, '+km(Math.hypot(b.ax,b.az))+' '+wind8(b.ax,b.az)+' des Platzes (Kurs '+deg3(b.ax,b.az)+'), in etwa '+b.alt+' m Höhe.']);
    T.push(['FEIND',b.groups+' Rotten '+(b.mixed?'Spitfire und Mustang':'Spitfire')+', weitere können nachkommen.']);
    T.push(['AUFTRAG','Freie Jagd: Den Raum aufsuchen und mindestens '+b.need+' Abschüsse erzielen. Danach zurück zum Platz und landen.']);
    T.push(['HINWEIS','Erst steigen, dann angreifen – wer von oben kommt, bestimmt den Kampf. Die Gegner fliegen paarweise: Wer einen jagt, hat oft den zweiten im Nacken.']);
  } else {
    T.push(['LAGE','Eine Staffel Ju 88 greift einen Geleitzug im Kanal an ('+km(Math.hypot(b.tx,b.tz))+' '+wind8(b.tx,b.tz)+', Kurs '+deg3(b.tx,b.tz)+'). Die Bomber kommen von Süden und überfliegen unseren Platz in etwa '+b.alt+' m.']);
    T.push(['EIGENE',b.nF+'× Ju 88 A-4 mit Bordschützen.']);
    T.push(['FEIND','Abfangjäger zu erwarten: Spitfire'+(b.lvl>0.3?', später auch Mustang':'')+', angreifend aus Norden.']);
    T.push(['AUFTRAG','Starten, zu den Ju 88 aufschließen und sie zum Ziel schützen. Mindestens '+b.need+' Bomber müssen ihre Bomben ins Ziel bringen. Danach zurück zum Platz und landen.']);
    T.push(['HINWEIS','Bei den Bombern bleiben! Wer Jäger zu weit verfolgt, lässt die Ju 88 schutzlos. Die Ju 88 sind auf Karte und Bildschirm hellblau markiert.']);
  }
  T.push(['WETTER', b.wxText]);
  return T;
}
function newMission(b){
  const M={type:b.type, b, t:0, resolved:false, success:false, airborne:false,
    kB:0, kF:0, aborted:0, escaped:0, dropped:0, hits:0, fLost:0, fHome:0, fKills:0,
    groups:0, nextSpawnT:0, farT:0, called:{}, tgt:null, ships:null};
  if(b.type==='abwehr') M.tgt={x:b.tx, z:b.tz, hp:10, maxHp:10};
  if(b.type==='begleit'){
    M.ships=[]; const h=rnd(0,Math.PI*2);
    for(let i=0;i<b.nShips;i++){ const o=(i-(b.nShips-1)/2)*240;
      M.ships.push({x:b.tx+Math.cos(h)*o+rnd(-40,40), z:b.tz-Math.sin(h)*o+rnd(-40,40), h:h+rnd(-0.2,0.2), hp:2, sunk:false, tilt:0, sinkT:0, gone:false}); }
    M.tgt={x:b.tx, z:b.tz, hp:b.nShips, maxHp:b.nShips};
  }
  return M;
}
function addMissionStatics(M){
  const b=M.b;
  if(M.type==='abwehr'){
    addPatch(b.tx,b.tz,rectPts(b.tx-100,b.tx+100,b.tz-80,b.tz+80),'#77756a',15000);
    statics.push({kind:'m', m:MODELS.factory, x:b.tx, z:b.tz, B:basis(0,0,0), vis:15000});
  } else if(M.type==='begleit'){
    for(const s of M.ships) statics.push({kind:'m', m:MODELS.ship, x:s.x, z:s.z, B:basis(s.h,0,0), vis:14000, ref:s});
  }
}
// Einsatz vom Flugplatz: Südende der Bahn, Kurs 000°, Fahrwerk draußen, Motor im Leerlauf, Spornrad (Nase oben)
function startAirfield(b){
  b=b||G.brief||genBriefing('abwehr');
  G.brief=b;
  buildWorld(b.wseed,b.wx);
  resetFlight();
  G.mission=newMission(b); G.debrief=null;
  addMissionStatics(G.mission);
  P.x=0; P.y=2; P.z=-480; P.B=basis(0,0.17,0); P.V=[0,0,0];
  P.throttle=0; P.flaps=false; P.gear=true; P.onGround=true; P.trim=0.11; P.rpm=700; syncEuler();
  missionSpawn(G.mission);
  setMsg('Startbereit: F = Klappen, W = Vollgas, D gegen den Linksdrall, ab ~190 km/h ziehen (↓)',7);
  status(MNAME[b.type]+' – '+b.date+', '+b.time+'. Startbereit am Südende der Bahn. I zweimal = Einsatz beenden.');
}
const BOX=[[0,0,0],[-70,-15,60],[70,-15,60],[0,25,120],[-140,-30,120],[140,-30,120]]; // rechts, oben, zurück (m)
function spawnFormation(type,side,n,x,y,z,h,o,arr,aims){
  const r0=[Math.cos(h),0,-Math.sin(h)], f=[Math.sin(h),0,Math.cos(h)], out=[];
  for(let i=0;i<n;i++){
    const s=BOX[i%BOX.length];
    const e=mkAI(type,side,x+r0[0]*s[0]-f[0]*s[2], y+s[1], z+r0[2]*s[0]-f[2]*s[2],
      Object.assign({},o,{heading:h, slot:s, leadId:i?out[0].id:0, aim:aims[i%aims.length]}));
    arr.push(e); out.push(e);
  }
  return out;
}
function spawnRotte(type,n,x,y,z,h,o){
  const r0=[Math.cos(h),0,-Math.sin(h)], f=[Math.sin(h),0,Math.cos(h)];
  let lead=null;
  for(let i=0;i<n;i++){
    const s=i?[(i%2?1:-1)*70*Math.ceil(i/2), -15*i, 60*i]:[0,0,0];
    const ace=Math.random()<0.08;
    const e=mkAI(type,'allied', x+r0[0]*s[0]-f[0]*s[2], y+s[1], z+r0[2]*s[0]-f[2]*s[2],
      Object.assign({},o,{heading:h, skill:clamp((o.skill||0.5)*rnd(0.85,1.15)+(ace?0.35:0),0.15,0.97), state:i?'form':o.state, leadId:lead?lead.id:0, slot:s}));
    if(!lead) lead=e;
    enemies.push(e);
  }
  return lead;
}
function spawnJagdGroup(M, reinf){
  const b=M.b; M.groups++;
  const type=b.mixed&&M.groups%2===0?'mustang':'spit';
  if(reinf) spawnRotte(type,2,b.ax+rnd(-4000,4000),b.alt+rnd(0,800),b.az+9000,Math.PI+rnd(-0.4,0.4),{skill:b.skill,state:'transit',wp:{x:b.ax,z:b.az}});
  else { const a=rnd(0,Math.PI*2), d=rnd(0,b.ar*0.7);
    spawnRotte(type,2,b.ax+Math.sin(a)*d,b.alt+rnd(-400,400),b.az+Math.cos(a)*d,rnd(0,Math.PI*2),{skill:b.skill,state:'patrol',wp:{x:b.ax,z:b.az},pr:rnd(1200,2200)}); }
}
function missionSpawn(M){
  const b=M.b;
  if(M.type==='abwehr'){
    const h=Math.atan2(b.tx-b.ax,b.tz-b.az), r0=[Math.cos(h),0,-Math.sin(h)];
    const aims=BOX.map(s=>({x:b.tx+r0[0]*s[0]*0.5, z:b.tz+r0[2]*s[0]*0.5}));
    const grp=spawnFormation('b17','allied',b.nB,b.ax,b.alt,b.az,h,{skill:0.5,state:'inbound',wp:{x:b.tx,z:b.tz},base:{x:b.ax,z:40000},bombs:6,thr:0.8},enemies,aims);
    for(let i=0;i<b.nEsc;i++){
      const sd=i%2?1:-1, s=[sd*(350+Math.floor(i/2)*150), 450, 100*Math.floor(i/2)], L=grp[0];
      enemies.push(mkAI(b.escType,'allied',L.x+r0[0]*s[0],L.y+s[1],L.z+r0[2]*s[0],{heading:h, skill:clamp(b.skill*rnd(0.85,1.15),0.15,0.95), state:'escort', escId:L.id, slot:s}));
    }
  } else if(M.type==='jagd'){
    for(let g=0;g<Math.min(2,b.groups);g++) spawnJagdGroup(M,false);
  } else {
    const h=Math.atan2(b.tx-b.fx,b.tz-b.fz);
    spawnFormation('ju88','axis',b.nF,b.fx,b.alt,b.fz,h,{skill:0.5,state:'inbound',wp:{x:b.tx,z:b.tz},base:{x:0,z:-3000},bombs:4,thr:0.55},friends,M.ships.map(s=>({x:s.x,z:s.z})));
  }
}
// Brennende Ziele: Rauchsäulen (nur Darstellung)
function burn(x,z,k,dt,r){
  if(k<=0||Math.hypot(x-P.x,z-P.z)>15000) return;
  G.burnT-=dt*k;
  if(G.burnT>0) return;
  G.burnT=0.35;
  parts.push(mkPart('dsmoke', x+rnd(-r,r), 8, z+rnd(-r,r), rnd(-2,2),rnd(4,8),rnd(-2,2), rnd(7,11), 10, rnd(45,70), -1.5, 0.15));
  if(Math.random()<0.4) parts.push(mkPart('fire', x+rnd(-r,r)*0.6, 4, z+rnd(-r,r)*0.6, 0,rnd(2,5),0, 0.8, 5, 12));
}
function updateMission(dt){
  const M=G.mission, b=M.b, c=M.called;
  M.t+=dt;
  if(!P.onGround) M.airborne=true;
  if(M.type==='abwehr'){
    if(!c.start&&M.t>1.5){ c.start=1; radio('Gefechtsstand: '+b.nB+' Viermots über dem Kanal, Kurs '+deg3(b.tx-b.ax,b.tz-b.az)+', Höhe '+b.alt+' m. Alarmstart!'); }
    const L=enemies.find(e=>e.type==='b17'&&e.alive&&!e.bombed&&e.state!=='flee');
    if(L&&!c.near&&Math.hypot(L.x-b.tx,L.z-b.tz)<7000){ c.near=1; radio('Gefechtsstand: Bomber 7 km vor '+b.tname+'!'); }
    if(!M.resolved&&!L&&M.t>3&&!bombs.length){
      M.resolved=true; M.success=M.kB+M.aborted>=b.need;
      radio(M.success?'Gefechtsstand: Angriff abgewehrt! Zurück zum Platz und landen.':'Gefechtsstand: '+b.tname+' wurde getroffen. Zurück zum Platz.');
    }
    burn(M.tgt.x,M.tgt.z,1-M.tgt.hp/M.tgt.maxHp,dt,70);
  } else if(M.type==='jagd'){
    const alive=enemies.filter(e=>e.alive).length;
    if(!c.start&&M.t>1.5){ c.start=1; radio('Gefechtsstand: Feindjäger im Raum '+wind8(b.ax,b.az)+', '+km(Math.hypot(b.ax,b.az))+', Kurs '+deg3(b.ax,b.az)+'. Viel Glück!'); }
    if(!c.area&&Math.hypot(P.x-b.ax,P.z-b.az)<6000&&!P.onGround){ c.area=1; radio('Achtung, Indianer im Raum! Höhe '+b.alt+' m.'); }
    if(!M.resolved&&M.kF>=b.need){ M.resolved=true; M.success=true; radio('Gefechtsstand: Gut gemacht! Freie Jagd beendet – zurück zum Platz und landen.'); }
    if(!M.resolved){
      if(M.nextSpawnT<=0&&((M.groups<b.groups&&(M.kF>0||M.t>200))||alive===0)) M.nextSpawnT=alive===0?15:3;
      if(M.nextSpawnT>0){
        M.nextSpawnT-=dt;
        if(M.nextSpawnT<=0){
          if(M.groups<b.groups+2){ spawnJagdGroup(M,true); radio('Gefechtsstand: Weitere Indianer von Norden!'); }
          else if(alive===0){ M.resolved=true; M.success=false; radio('Gefechtsstand: Der Gegner hat sich zurückgezogen. Zurück zum Platz.'); }
        }
      }
    }
  } else {
    const fl=friends.filter(f=>f.alive), pend=fl.filter(f=>!f.bombed), L=pend[0]||fl[0];
    if(!c.start&&M.t>1.5){ c.start=1; radio('Gefechtsstand: '+b.nF+' Ju 88 im Anflug von Süden, Höhe '+b.alt+' m. Starten und aufschließen!'); }
    if(L){
      const d=Math.hypot(L.x-b.tx,L.z-b.tz), o={skill:b.skill,state:'transit',wpId:L.id,prefF:true};
      if(!c.i1&&d<9000){ c.i1=1; spawnRotte('spit',2,b.tx+rnd(-3000,3000),b.alt+800,b.tz+8000,Math.PI,o);
        if(b.lvl>0.5) spawnRotte('spit',2,b.tx+rnd(-5000,5000),b.alt+1300,b.tz+9000,Math.PI,o);
        radio('Indianer von Norden! Ju 88 schützen!'); }
      if(!c.i2&&d<4500){ c.i2=1; spawnRotte(b.lvl>0.3?'mustang':'spit',2,b.tx+rnd(-5000,5000),b.alt+1200,b.tz+6000,Math.PI+rnd(-0.5,0.5),o); radio('Weitere Jäger von Nordosten!'); }
      if(!c.i3&&b.groups>=3&&M.dropped>0){ c.i3=1; spawnRotte('mustang',2,L.x+rnd(-4000,4000),b.alt+1500,L.z+7000,Math.PI,o); radio('Mustangs greifen die Ju 88 auf dem Rückflug an!'); }
      if(M.airborne&&!M.resolved){
        const dp=Math.hypot(P.x-L.x,P.z-L.z);
        M.farT=dp>5000?M.farT+dt:Math.min(M.farT,0);
        if(M.farT>25){ M.farT=-20; radio('Ju 88 an Begleitschutz: Wo bleiben Sie?! Zurück zu uns!'); }
      }
    }
    if(!M.resolved&&pend.length===0&&M.t>3&&!bombs.length){
      M.resolved=true; M.success=M.dropped>=b.need;
      radio(M.success?'Gefechtsstand: Angriff gelungen! Zurück zum Platz und landen.':'Gefechtsstand: Zu wenig Bomber im Ziel. Zurück zum Platz.');
    }
    for(const s of M.ships) if(s.sunk&&!s.gone){
      s.sinkT+=dt; s.tilt=Math.min(0.3,s.sinkT*0.015);
      if(s.sinkT>45) s.gone=true;
      burn(s.x,s.z,0.6,dt,15);
    }
  }
}
// Bombe schlägt auf: Wirkung im Ziel zählen
function bombImpact(bm){
  const water=bm.z>coastZ(bm.x), d=dist3(bm.x,0,bm.z,P.x,P.y,P.z);
  if(d<10000){
    if(water) for(let i=0;i<5;i++) parts.push(mkPart('splash', bm.x+rnd(-3,3),2,bm.z+rnd(-3,3), rnd(-4,4),rnd(18,32),rnd(-4,4), rnd(1.5,2.5), 4, rnd(14,24), 9.8, 0.4));
    else explode(bm.x,2,bm.z,false);
    if(d<5000) noiseBurst(0.5,0.35*(1-d/5000),180);
  }
  const M=G.mission; if(!M||bm.jett) return;
  if(M.type==='abwehr'&&bm.side==='allied'&&Math.hypot(bm.x-M.tgt.x,bm.z-M.tgt.z)<120){ M.hits++; M.tgt.hp=Math.max(0,M.tgt.hp-1); }
  if(M.type==='begleit'&&bm.side==='axis'){
    for(const s of M.ships) if(!s.sunk&&Math.hypot(bm.x-s.x,bm.z-s.z)<45){
      M.hits++;
      if(--s.hp<=0){ s.sunk=true; M.tgt.hp--; radio('Volltreffer – Frachter sinkt!'); }
      break;
    }
  }
}
function updateBombs(dt){
  for(let i=bombs.length-1;i>=0;i--){
    const b=bombs[i];
    b.vy-=9.81*dt; b.x+=b.vx*dt; b.y+=b.vy*dt; b.z+=b.vz*dt;
    if(b.y<=0){ bombImpact(b); bombs.splice(i,1); }
  }
}
// Lage für die Anzeige oben rechts: Fortschritt + Kurs/Entfernung zum nächsten Punkt
function objText(){
  const M=G.mission; if(!M) return '';
  const b=M.b, nav=(x,z,lab)=>lab+' '+deg3(x-P.x,z-P.z)+' '+km(Math.hypot(x-P.x,z-P.z));
  if(M.resolved) return (M.success?'AUFTRAG ERFÜLLT':'AUFTRAG GESCHEITERT')+' · '+nav(0,0,'Platz');
  if(M.type==='abwehr'){ const L=enemies.find(e=>e.type==='b17'&&e.alive&&!e.bombed&&e.state!=='flee'); return 'B-17 '+(M.kB+M.aborted)+'/'+b.need+(L?' · '+nav(L.x,L.z,'Pulk'):''); }
  if(M.type==='jagd') return 'Abschüsse '+M.kF+'/'+b.need+' · '+nav(b.ax,b.az,'Raum');
  const L=friends.find(f=>f.alive&&!f.bombed);
  return 'Ju 88 '+friends.filter(f=>f.alive).length+'/'+b.nF+(L?' · '+nav(L.x,L.z,'Ju 88'):'');
}

// ---------- Laufbahn ----------
function newCareer(){ return {missions:0, success:0, kills:0, score:0, losses:0, byType:{}, awards:[], log:[]}; }
let CAREER=newCareer();
const RANKS=[[0,'Unteroffizier','Uffz.'],[1500,'Feldwebel','Fw.'],[4000,'Oberfeldwebel','Ofw.'],[8000,'Leutnant','Lt.'],[14000,'Oberleutnant','Oblt.'],[22000,'Hauptmann','Hptm.'],[32000,'Major','Maj.']];
function rankOf(sc){ let r=RANKS[0]; for(const x of RANKS) if(sc>=x[0]) r=x; return r; }
const AWARDS=[['Frontflugspange',c=>c.missions>=5],['Eisernes Kreuz 2. Klasse',c=>c.kills>=3],['Eisernes Kreuz 1. Klasse',c=>c.kills>=10],
  ['Ehrenpokal für besondere Leistung im Luftkrieg',c=>c.kills>=20],['Ritterkreuz',c=>c.kills>=40]];
function landedHow(){ if(!P.onGround||Math.hypot(P.V[0],P.V[2])>5) return ''; return Math.hypot(P.x,P.z)<1500?'landed':'landedOut'; }
// how: landed | landedOut | quit | shot | noflight
function endMission(how){
  const M=G.mission; if(!M) return;
  const b=M.b, c=CAREER;
  const prog=M.type==='abwehr'?M.kB+M.aborted:(M.type==='jagd'?M.kF:M.dropped);
  const res=M.resolved&&M.success?'ERFOLG':(prog>0?'TEILERFOLG':'MISSERFOLG');
  const pts=[['Abschüsse',G.score]];
  if(res==='ERFOLG') pts.push(['Auftrag erfüllt',500+Math.round(b.lvl*300)]); else if(res==='TEILERFOLG') pts.push(['Teilerfolg',150]);
  if(how==='landed') pts.push(['Landung auf dem Platz',200]); else if(how==='landedOut') pts.push(['Außenlandung',80]);
  const saved=M.type==='begleit'?friends.filter(f=>f.alive).length+M.fHome:0;
  if(saved) pts.push(['Ju 88 heil ('+saved+')',saved*60]);
  const total=pts.reduce((s,p)=>s+p[1],0);
  const before=rankOf(c.score), aw0=c.awards.slice();
  c.missions++; if(res==='ERFOLG') c.success++; c.kills+=G.kills; c.score+=total; if(how==='shot') c.losses++;
  for(const t in G.killLog) c.byType[t]=(c.byType[t]||0)+G.killLog[t];
  for(const [name,test] of AWARDS) if(!c.awards.includes(name)&&test(c)) c.awards.push(name);
  c.log.unshift({d:b.date, t:b.type, r:res, k:G.kills, p:total}); if(c.log.length>12) c.log.length=12;
  const after=rankOf(c.score);
  G.debrief={b, res, how, pts, total, kills:Object.assign({},G.killLog), saved,
    M:{kB:M.kB, kF:M.kF, aborted:M.aborted, escaped:M.escaped, dropped:M.dropped, hits:M.hits, fLost:M.fLost, fKills:M.fKills,
       ships:M.ships?M.ships.filter(s=>s.sunk).length:0},
    promo:after[0]>before[0]?after[1]:'', awards:c.awards.filter(a=>!aw0.includes(a))};
  G.mode='debrief'; G.paused=false; G.mission=null; G.brief=null; G.menu=false;
  bullets=[]; ebullets=[]; bombs=[];
  G.debrief.autoOk=autosave();
  status('Einsatzbericht: '+res+' – '+total+' Punkte. ENTER = nächste Einsatzbesprechung, O = Spielstände.');
}

// ---------- Spielstände (localStorage, nur im eigenen Browser) ----------
// Platz 0 = automatisch nach jedem Einsatz (Laufbahn), 1–3 = von Hand (mit laufendem Flug, wenn in der Luft)
const SAVE_KEY='aces.save.';
function storeGet(k){ try{ return localStorage.getItem(k); }catch(e){ return null; } }
function storeSet(k,v){ try{ localStorage.setItem(k,v); return true; }catch(e){ return false; } }
function storeDel(k){ try{ localStorage.removeItem(k); }catch(e){} }
function slotInfo(i){ const s=storeGet(SAVE_KEY+i); if(!s) return null; try{ const d=JSON.parse(s); return d&&d.v===1?d:null; }catch(e){ return null; } }
function snapshot(){
  const d={v:1, at:Date.now(), career:CAREER, brief:G.brief, mode:G.mode==='briefing'?'briefing':'idle'};
  if(G.mode==='fly'&&!P.dead){
    d.mode='fly';
    d.flight={seed:G.seed, wx:G.wx, mission:G.mission, P, enemies, friends, bombs, nextId:G.nextId,
      G:{kills:G.kills, score:G.score, killLog:G.killLog, wave:G.wave, waveClear:G.waveClear, nextWaveT:G.nextWaveT, time:G.time, flakWarned:G.flakWarned, target:G.target?G.target.id:0}};
  }
  return d;
}
function autosave(){ return storeSet(SAVE_KEY+0, JSON.stringify({v:1, at:Date.now(), career:CAREER, brief:null, mode:'idle'})); }
function refreshMenu(){ G.menuInfo=[0,1,2,3].map(slotInfo); }
function openMenu(){
  G.menu=true; G.menuMsg=''; G.menuDel=-1; refreshMenu();
  if(G.mode==='fly'&&!G.paused) G.paused=true;
  status('Spielstände: ↑/↓ Platz wählen, S = speichern, L = laden, Entf = löschen, O = schließen.');
}
function closeMenu(){ G.menu=false; if(G.mode==='fly'&&G.paused) status('PAUSE – Weiter mit P / Enter / Klick ins Bild'); }
function saveSlot(i){
  if(i===0){ G.menuMsg='Platz A wird nach jedem Einsatz automatisch beschrieben – bitte 1–3 wählen.'; return; }
  const ok=storeSet(SAVE_KEY+i, JSON.stringify(snapshot()));
  G.menuMsg=ok?'Gespeichert auf Platz '+i+(G.mode==='fly'?' (mit laufendem Flug).':' (Laufbahn).'):'Speichern nicht möglich – Browser-Speicher gesperrt oder voll.';
  refreshMenu();
}
function deleteSlot(i){
  if(!G.menuInfo[i]){ G.menuMsg='Platz ist leer.'; return; }
  if(G.menuDel!==i){ G.menuDel=i; G.menuMsg='Nochmal Entf = Platz '+(i?i:'A')+' wirklich löschen.'; return; }
  storeDel(SAVE_KEY+i); G.menuDel=-1; G.menuMsg='Platz '+(i?i:'A')+' gelöscht.'; refreshMenu();
}
function loadSlot(i){
  const d=slotInfo(i);
  if(!d){ G.menuMsg='Platz '+(i?i:'A')+' ist leer.'; return; }
  CAREER=Object.assign(newCareer(), d.career||{});
  G.brief=d.brief||null; G.menu=false; G.debrief=null;
  if(!d.flight&&G.brief) buildWorld(G.brief.wseed,G.brief.wx);
  if(d.flight){
    const f=d.flight;
    buildWorld(f.seed, f.wx);
    resetFlight();
    G.mission=f.mission||null;
    if(G.mission) addMissionStatics(G.mission);
    Object.assign(P, f.P);
    enemies=f.enemies||[]; friends=f.friends||[]; bombs=f.bombs||[]; G.nextId=f.nextId||1;
    const g=f.G||{};
    G.kills=g.kills||0; G.score=g.score||0; G.killLog=g.killLog||{}; G.wave=g.wave||0; G.waveClear=!!g.waveClear; G.nextWaveT=g.nextWaveT||0; G.time=g.time||0; G.flakWarned=!!g.flakWarned;
    G.target=enemies.find(e=>e.id===g.target&&e.alive)||null;
    G.paused=true;
    status('Spielstand '+(i?i:'A')+' geladen – PAUSE. Weiter mit P / Enter / Klick ins Bild.');
  } else {
    G.mission=null;
    openBriefing();
    status('Laufbahn geladen: '+rankOf(CAREER.score)[1]+', '+CAREER.missions+' Einsätze, '+CAREER.kills+' Abschüsse. ENTER = Start vom Flugplatz.');
  }
}
function menuKey(k,lk){
  if(k==='Escape'||lk==='o'){ closeMenu(); return; }
  if(k==='ArrowUp') G.menuSel=(G.menuSel+3)%4;
  else if(k==='ArrowDown') G.menuSel=(G.menuSel+1)%4;
  else if(k==='1'||k==='2'||k==='3') G.menuSel=+k;
  else if(lk==='a'||k==='0') G.menuSel=0;
  else if(lk==='s') saveSlot(G.menuSel);
  else if(lk==='l'||k==='Enter') loadSlot(G.menuSel);
  else if(k==='Delete'||k==='Backspace'||lk==='x') deleteSlot(G.menuSel);
  if(k!=='Delete'&&k!=='Backspace'&&lk!=='x') G.menuDel=-1;
}

// ---------- Audio (WebAudio, alles synthetisch, Start erst nach Benutzeraktion) ----------
// Motor DB 605 (V12, Viertakt): Sägezahn auf der Zündfrequenz (Drehzahl/60 × 6) plus halber Unterton.
// Die Last (Ladedruck) treibt einen Verzerrer stärker an und öffnet den Tiefpass, dazu Auspuffrauschen.
// Ein Kurbelwellen-LFO lässt den Leerlauf "blubbern". Fahrtwind wächst mit der angezeigten Fahrt.
let AC=null, engOsc=null, engGain=null, engFilter=null, eng=null;
function audioInit(){
  if(AC) return;
  try{
    AC = new (window.AudioContext||window.webkitAudioContext)();
    const nb=AC.createBuffer(1,AC.sampleRate*2,AC.sampleRate), nd=nb.getChannelData(0);
    for(let i=0;i<nd.length;i++) nd[i]=Math.random()*2-1;
    const noise=()=>{ const s=AC.createBufferSource(); s.buffer=nb; s.loop=true; s.start(); return s; };
    engOsc = AC.createOscillator(); engOsc.type='sawtooth'; engOsc.frequency.value=70;
    const sub=AC.createOscillator(); sub.type='square'; sub.frequency.value=35;
    const subG=AC.createGain(); subG.gain.value=0.45;
    const drive=AC.createGain(); drive.gain.value=1;
    const shaper=AC.createWaveShaper(), curve=new Float32Array(1024);
    for(let i=0;i<1024;i++){ const x=i/511.5-1; curve[i]=Math.tanh(2.5*x)/Math.tanh(2.5); }
    shaper.curve=curve;
    const rough=AC.createGain(); rough.gain.value=1;
    const lfo=AC.createOscillator(); lfo.type='sine'; lfo.frequency.value=12;
    const lfoG=AC.createGain(); lfoG.gain.value=0.2;
    engFilter = AC.createBiquadFilter(); engFilter.type='lowpass'; engFilter.frequency.value=400; engFilter.Q.value=0.9;
    const exhF=AC.createBiquadFilter(); exhF.type='bandpass'; exhF.frequency.value=300; exhF.Q.value=0.8;
    const exhG=AC.createGain(); exhG.gain.value=0;
    const windF=AC.createBiquadFilter(); windF.type='lowpass'; windF.frequency.value=600;
    const windG=AC.createGain(); windG.gain.value=0;
    engGain = AC.createGain(); engGain.gain.value=0.03;
    const out=AC.createGain(); out.gain.value=0;
    engOsc.connect(drive); sub.connect(subG); subG.connect(drive);
    noise().connect(exhF); exhF.connect(exhG); exhG.connect(drive);
    drive.connect(shaper); shaper.connect(rough); rough.connect(engFilter); engFilter.connect(engGain); engGain.connect(out);
    lfo.connect(lfoG); lfoG.connect(rough.gain);
    noise().connect(windF); windF.connect(windG); windG.connect(out);
    out.connect(AC.destination);
    engOsc.start(); sub.start(); lfo.start();
    eng={sub, drive, lfo, lfoG, exhF, exhG, windF, windG, out};
  }catch(e){ AC=null; eng=null; }
}
function engineSound(dt){
  if(!AC||!eng) return;
  const t=AC.currentTime, k=0.08;
  const on=G.sound&&G.mode==='fly'&&!G.paused&&!G.menu;
  const rpm=P.rpm, load=P.load, fire=rpm/60*6;
  eng.out.gain.setTargetAtTime(on?1:0,t,0.15);
  engOsc.frequency.setTargetAtTime(fire,t,k);
  eng.sub.frequency.setTargetAtTime(fire*0.5,t,k);
  eng.lfo.frequency.setTargetAtTime(rpm/60,t,k);
  eng.lfoG.gain.setTargetAtTime(0.1+0.32*(1-load)*(rpm<1200?1:0.45)+(P.hp<30?0.25:0),t,k);  // Leerlauf und Schaden: unrund
  eng.drive.gain.setTargetAtTime(0.5+load*2.5,t,k);
  engFilter.frequency.setTargetAtTime(160+rpm*0.22+load*1500,t,k);
  eng.exhF.frequency.setTargetAtTime(fire*2.2,t,k);
  eng.exhG.gain.setTargetAtTime(0.05+0.5*load*load,t,k);
  engGain.gain.setTargetAtTime(0.022+0.035*load+0.012*rpm/2800,t,k);
  const v=P.ias/700;
  eng.windG.gain.setTargetAtTime(Math.min(0.09,0.08*v*v),t,0.2);
  eng.windF.frequency.setTargetAtTime(300+P.ias*2.5,t,0.2);
  // Schiebebetrieb (Gas raus bei hoher Drehzahl): Patschen im Auspuff
  if(on&&load<0.12&&rpm>1250&&Math.random()<dt*4) noiseBurst(0.035,0.07,rnd(250,500));
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
function cycleMap(){
  if(!G.showMap){ G.showMap=true; G.mapZoom=0; } else if(G.mapZoom===0) G.mapZoom=1; else G.showMap=false;
  if(G.mode==='fly') setMsg(G.showMap?'Karte: '+(G.mapZoom?'27 km':'9 km')+' Umkreis':'Karte aus',1.2);
}
// Folgenreiche Tasten im Einsatz wollen zweimal gedrückt werden
function confirmTwice(key,text){
  if(G.quitT>0&&G.quitKey===key){ G.quitT=0; return true; }
  G.quitT=3; G.quitKey=key; setMsg(text,3); return false;
}
function restart(){
  if(G.mission&&G.mode==='fly'&&!confirmTwice('r','Einsatz neu beginnen (ohne Wertung)? Nochmal R')) return;
  if(G.mission) startAirfield(G.mission.b); else quickStart();
}
function missionKey(){
  if(G.mode==='title'||(G.mode==='dead'&&!G.mission)) return openBriefing();
  if(G.mode==='dead') return endMission('shot');
  if(G.mode!=='fly') return;
  if(!confirmTwice('i',G.mission?'Einsatz beenden und Bericht? Nochmal I':'Schnellstart verlassen – zur Einsatzbesprechung? Nochmal I')) return;
  if(G.mission) endMission(!G.mission.airborne?'noflight':(landedHow()||'quit')); else openBriefing();
}
function openBriefing(){
  G.mode='briefing'; G.paused=false; G.mission=null; G.debrief=null;
  bullets=[]; ebullets=[]; bombs=[]; enemies=[]; friends=[];
  if(!G.brief) G.brief=genBriefing(MTYPES[CAREER.missions%3]);
  status('Einsatzbesprechung: 1/2/3 = Einsatzart, R = andere Lage, ENTER = Start vom Flugplatz, ESC = zurück.');
}
function toTitle(){
  G.mode='title'; G.mission=null; G.paused=false;
  status('Bereit. ENTER = Schnellstart in der Luft, I = Einsatz vom Flugplatz, O = Spielstände, H = Hilfe.');
}
function briefingKey(k,lk){
  if(k==='1'||k==='2'||k==='3') G.brief=genBriefing(MTYPES[+k-1]);
  else if(k==='ArrowLeft'||k==='ArrowRight'){ const i=MTYPES.indexOf(G.brief.type); G.brief=genBriefing(MTYPES[(i+(k==='ArrowRight'?1:2))%3]); }
  else if(lk==='r'||lk==='n') G.brief=genBriefing(G.brief.type);
  else if(k==='Enter'||lk==='i') startAirfield(G.brief);
  else if(k==='Escape') toTitle();
}
window.addEventListener('keydown', e=>{
  const k = e.key, lk = k.toLowerCase();
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(k)) e.preventDefault();
  if(k==='F1'){ e.preventDefault(); HELP_TOGGLE(); return; }
  if(G.menu&&k==='Backspace') e.preventDefault();
  keys[lk]=true; keys[k]=true;
  audioInit(); if(AC&&AC.state==='suspended') AC.resume();
  if(e.repeat) return;
  if(G.menu){ menuKey(k,lk); return; }
  if(lk==='o'){ openMenu(); return; }
  if(lk==='h'){ HELP_TOGGLE(); return; }
  if(lk==='v'){ cycleVga(); return; }
  if(lk==='l'){ toggleSound(); return; }
  if(G.mode==='briefing'){ briefingKey(k,lk); return; }
  if(G.mode==='debrief'){ if(k==='Enter'||lk==='i') openBriefing(); else if(k==='Escape') toTitle(); return; }
  if(k==='Enter'){
    if(G.mode==='fly'){ if(G.paused){ G.paused=false; status('Weiter gehts!'); } }
    else if(G.mode==='dead'&&G.mission) endMission('shot');
    else quickStart();
  }
  else if(lk==='i') missionKey();
  else if(lk==='p'||k==='Escape') { if(G.mode==='fly'){ G.paused=!G.paused; status(G.paused?'PAUSE – Weiter mit P / Enter':'Weiter gehts!'); } }
  else if(lk==='n'||lk==='r') restart();
  else if(lk==='m') cycleMap();
  else if(lk==='c') toggleCockpit();
  else if(lk==='k') toggleView();
  else if(lk==='t') cycleTarget();
  else if(lk==='x') cheatRepair();
  else if(lk==='b') cheatAmmo();
  else if(lk==='f') { if(G.mode==='fly'){ P.flaps=!P.flaps; setMsg(P.flaps?'Landeklappen AUSGEFAHREN':'Landeklappen EINGEFAHREN'); } }
  else if(lk==='g') { if(G.mode==='fly'){ P.gear=!P.gear; setMsg(P.gear?'Fahrwerk AUSGEFAHREN':'Fahrwerk EINGEFAHREN'); } }
  else if(k==='1'||k==='2'||k==='3') selectWeapon(+k-1);
});
function selectWeapon(i){
  P.weapon=((i%3)+3)%3;
  document.getElementById('btnWeapon').textContent='Waffe: '+WEAPON_NAME[P.weapon]+' (1/2/3)';
  if(G.mode==='fly') setMsg('Waffe: '+WEAPON_NAME[P.weapon],1.5);
}
// Maus: Klick ins Bild übernimmt die Steuerung. Die Zeigerposition ist der Knüppel (Visier = Mitte),
// links = Feuer, rechts = Kanone, Rad = Gas. Verlässt die Maus das Bild, gibt sie die Steuerung ab
// und das Spiel pausiert – die Seite lässt sich dann normal scrollen.
function mouseStick(e){
  const rc=canvas.getBoundingClientRect();
  const dz=v=>Math.abs(v)<0.04?0:Math.sign(v)*(Math.abs(v)-0.04)/0.96; // kleine Totzone ums Visier
  MOUSE.x=clamp(dz(((e.clientX-rc.left)/rc.width*VW-VW/2)/(VW*0.4)),-1,1);
  MOUSE.y=clamp(dz(((e.clientY-rc.top)/rc.height*VH-VH*0.46)/(VH*0.4)),-1,1); // unter dem Visier = ziehen
}
function mouseRelease(){ MOUSE.active=false; MOUSE.x=MOUSE.y=0; MOUSE.l=MOUSE.r=false; }
canvas.addEventListener('mousedown', e=>{
  audioInit(); if(AC&&AC.state==='suspended') AC.resume();
  if(G.menu){ e.preventDefault(); return; }
  if(G.mode==='briefing'){ startAirfield(G.brief); e.preventDefault(); return; }
  if(G.mode==='debrief'){ openBriefing(); e.preventDefault(); return; }
  if(G.mode==='title') quickStart();
  if(!MOUSE.active||G.paused){
    MOUSE.active=true; G.paused=false; mouseStick(e); e.preventDefault();
    status('Maussteuerung aktiv: Zeiger = Knüppel (Visier = Mitte), links = Feuer, rechts = Kanone, Rad = Gas. Maus aus dem Bild = Pause.');
    return;
  }
  if(e.button===0) MOUSE.l=true;
  else if(e.button===2) MOUSE.r=true;
  e.preventDefault();
});
window.addEventListener('mouseup', e=>{ if(e.button===0) MOUSE.l=false; else if(e.button===2) MOUSE.r=false; });
canvas.addEventListener('contextmenu', e=>e.preventDefault());
canvas.addEventListener('mousemove', e=>{ if(MOUSE.active&&G.mode==='fly'&&!G.paused) mouseStick(e); });
canvas.addEventListener('mouseleave', ()=>{
  if(!MOUSE.active) return;
  mouseRelease();
  if(G.mode==='fly'&&!G.paused){ G.paused=true; status('PAUSE – Maus hat das Bild verlassen. Klick ins Bild oder P = weiter.'); }
});
canvas.addEventListener('wheel', e=>{
  if(!MOUSE.active||G.mode!=='fly'||G.paused) return; // sonst scrollt die Seite normal
  e.preventDefault();
  P.throttle=clamp(P.throttle-Math.sign(e.deltaY)*0.05,0,1);
},{passive:false});
window.addEventListener('keyup', e=>{ keys[e.key.toLowerCase()]=false; keys[e.key]=false; });
window.addEventListener('blur', ()=>{ keys={}; mouseRelease(); });

// Buttons (danach Fokus abgeben, sonst löst Enter/Leertaste den Button erneut aus)
document.getElementById('btnStart').onclick=()=>{ audioInit(); if(G.mission&&(G.mode==='fly'||G.mode==='dead')&&!confirmTwice('q','Einsatz verwerfen (ohne Wertung) und Schnellstart? Nochmal klicken')) return; quickStart(); };
document.getElementById('btnMission').onclick=()=>{ audioInit(); if(G.mode==='briefing') startAirfield(G.brief); else if(G.mode==='fly'||G.mode==='dead') missionKey(); else openBriefing(); };
document.getElementById('btnSave').onclick=()=>{ if(G.menu) closeMenu(); else openMenu(); };
document.getElementById('btnHelp').onclick=HELP_TOGGLE;
document.getElementById('btnPause').onclick=()=>{ if(G.mode==='fly'){G.paused=!G.paused;} };
document.getElementById('btnNew').onclick=()=>restart();
document.getElementById('btnVga').onclick=()=>cycleVga();
document.getElementById('btnView').onclick=()=>toggleView();
document.getElementById('btnRepair').onclick=()=>{ audioInit(); cheatRepair(); };
document.getElementById('btnAmmo').onclick=()=>{ audioInit(); cheatAmmo(); };
document.getElementById('btnSound').onclick=()=>toggleSound();
document.getElementById('btnCockpit').onclick=()=>toggleCockpit();
document.getElementById('btnWeapon').onclick=()=>selectWeapon(P.weapon+1);
for(const b of document.querySelectorAll('#hud-bar button')) b.addEventListener('click',()=>b.blur());

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
    const swing=0.05*P.throttle*clamp(1-P.ias/160,0,1);    // Linksdrall beim Startlauf: mit D halten
    P.B=basis(P.heading+(dr*0.5-swing)*dt,clamp(P.pitch,0,0.2),P.roll*0.9); // Spornrad: Nase 0–11°
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
// DB 605 mit Verstell-Luftschraube: Der Regler hält die Drehzahl nach Gashebel (700–2800 U/min).
// Gas raus bei viel Fahrt: Die Luftschraube treibt den Motor (Schiebebetrieb). Ladedruck/Last fallen über der Volldruckhöhe.
function engineModel(dt){
  const altF=P.y<FM.hCrit?1:rho(P.y)/rho(FM.hCrit);
  P.load=clamp(P.throttle*altF,0,1);
  P.ata=0.55+0.87*P.load;
  const rpmT=Math.max(700+P.throttle*2100, Math.min(2500,450+P.ias*2.4)*(1-P.throttle*0.8))+Math.max(0,P.ias-650)*3;
  P.rpm+=(rpmT-P.rpm)*Math.min(1,dt*(rpmT>P.rpm?1.8:1.2));
}

function update(dt){
  if(G.menu) return;
  if(G.radioT>0) G.radioT-=dt;
  if(G.mode==='dead'&&!G.paused){ G.deadT+=dt; if(G.msgT>0) G.msgT-=dt; updateParts(dt); updateBombs(dt); return; }
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
  engineModel(dt);
  // Rückmeldung: Rütteln kurz vor dem Abriss, Warnungen, Strukturgrenzen
  const aS=P.flaps?FM.aSflap:FM.aS;
  if(P.alpha>aS*0.85&&!P.onGround) G.shake=Math.max(G.shake,Math.min(0.8,(P.alpha/aS-0.85)*3));
  if(P.stall&&!P.onGround&&Math.random()<dt*1.5) setMsg('ABRISS! Knüppel nachlassen, Nase runter!',1.5);
  if(P.ias>760){ P.hp-=dt*6; if(Math.random()<dt*3) setMsg('ACHTUNG: Übergeschwindigkeit! Struktur!'); }
  if(P.nz>10||P.nz<-5){ P.hp-=dt*25; if(Math.random()<dt*4) setMsg('ÜBERLASTUNG! Zelle ächzt!'); }
  if(P.hp<=0){ P.hp=0; return crash('STRUKTURBRUCH – Tragfläche abgerissen.'); }
  const hs=Math.hypot(P.V[0],P.V[2]);
  if(P.onGround&&hs<15&&(P.ammoMG<AMMO_MG||P.ammoKan<AMMO_KAN||P.hp<100)){
    P.ammoMG=Math.min(AMMO_MG,P.ammoMG+dt*120); P.ammoKan=Math.min(AMMO_KAN,P.ammoKan+dt*40); P.hp=Math.min(100,P.hp+dt*10);
    setMsg('Am Boden: Aufmunitionieren + Reparatur …',0.2);
  }
  // Einsatz entschieden und ausgerollt → Einsatzbericht
  if(G.mission&&G.mission.resolved&&P.onGround&&hs<3){ endMission(!G.mission.airborne?'noflight':(Math.hypot(P.x,P.z)<1500?'landed':'landedOut')); return; }

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

  syncPL();
  updateBullets(dt);
  if(G.mode!=='fly') return;
  updateAI(dt);
  if(G.mode!=='fly') return;
  updateParts(dt);
  updateBombs(dt);
  updateFlak(dt);
  if(G.mode!=='fly') return;
  updateTarget();

  if(G.mission){ updateMission(dt); return; }
  // Schnellstart: Welle geschafft? Kurze Pause, dann die nächste
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
  if(!G.started||(G.mode!=='fly'&&G.mode!=='dead')){ setMsg('Erst starten (ENTER oder I), dann X = Reparatur'); return; }
  if(G.mode==='dead'){
    // Wiederbeleben in der Luft (Cheat)
    G.mode='fly'; P.dead=false; G.paused=false;
    P.hp=100; P.ammoMG=Math.max(P.ammoMG,300); P.ammoKan=Math.max(P.ammoKan,100);
    P.y=Math.max(P.y,900); if(!(P.y>50)) P.y=1200;
    P.B=basis(P.heading,0,0); P.V=[P.B.f[0]*115,0,P.B.f[2]*115];
    P.wp=P.wq=P.wr=0; P.onGround=false; P.stall=false; P.trim=trimFor(115,P.y); syncEuler();
    G.flash=0; G.shake=0;
    PL.alive=true;
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
  if(!G.started||(G.mode!=='fly'&&G.mode!=='dead')){ setMsg('Erst starten (ENTER oder I), dann B = Munition'); return; }
  P.ammoMG=AMMO_MG; P.ammoKan=AMMO_KAN;
  const t='Volle Munition – MG '+AMMO_MG+', Kanone '+AMMO_KAN;
  if(G.mode==='dead'){ setMsg('CHEAT: '+t+' (trotzdem ENTER für Neustart)'); }
  else { setMsg('CHEAT: '+t); }
  status('CHEAT '+t);
  noiseBurst(0.2,0.15,900);
}

function crash(reason){
  G.mode='dead'; P.dead=true; G.deadT=0; PL.alive=false; P.hp=Math.max(0,P.hp);
  explode(P.x,Math.max(P.y,2),P.z,true);
  noiseBurst(0.8,0.5,300);
  setMsg('',0);
  status(reason+'  Abschüsse: '+G.kills+'  Punkte: '+G.score+(G.mission?'  – ENTER = Einsatzbericht, R = Einsatz neu':'  Welle: '+G.wave+'  – ENTER / R für Neustart, I = Einsatz vom Flugplatz'));
}

const TYPE_NAME = {spit:'Spitfire Mk.V', mustang:'P-51D Mustang', b17:'B-17G', bf109:'Bf 109 G-6', ju88:'Ju 88 A-4'};
const TYPE_PTS = {spit:100, mustang:150, b17:400};
function getKillText(e){
  return e.type==='b17'?'B-17 ABGESCHOSSEN!':(e.type==='mustang'?'Mustang abgeschossen!':'Spitfire abgeschossen!');
}
// Fällt der Führer einer Formation aus, übernimmt der nächste
function promoteLead(dead, arr){
  const fol=arr.filter(a=>a.alive&&a.leadId===dead.id);
  if(!fol.length) return;
  const nl=fol[0]; nl.leadId=0; if(nl.state==='form') nl.state='attack';
  for(const a of fol) if(a!==nl) a.leadId=nl.id;
}
function killEnemy(e, rammed, byFriend, how){
  e.alive=false; e.dying=true; e.fallT=0;
  promoteLead(e,enemies);
  for(let i=0;i<6;i++) parts.push(mkPart('fire', e.x+rnd(-3,3), e.y+rnd(-3,3), e.z+rnd(-3,3), rnd(-8,8),rnd(-4,8),rnd(-8,8), rnd(0.4,0.8), 3, rnd(9,16)));
  if(dist3(e.x,e.y,e.z,P.x,P.y,P.z)<4000) noiseBurst(0.5,0.4,500);
  if(byFriend){ if(G.mission) G.mission.fKills++; radio('Bordschützen: '+TYPE_NAME[e.type]+' abgeschossen!'); return; }
  G.kills++; G.score+=Math.round((TYPE_PTS[e.type]||100)*(e.ace?1.5:1));
  G.killLog[e.type]=(G.killLog[e.type]||0)+1;
  const M=G.mission;
  if(M){ if(e.type==='b17'){ M.kB++; if(e.aborted) M.aborted=Math.max(0,M.aborted-1); } else M.kF++; }
  G.hitKill=0.9; G.hitMark=0.4;
  setMsg((rammed?'Gerammt! ':(how==='ground'?'In den Boden gezwungen! ':''))+getKillText(e)+(e.ace?' (Ass!)':'')+'  ('+G.kills+' Abschüsse)');
  if(!rammed){ P.ammoMG=Math.min(AMMO_MG,P.ammoMG+40); P.ammoKan=Math.min(AMMO_KAN,P.ammoKan+10); }
}
function killFriend(f){
  if(!f.alive) return;
  f.alive=false; f.dying=true; f.fallT=0;
  promoteLead(f,friends);
  if(G.mission) G.mission.fLost++;
  for(let i=0;i<6;i++) parts.push(mkPart('fire', f.x+rnd(-4,4), f.y+rnd(-3,3), f.z+rnd(-4,4), rnd(-8,8),rnd(-4,8),rnd(-8,8), rnd(0.4,0.8), 3, rnd(10,18)));
  radio(TYPE_NAME[f.type]+' abgeschossen! Noch '+friends.filter(a=>a.alive).length+' Bomber.');
}

// Strecke (o → b) gegen Kugel um p: Treffer auch bei schnellen Geschossen (kein Durchtunneln)
function segHit(b,px,py,pz,ox,oy,oz,r){
  const sx=b.x-ox, sy=b.y-oy, sz=b.z-oz, L2=sx*sx+sy*sy+sz*sz||1;
  const t=clamp(((px-ox)*sx+(py-oy)*sy+(pz-oz)*sz)/L2,0,1);
  const dx=ox+sx*t-px, dy=oy+sy*t-py, dz=oz+sz*t-pz;
  return dx*dx+dy*dy+dz*dz<r*r;
}
function updateBullets(dt){
  // eigene
  for(let i=bullets.length-1;i>=0;i--){
    const b=bullets[i]; b.life-=dt;
    const ox=b.x, oy=b.y, oz=b.z;
    b.x+=b.vx*dt; b.y+=b.vy*dt; b.z+=b.vz*dt; b.vy-=dt*(b.g||4);
    if(b.life<=0||b.y<0){bullets.splice(i,1);continue;}
    for(const e of enemies){
      if(!e.alive) continue;
      const r = e.type==='b17'?28:15;
      if(segHit(b,e.x,e.y,e.z,ox,oy,oz,r)){
        e.hp-= b.kan ? (e.type==='b17'?20:32) : (e.type==='b17'?6:11);
        if(b.kan) parts.push(mkPart('fire', b.x,b.y,b.z, e.vx*0.8,e.vy*0.8,e.vz*0.8, 0.3, 2, 6));
        e.hitT=0.3; e.pHit=0;
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
  // KI-Geschosse: 'allied' (Gegner) treffen dich und die Ju 88, 'axis' (Bordschützen der Ju 88) treffen Gegner
  for(let i=ebullets.length-1;i>=0;i--){
    const b=ebullets[i]; b.life-=dt;
    const ox=b.x, oy=b.y, oz=b.z;
    b.x+=b.vx*dt; b.y+=b.vy*dt; b.z+=b.vz*dt;
    if(b.life<=0||b.y<0){ebullets.splice(i,1);continue;}
    if(b.side==='axis'){
      for(const e of enemies){
        if(!e.alive||!segHit(b,e.x,e.y,e.z,ox,oy,oz,e.type==='b17'?20:7)) continue;   // echte Größe, nicht die Arcade-Trefferzone des Spielers
        e.hp-=rnd(3,6); e.hitT=0.25; spark(b.x,b.y,b.z,4); ebullets.splice(i,1);
        if(e.hp<=0) killEnemy(e,false,true);
        break;
      }
      continue;
    }
    if(PL.alive&&segHit(b,P.x,P.y,P.z,ox,oy,oz,5.5)){
      ebullets.splice(i,1);
      P.hp-=rnd(2,5);
      G.flash=1; G.shake=0.8;
      noiseBurst(0.15,0.3,700);
      if(P.hp<=0){ P.hp=0; return crash('ABGESCHOSSEN – Fallschirm? Zu spät.'); }
      else if(P.hp<30) setMsg('SCHWER BESCHÄDIGT! '+Math.round(P.hp)+'% Hülle');
      continue;
    }
    for(const f of friends){
      if(!f.alive||!segHit(b,f.x,f.y,f.z,ox,oy,oz,16)) continue;
      f.hp-=rnd(4,7); f.hitT=0.25; spark(b.x,b.y,b.z,4); ebullets.splice(i,1);
      if(f.hp<=0) killFriend(f);
      break;
    }
  }
}

// ---------- KI: Gegner und eigene Bomber ----------
// Energiemodell: Fahrt aus Schub, Widerstand (inkl. Kurvenlast) und Steigen/Sinken. Die Kurvenrate begrenzen
// Abrissfahrt und Lastvielfaches, die Querlage folgt dem Auftriebsvektor (erst rollen, dann ziehen).
// Jäger: Verfolgen mit Vorhalt, Lag bei zu viel Annäherung, Abwehrkurven/Scheren, Abstand gewinnen nach dem
// Überschießen, Spitfire kurvt, Mustang greift im Sturz an und zieht wieder hoch, Rotten, Rückzug bei Schaden.
// Bomber: Formation, Zielanflug mit Vorhaltepunkt, Bordschützen mit Vorhalt, Nachzügler, Notwurf.
const PL={id:-1, isPlayer:true, x:0,y:0,z:0, vx:0,vy:0,vz:0, f:[0,0,1], alive:false};
function syncPL(){ PL.x=P.x; PL.y=P.y; PL.z=P.z; PL.vx=P.V[0]; PL.vy=P.V[1]; PL.vz=P.V[2]; PL.f=P.B.f; PL.alive=G.mode==='fly'&&!P.dead; }
function unitById(id){
  if(id===-1) return PL;
  for(const a of enemies) if(a.id===id) return a;
  for(const a of friends) if(a.id===id) return a;
  return null;
}
function live(u){ return !!u&&u.alive; }
function rightOf(f){ const h=Math.atan2(f[0],f[2]); return [Math.cos(h),0,-Math.sin(h)]; }
function turnStep(f,t,a){ const c=Math.cos(a), s=Math.sin(a); return norm([f[0]*c+t[0]*s, f[1]*c+t[1]*s, f[2]*c+t[2]*s]); }
function toward(e,x,y,z){ return norm([x-e.x, y-e.y, z-e.z]); }
function levelTo(e,x,z,alt){ const dx=x-e.x, dz=z-e.z, dh=Math.hypot(dx,dz)||1; return norm([dx/dh, clamp((alt-e.y)/700,-0.25,0.25), dz/dh]); }
// Schussrichtung mit Vorhalt (Geschosse erben die Eigenfahrt des Schützen)
function leadDir(e,u,mv){
  const rx=u.x-e.x, ry=u.y-e.y, rz=u.z-e.z, d=Math.hypot(rx,ry,rz)||1, t=d/mv;
  return {dir:norm([rx+(u.vx-e.vx)*t, ry+(u.vy-e.vy)*t, rz+(u.vz-e.vz)*t]), d};
}
function slotPos(L,s){ const r=rightOf(L.f), fh=norm([L.f[0],0,L.f[2]]); return [L.x+r[0]*s[0]-fh[0]*s[2], L.y+s[1], L.z+r[2]*s[0]-fh[2]*s[2]]; }
function followSlot(e,L,s){
  const p=slotPos(L,s);
  const along=(p[0]-e.x)*L.f[0]+(p[1]-e.y)*L.f[1]+(p[2]-e.z)*L.f[2];
  return {D:toward(e,p[0]+L.f[0]*150,p[1]+L.f[1]*150,p[2]+L.f[2]*150), thr:clamp((L.thr||0.8)+along*0.012,0.15,1)};
}

function aiFly(e,D,thr,dt,nCap){
  const T=ACT[e.type], v=e.v, vs=T.vs, f=e.f;
  D=norm([D[0],clamp(D[1],-0.8,0.8),D[2]]);   // keine senkrechten Figuren
  const pred=e.y+f[1]*v*2.5;                   // in 2,5 s unter 260 m? → hochziehen
  if(pred<260){ const k=clamp((260-pred)/260,0,1); D=norm([D[0]*(1-k)+f[0]*k, Math.max(D[1],0.15+0.6*k), D[2]*(1-k)+f[2]*k]); }
  const nAv=Math.max(1,Math.min(nCap,(v/vs)*(v/vs)*0.95));
  const wMax=9.81*Math.sqrt(nAv*nAv-1)/Math.max(v,20);
  const cosA=clamp(dot(f,D),-1,1);
  let w=Math.min(wMax,Math.acos(cosA)*2.2);
  let t=[D[0]-f[0]*cosA, D[1]-f[1]*cosA, D[2]-f[2]*cosA];
  if(Math.hypot(t[0],t[1],t[2])<1e-4){ const r=rightOf(f); t=[r[0]*e.dir,0,r[2]*e.dir]; }
  t=norm(t);
  const gp=[-f[0]*f[1], 1-f[1]*f[1], -f[2]*f[1]];   // Anteil der Senkrechten quer zur Flugrichtung
  const r0=rightOf(f), u0=cross(f,r0);
  let L=[t[0]*w*v+gp[0]*9.81, t[1]*w*v+gp[1]*9.81, t[2]*w*v+gp[2]*9.81];
  const rollT=Math.atan2(dot(L,r0),dot(L,u0)), rr=T.roll*dt;
  e.roll=wrap(e.roll+clamp(wrap(rollT-e.roll),-rr,rr));
  if(w*v>3) w*=clamp(Math.cos(wrap(rollT-e.roll)),0.15,1);
  L=[t[0]*w*v+gp[0]*9.81, t[1]*w*v+gp[1]*9.81, t[2]*w*v+gp[2]*9.81];
  const n=Math.hypot(L[0],L[1],L[2])/9.81;
  let nf=turnStep(f,t,w*dt);
  if(v<vs*1.08){ const k=clamp((vs*1.08-v)/vs*4,0,1)*0.9*dt; nf=norm([nf[0],nf[1]-k,nf[2]]); }   // zu langsam: Nase fällt
  e.f=nf;
  const vm=T.vmax*(1+0.25*clamp(e.y,0,5700)/5700);
  const a=T.acc*(thr-(v/vm)*(v/vm))-9.81*nf[1]-T.ind*(n*n-1)*(vs/v)*(vs/v);
  e.v=Math.max(vs*0.6,v+a*dt);
  e.vx=nf[0]*e.v; e.vy=nf[1]*e.v; e.vz=nf[2]*e.v;
  e.x+=e.vx*dt; e.y+=e.vy*dt; e.z+=e.vz*dt;
  e.heading=Math.atan2(nf[0],nf[2]); e.pitch=Math.asin(clamp(nf[1],-1,1)); e.n=n; e.thr=thr;
}

function foesOf(e){
  return e.side==='allied' ? (PL.alive?[PL]:[]).concat(friends.filter(live)) : enemies.filter(a=>a.alive&&ACT[a.type].style!=='bomber');
}
function pickTarget(e){
  let best=null, bs=Infinity;
  for(const u of foesOf(e)){
    let s=dist3(u.x,u.y,u.z,e.x,e.y,e.z);
    if(!u.isPlayer&&e.prefF) s*=0.45;   // Abfangjäger wollen an die Bomber
    if(u.isPlayer&&!e.prefF) s*=0.8;
    if(u.id===e.tgtId) s*=0.8;          // am Ziel bleiben
    if(s<bs){ bs=s; best=u; }
  }
  return best;
}
function detects(e,u){
  const dx=u.x-e.x, dy=u.y-e.y, dz=u.z-e.z, d=Math.hypot(dx,dy,dz)||1;
  const ahead=(dx*e.f[0]+dy*e.f[1]+dz*e.f[2])/d;
  return d<(2200+2800*e.skill)*(ahead<-0.3?0.5:1);   // von hinten sieht man schlechter
}
// Sitzt der Spieler im Nacken (zielt auf uns, nicht frontal) oder hat gerade getroffen?
function threatTo(e){
  if(!PL.alive) return null;
  const dx=e.x-PL.x, dy=e.y-PL.y, dz=e.z-PL.z, d=Math.hypot(dx,dy,dz)||1;
  if(e.pHit<1.5&&d<1500) return PL;
  if(d>350+400*e.skill) return null;   // Anfänger merken den Verfolger erst spät
  const aim=(PL.f[0]*dx+PL.f[1]*dy+PL.f[2]*dz)/d, facing=-(e.f[0]*dx+e.f[1]*dy+e.f[2]*dz)/d;
  return aim>0.94&&facing<0.7 ? PL : null;
}
// Nicht alle stürzen sich gleichzeitig auf dich: Wer weiter weg ist, kreist überhöht und wartet auf seine Chance
function maxAttackers(){ const M=G.mission; return M?(M.b.lvl<0.35?1:2):(G.wave<=1?1:2); }
function mustWait(e,u){
  if(!u.isPlayer) return false;
  const d=dist3(u.x,u.y,u.z,e.x,e.y,e.z); let n=0;
  for(const a of enemies) if(a!==e&&a.alive&&a.tgtId===-1&&(a.state==='attack'||a.state==='climb'||a.state==='extend')&&dist3(u.x,u.y,u.z,a.x,a.y,a.z)<d) n++;
  return n>=maxAttackers();
}
function alertWing(e,u){ for(const w of enemies) if(w.alive&&w.leadId===e.id&&w.state==='form'){ w.state='attack'; w.tgtId=u.id; } }
function setFlee(e){
  if(e.state==='flee') return;
  e.state='flee';
  if(dist3(e.x,e.y,e.z,P.x,P.y,P.z)<4000) radio(TYPE_NAME[e.type]+' dreht ab Richtung England.');
}
// Entscheidungen im Reaktionstakt (Asse schneller als Anfänger)
function aiDecide(e){
  const T=ACT[e.type], sk=e.skill;
  if(e.state==='flee') return;
  if(e.ammo<=0||(e.hp<e.maxHp*0.3&&Math.random()<0.35+0.4*(1-sk))){ setFlee(e); return; }
  const th=threatTo(e);
  if(th&&e.state!=='defend'&&(e.pHit<1.5||Math.random()<0.1+0.8*sk)){
    e.state='defend'; e.thId=th.id; e.stT=rnd(1.8,3.5)*(0.7+0.6*sk);
    const r=rightOf(e.f); e.dir=((th.x-e.x)*r[0]+(th.z-e.z)*r[2])>=0?1:-1;   // in den Angreifer hineinkurven
    e.dive=T.style==='bnz'&&e.y>1500&&Math.random()<0.5; e.jinkT=rnd(1,2);
    alertWing(e,th);
    return;
  }
  if(e.state==='defend'&&!th&&e.pHit>1.5&&e.stT<2.5&&Math.random()<0.3+0.6*sk){ e.state='attack'; e.tgtId=e.thId; return; }   // Verfolger abgeschüttelt → Gegenangriff
  if(e.state==='defend'||e.state==='extend'||e.state==='climb') return;
  if(e.state==='form'){
    const L=unitById(e.leadId);
    if(!live(L)){ e.state='patrol'; e.wp={x:e.x,z:e.z}; return; }
    if(!['patrol','transit','escort','form','inbound'].includes(L.state)){ e.state='attack'; e.tgtId=L.tgtId; return; }
    const u=pickTarget(e);
    if(u&&detects(e,u)){ e.state='attack'; e.tgtId=u.id; }
    return;
  }
  const u=pickTarget(e);
  if(!u){ if(e.state==='attack'){ e.state='patrol'; e.wp={x:e.x,z:e.z}; } return; }
  if(e.state==='escort'){
    const B=unitById(e.escId);
    const d=dist3(u.x,u.y,u.z,e.x,e.y,e.z);
    if(!((live(B)&&dist3(u.x,u.y,u.z,B.x,B.y,B.z)<2600)||(d<1500&&detects(e,u)))) return;
  } else if(e.state==='patrol'||e.state==='transit'){ if(!detects(e,u)) return; }
  if(e.state==='wait'||e.state==='attack'){ e.tgtId=u.id; e.state=mustWait(e,u)?'wait':'attack'; if(e.state==='wait') return; }
  if(e.state!=='attack'&&mustWait(e,u)){ e.state='wait'; e.tgtId=u.id; return; }
  if(e.state!=='attack') alertWing(e,u);
  e.state='attack'; e.tgtId=u.id;
  if(T.style==='bnz'&&u.y>e.y+150&&dist3(u.x,u.y,u.z,e.x,e.y,e.z)>2000&&Math.random()<0.7){ e.state='climb'; e.stT=rnd(5,9); }
}
function startExtend(e,tg){
  const T=ACT[e.type], away=norm([e.x-tg.x,0,e.z-tg.z]), fh=norm([e.f[0],0,e.f[2]]);
  const zoom=T.style==='bnz'&&e.v>T.vmax*0.75;   // Mustang: mit Überschussfahrt hochziehen
  e.ext=norm([fh[0]*0.7+away[0]*0.5, zoom?0.55:(e.y<1200?0.2:0.05), fh[2]*0.7+away[2]*0.5]);
  e.state='extend'; e.stT=rnd(2,4)*(0.6+0.6*e.skill)*(zoom?1.3:1);
}
function attackSteer(e,tg){
  const T=ACT[e.type], sk=e.skill;
  const rx=tg.x-e.x, ry=tg.y-e.y, rz=tg.z-e.z, d=Math.hypot(rx,ry,rz)||1, rn=[rx/d,ry/d,rz/d];
  const closure=-((tg.vx-e.vx)*rn[0]+(tg.vy-e.vy)*rn[1]+(tg.vz-e.vz)*rn[2]);
  const ata=Math.acos(clamp(dot(e.f,rn),-1,1));
  const tgAway=dot(tg.f,rn);                       // > 0: Ziel fliegt von uns weg (wir sitzen hinten)
  const headOn=tgAway<-0.85&&ata<0.5;
  if((d<160&&closure>20)||(d<320&&ata>1.9)||(headOn&&d<180)){ startExtend(e,tg); return {D:e.ext,thr:1,shoot:false}; }
  let D, thr=1;
  if(d>1300){
    D=rn;
    if(T.style==='bnz'&&e.y<tg.y+300) D=norm([rn[0],rn[1]+0.25,rn[2]]);   // Mustang: lieber von oben kommen
  } else if(tgAway>0.4&&closure>55&&d<700){
    D=toward(e,tg.x-tg.vx*0.8,tg.y-tg.vy*0.8,tg.z-tg.vz*0.8); thr=0.3;     // zu schnell: hinter das Ziel (Lag), Gas raus
  } else {
    const L=leadDir(e,tg,880), k=clamp((1300-d)/700,0,1)*(0.6+0.4*sk), o=e.aimOff;
    D=norm([rn[0]+(L.dir[0]-rn[0])*k+o[0], rn[1]+(L.dir[1]-rn[1])*k+o[1], rn[2]+(L.dir[2]-rn[2])*k+o[2]]);
    if(tgAway>0.4&&closure>15&&d<450) thr=0.5;
    if(headOn&&sk>0.45&&d<1200){ const r=rightOf(e.f); D=norm([D[0]+r[0]*e.dir*0.07, D[1], D[2]+r[2]*e.dir*0.07]); }   // knapp vorbei statt Rammstoß
  }
  return {D, thr, shoot:d<T.gunR*(0.75+0.5*sk)+50};
}
function aiGuns(e,tg){
  if(e.ammo<=0||e.pause>0||e.gunCd>0) return;
  const T=ACT[e.type], L=leadDir(e,tg,880);
  if(L.d>T.gunR*(0.75+0.5*e.skill)||L.d<35) return;
  const err=Math.acos(clamp(dot(e.f,L.dir),-1,1));
  if(err>0.03+0.05*(1-e.skill)+(tg.isPlayer?0:0.02)) return;
  e.gunCd=0.12+0.12*(1-e.skill); e.ammo--; e.burst+=e.gunCd;   // Anfänger schießen zögerlicher
  if(e.burst>rnd(0.4,0.9)){ e.burst=0; e.pause=rnd(0.8,1.8)*(1.3-0.6*e.skill); }   // Feuerstöße statt Dauerfeuer
  const k=Math.min(1,0.008/Math.max(err,1e-4)), sp=0.028+0.04*(1-e.skill), f=e.f;
  const dir=norm([f[0]+(L.dir[0]-f[0])*k+rnd(-sp,sp), f[1]+(L.dir[1]-f[1])*k+rnd(-sp,sp), f[2]+(L.dir[2]-f[2])*k+rnd(-sp,sp)]);
  ebullets.push({x:e.x+f[0]*6, y:e.y+f[1]*6, z:e.z+f[2]*6, vx:e.vx+dir[0]*880, vy:e.vy+dir[1]*880, vz:e.vz+dir[2]*880, life:1.5, side:e.side});
  if(e.ammo%3===0&&dist3(e.x,e.y,e.z,P.x,P.y,P.z)<1500) noiseBurst(0.07,0.08,900);
}
function aiFighter(e,dt){
  const T=ACT[e.type], sk=e.skill;
  e.stT-=dt; e.think-=dt; e.gunCd-=dt; if(e.pause>0) e.pause-=dt;
  if(e.think<=0){
    e.think=(0.9-0.6*sk)*rnd(0.7,1.3);
    aiDecide(e);
    const a=(1-sk)*0.045; e.aimOff=[rnd(-a,a),rnd(-a,a),rnd(-a,a)];
  }
  let D=null, thr=1, nCap=T.nMax*(0.7+0.3*sk), tg=null, shoot=false;
  const st=e.state;
  if(st==='flee'){
    const dP=dist3(e.x,e.y,e.z,P.x,P.y,P.z);
    D=norm([0, e.y>900?-0.12:0.02, 1]);   // Richtung England, leicht drücken für Fahrt
    if(dP<900) D=norm([D[0]+Math.sin(G.time*1.7+e.id)*0.8, D[1], D[2]]);   // Haken schlagen
    if(dP>9000&&e.z>P.z+2000){ e.alive=false; e.fled=true; if(G.mission) G.mission.escaped++; promoteLead(e,enemies); return; }
  } else if(st==='defend'){
    const th=unitById(e.thId);
    if(!live(th)||e.stT<=0) e.state='attack';
    else if(e.dive){ D=norm([e.f[0],-0.9,e.f[2]]); if(e.y<1000) e.dive=false; nCap=T.nMax; }
    else {
      const r=rightOf(e.f);
      D=norm([r[0]*e.dir*1.6+e.f[0]*0.3, e.y<900?0.35:0.04, r[2]*e.dir*1.6+e.f[2]*0.3]);
      if(sk>0.5&&dist3(th.x,th.y,th.z,e.x,e.y,e.z)<350&&(e.jinkT-=dt)<=0){ e.jinkT=rnd(1.2,2.4); e.dir=-e.dir; }   // Schere nur dicht dran
      nCap=T.nMax*(0.75+0.25*sk);
    }
  } else if(st==='extend'){
    D=e.ext; if(e.stT<=0) e.state='attack';
  } else if(st==='climb'){
    tg=unitById(e.tgtId);
    if(!live(tg)||e.stT<=0||e.y>tg.y+400) e.state='attack';
    else { const h=norm([tg.x-e.x,0,tg.z-e.z]), r=rightOf(h); D=norm([h[0]+r[0]*0.6*e.dir, 0.45, h[2]+r[2]*0.6*e.dir]); }
  } else if(st==='form'){
    const L=unitById(e.leadId);
    if(live(L)){ const o=followSlot(e,L,e.slot); D=o.D; thr=o.thr; } else e.state='patrol';
  } else if(st==='escort'){
    let B=unitById(e.escId);
    if(!live(B)) B=enemies.find(a=>a.alive&&a.type==='b17');
    if(live(B)){ e.escId=B.id; const o=followSlot(e,B,e.slot); D=o.D; thr=o.thr; } else { e.escId=0; e.state='attack'; }
  } else if(st==='patrol'){
    const c=e.wp||{x:e.x,z:e.z}, rx=e.x-c.x, rz=e.z-c.z, r=Math.hypot(rx,rz)||1, k=(r-e.pr)/e.pr;
    D=norm([rz/r*e.dir-rx/r*k, clamp((e.alt0-e.y)/800,-0.2,0.2), -rx/r*e.dir-rz/r*k]); thr=0.7;
  } else if(st==='wait'){
    const u=unitById(e.tgtId);
    if(!live(u)) e.state='attack';
    else { const rx=e.x-u.x, rz=e.z-u.z, r=Math.hypot(rx,rz)||1, k=(r-1700)/1700;
      D=norm([rz/r*e.dir-rx/r*k, clamp((u.y+450-e.y)/600,-0.25,0.3), -rx/r*e.dir-rz/r*k]); thr=0.85; }
  } else if(st==='transit'){
    const W=e.wpId?unitById(e.wpId):null, p=live(W)?W:(e.wp||PL);
    D=levelTo(e,p.x,p.z,e.alt0); thr=0.9;
  }
  if(e.state==='attack'){
    tg=unitById(e.tgtId);
    if(!live(tg)){ tg=pickTarget(e); if(tg) e.tgtId=tg.id; else { e.state='patrol'; e.wp={x:e.x,z:e.z}; } }
    if(tg&&e.escId){ const B=unitById(e.escId); if(live(B)&&dist3(e.x,e.y,e.z,B.x,B.y,B.z)>4500){ e.state='escort'; tg=null; } }   // Begleitjäger kehren zum Pulk zurück
    if(tg){ const o=attackSteer(e,tg); D=o.D; thr=o.thr; shoot=o.shoot; }
  }
  aiFly(e,D||e.f,thr,dt,nCap);
  if(shoot) aiGuns(e,tg); else if(e.burst>0) e.burst=Math.max(0,e.burst-dt);
}
function dropBomb(e){
  bombs.push({x:e.x+rnd(-2,2), y:e.y-2, z:e.z+rnd(-2,2), vx:e.vx, vy:e.vy, vz:e.vz, side:e.side, jett:e.jett});
}
function aiGunners(e){
  if(e.gunCd>0) return;
  const T=ACT[e.type];
  let best=null, bd=T.gunR;
  for(const u of foesOf(e)){ const d=dist3(u.x,u.y,u.z,e.x,e.y,e.z); if(d<bd){ bd=d; best=u; } }
  if(!best){ e.gunCd=0.3; return; }
  const b17=e.type==='b17';   // B-17: 13 MG rundum, Ju 88: wenige Einzel-MG
  e.gunCd=rnd(0.25,0.5)*(b17?1:2.6);
  const L=leadDir(e,best,850), sp=(b17?0.02:0.04)+0.035*L.d/T.gunR;
  const dir=norm([L.dir[0]+rnd(-sp,sp), L.dir[1]+rnd(-sp,sp), L.dir[2]+rnd(-sp,sp)]);
  ebullets.push({x:e.x+rnd(-4,4), y:e.y+rnd(-1,2), z:e.z+rnd(-6,6), vx:e.vx+dir[0]*850, vy:e.vy+dir[1]*850, vz:e.vz+dir[2]*850, life:1.3, side:e.side});
  if(dist3(e.x,e.y,e.z,P.x,P.y,P.z)<1000) noiseBurst(0.05,0.05,1100);
}
function aiBomber(e,dt){
  const T=ACT[e.type], M=G.mission;
  e.gunCd-=dt;
  if(e.hp<e.maxHp*0.45) e.straggler=true;   // beschädigt: fällt aus der Formation zurück
  if(!e.bombed&&e.bombs>0&&!e.jett&&e.hp<e.maxHp*0.3){
    e.jett=true; e.dropT=0.01; e.state='flee'; e.aborted=true;
    if(M&&e.side==='allied') M.aborted++;
    if(dist3(e.x,e.y,e.z,P.x,P.y,P.z)<6000) radio(e.side==='allied'?'B-17 wirft die Bomben im Notwurf ab und dreht ab!':'Ju 88 schwer getroffen – Notwurf, dreht ab!');
  }
  const base=e.base||{x:e.x,z:e.z+40000};
  const L=e.leadId?unitById(e.leadId):null, lead=live(L)&&!e.straggler&&!L.straggler&&L.state!=='flee';
  const run=!e.bombed&&e.bombs>0&&e.aim&&!e.jett&&Math.hypot(e.aim.x-e.x,e.aim.z-e.z)<6000;
  let D, thr=e.cruise;
  if(e.state==='flee'||(e.bombed&&!(lead&&L.bombed))){ D=levelTo(e,base.x,base.z,e.alt0); if(e.state==='flee') thr=1; }
  else if(run) D=levelTo(e,e.aim.x,e.aim.z,e.alt0);               // Zielanflug auf den eigenen Zielpunkt
  else if(lead){ const o=followSlot(e,L,e.slot); D=o.D; thr=o.thr; }
  else { const w=e.bombed?base:(e.wp||base); D=levelTo(e,w.x,w.z,e.alt0); }
  if(e.straggler) thr=Math.min(thr,0.6);
  aiFly(e,D,thr,dt,T.nMax);
  // Bombenwurf, wenn der vorausberechnete Aufschlagpunkt am Zielpunkt vorbeizieht (Reihenwurf)
  if(!e.bombed&&e.bombs>0&&e.aim&&!e.jett&&e.dropT<=0){
    const tf=Math.sqrt(2*Math.max(e.y,10)/9.81), dd=Math.hypot(e.x+e.vx*tf-e.aim.x, e.z+e.vz*tf-e.aim.z);
    if(dd<(e.bombs-1)*12+40||(dd<450&&dd>e.lastDD)) e.dropT=0.01;
    e.lastDD=dd;
  }
  if(e.dropT>0&&e.bombs>0){
    e.dropT-=dt;
    if(e.dropT<=0){
      dropBomb(e); e.bombs--; e.dropT=e.bombs>0?0.25:0;
      if(e.bombs===0&&!e.jett){
        e.bombed=true;
        if(M&&((M.type==='abwehr'&&e.side==='allied')||(M.type==='begleit'&&e.side==='axis'))){
          M.dropped++;
          if(!M.called.drop){ M.called.drop=1; radio(e.side==='allied'?'Bomben fallen auf '+M.b.tname+'!':'Ju 88: Bomben fallen auf den Geleitzug!'); }
        }
      }
    }
  }
  aiGunners(e);
  // Heimkehr: Ju 88 erreichen den Platz, B-17 verschwinden über dem Kanal
  const dP=dist3(e.x,e.y,e.z,P.x,P.y,P.z);
  if(e.side==='axis'&&(e.bombed||e.state==='flee')&&Math.hypot(e.x-base.x,e.z-base.z)<2500){
    e.alive=false; e.home=true; promoteLead(e,friends);
    if(M){ M.fHome++; if(!M.called.home){ M.called.home=1; radio('Ju 88 zurück am Platz. Danke für den Schutz!'); } }
  } else if(e.side==='allied'&&(e.bombed||e.state==='flee')&&dP>12000){
    e.alive=false; e.fled=true; promoteLead(e,enemies); if(M) M.escaped++;
  }
}
function stepAI(e,dt){
  if(e.dying){
    // Brennend abstürzen, am Boden explodieren
    e.fallT+=dt;
    if(e.hitT>0) e.hitT-=dt;
    const big=ACT[e.type].style==='bomber';
    e.pitch+=(-0.85-e.pitch)*Math.min(1,dt*0.8);
    e.roll+=dt*(big?0.6:2.4);
    e.heading+=dt*0.3;
    const ev=viewVec(e.heading,e.pitch), ems=(big?260:420)/3.6;
    e.vx=ev.x*ems; e.vy=ev.y*ems; e.vz=ev.z*ems;
    e.x+=e.vx*dt; e.y+=e.vy*dt; e.z+=e.vz*dt;
    emitSmoke(e,dt,true);
    if(e.y<=3||e.fallT>25){
      if(e.y<=3){ explode(e.x,3,e.z,big); if(dist3(e.x,e.y,e.z,P.x,P.y,P.z)<5000) noiseBurst(0.6,0.3,250); }
      e.dying=false;
    }
    return;
  }
  if(!e.alive) return;
  if(e.hitT>0) e.hitT-=dt;
  if(e.ramCd>0) e.ramCd-=dt;
  e.pHit+=dt;
  if(ACT[e.type].style==='bomber') aiBomber(e,dt); else aiFighter(e,dt);
  if(!e.alive) return;
  if(e.y<6){   // Bodenberührung: im Kurvenkampf mit dir zählt es als Abschuss
    e.y=6;
    if(e.side==='axis') killFriend(e);
    else if(e.tgtId===-1&&PL.alive&&dist3(e.x,e.y,e.z,P.x,P.y,P.z)<2500) killEnemy(e,false,false,'ground');
    else { e.alive=false; e.dying=true; e.fallT=0; promoteLead(e,enemies); }
    return;
  }
  if(e.side==='allied'&&PL.alive&&e.ramCd<=0&&dist3(e.x,e.y,e.z,P.x,P.y,P.z)<22){   // Rammen?
    e.ramCd=2; e.hp-=30; P.hp-=35; G.flash=1; G.shake=1; explode((e.x+P.x)/2,(e.y+P.y)/2,(e.z+P.z)/2,false);
    if(P.hp<=0){ P.hp=0; crash('RAMMSTOSS – beide Maschinen verloren.'); return; }
    if(e.hp<=0) killEnemy(e,true);
  }
  emitSmoke(e,dt,false);
}
function updateAI(dt){
  for(const e of enemies){ stepAI(e,dt); if(G.mode!=='fly') return; }
  for(const f of friends){ stepAI(f,dt); if(G.mode!=='fly') return; }
  if(enemies.some(e=>!e.alive&&!e.dying)) enemies=enemies.filter(e=>e.alive||e.dying);
  if(friends.some(e=>!e.alive&&!e.dying)) friends=friends.filter(e=>e.alive||e.dying);
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
    if(f.cd<=0&&d<4000&&P.y<3500&&P.y>150){
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

function buildJu88(){
  const m=newModel();
  const D1='#3d4a35', D2='#4c5a3c', U='#9fb3c2', GL='#9cc3d5', DK='#262624';
  const st=[
    {z:7.4,w:0.05,h:0.05,y:0.25},{z:7.0,w:0.62,h:0.62,y:0.25},{z:6.0,w:0.95,h:1.0,y:0.3},{z:4.6,w:1.0,h:1.1,y:0.3},
    {z:2.2,w:0.92,h:1.0,y:0.2},{z:-1.5,w:0.75,h:0.85,y:0.18},{z:-5.0,w:0.45,h:0.55,y:0.25},{z:-7.4,w:0.16,h:0.25,y:0.4},{z:-7.8,w:0.04,h:0.08,y:0.42},
  ];
  const L=loft(m,st,10,(i,k,up)=>{
    if(i===0) return GL;
    if(i===1&&up>-0.6) return GL;             // Glasbug
    if(i===2&&up>0.3) return GL;              // Kanzel
    if(up>-0.2) return ((i+k)%3===0)?D2:D1;   // Splittertarnung oben
    return U;
  });
  const yw=x=>-0.15+0.05*x;
  const W=wing(m,[[0,3.0],[9.4,1.5],[10.1,1.0],[10.1,0.1],[9.5,-0.2],[0,-0.3]],yw,D1,U);
  for(const sd of [1,-1]){
    const t=sd>0?W.tr:W.tl, b=sd>0?W.br:W.bl;
    decal(m,t,[[sd*1.5,yw(1.5),2.6],[sd*5,yw(5),2.1],[sd*6,yw(6),0.2],[sd*2,yw(2),-0.2]],D2);
    balkenkreuz(m,t,[sd*7.2,yw(7.2),0.7],[1,0,0],[0,0,1],0.8);
    balkenkreuz(m,b,[sd*7.2,yw(7.2),0.7],[1,0,0],[0,0,1],0.8);
  }
  // Zwei Motoren mit Ringkühler
  for(const xo of [-3.4,3.4]){
    const y0=yw(3.4)-0.2;
    loft(m,[{z:5.0,w:0.05,h:0.05,y:y0},{z:4.75,w:0.66,h:0.66,y:y0},{z:4.3,w:0.78,h:0.78,y:y0},{z:1.2,w:0.62,h:0.7,y:y0-0.05},{z:-1.8,w:0.22,h:0.28,y:y0}],8,
      (i,k,up)=>i<=1?DK:(up>-0.2?D1:U),xo);
    prop(m,xo,y0,5.1,1.7);
  }
  wing(m,[[0,-5.6],[3.6,-6.3],[3.8,-6.8],[3.5,-7.3],[0,-7.5]],()=>0.45,D1,U);
  fin(m,[[0.6,-5.4],[1.8,-6.2],[2.9,-6.9],[3.0,-7.4],[2.6,-7.8],[0.4,-7.8]],D1);
  for(const [k,sd] of [[2,1],[7,-1]]) balkenkreuz(m,L[5][k],[sd*sideX(st,-3.6),0.25,-3.6],[0,0,1],[0,1,0],0.45);
  box(m,-0.35,0.35,-1.15,-0.65,4.6,2.0,D1);   // Bodenwanne
  return m;
}
function buildShip(){
  const m=newModel();
  const HULL='#4a4d50', DECK='#6e6455', SUP='#c9c4b6', FUN='#2b2b2b', H=4.5, W=6;
  face(m,[[-W,H,-38],[W,H,-38],[W,H,28],[0,H,40],[-W,H,28]],DECK,[0,1,0]);
  face(m,[[W,0,-38],[W,0,28],[W,H,28],[W,H,-38]],HULL,[1,0,0]);
  face(m,[[-W,0,-38],[-W,0,28],[-W,H,28],[-W,H,-38]],HULL,[-1,0,0]);
  face(m,[[W,0,28],[0,0,40],[0,H,40],[W,H,28]],HULL,[1,0,1]);
  face(m,[[-W,0,28],[0,0,40],[0,H,40],[-W,H,28]],HULL,[-1,0,1]);
  face(m,[[-W,0,-38],[W,0,-38],[W,H,-38],[-W,H,-38]],HULL,[0,0,-1]);
  box(m,-4.5,4.5,H,H+6,-26,-12,SUP,true);       // Aufbauten
  box(m,-3.5,3.5,H+6,H+9,-24,-17,SUP,true);     // Brücke
  box(m,-1.3,1.3,H+6,H+13,-14,-10.5,FUN,true);  // Schornstein
  box(m,-0.3,0.3,H,H+16,12,12.6,FUN,true);      // Mast
  box(m,-3,3,H,H+2.5,16,24,'#5a5246',true);     // Ladeluke
  return m;
}
function buildFactory(){
  const m=newModel();
  houseInto(m,0,0,44,26,9,3,'#8c7f6a','#4f4b45');
  houseInto(m,-38,14,24,34,8,3,'#958a74','#57524a');
  houseInto(m,34,-12,22,40,11,4,'#7d7262','#4a4640');
  box(m,-2,2,0,42,22,26,'#7a4a3a',true);        // Schlote
  box(m,8,11,0,34,22,25,'#7a4a3a',true);
  box(m,-60,-48,0,6,-30,-18,'#6a665c',true);    // Lager
  return m;
}

const MODELS = {
  spit: buildSpit(), mustang: buildMustang(), b17: buildB17(), bf109: buildBf109(), ju88: buildJu88(),
  house1: house(9,12,5,4,'#dcd3bf','#8e3b28'), house2: house(8,10,5,3.5,'#9b5b3f','#5a3a2c'),
  house3: house(7,9,4,3,'#cdbd9e','#4d5358'), barn: house(12,20,6,5,'#6b4a32','#5f625e'),
  church: buildChurch(), hangar: house(30,24,8,4,'#6d6a5e','#4c5048'), tower: buildTower(),
  ship: buildShip(), factory: buildFactory(),
};
// Sichtbarer Maßstab (arcade: Gegner etwas größer, damit man sie erkennt)
const VIS = {spit:2, mustang:2, b17:1.5, bf109:1, ju88:1.5};

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
  if(G.mode==='title') drawTitle();
  else if(G.mode==='briefing') drawBriefing();
  else if(G.mode==='debrief') drawDebrief();
  else drawFlight();
  if(G.menu){ ctx.setTransform(SCALE,0,0,SCALE,0,0); ctx.globalAlpha=1; drawMenu(); }
}
function drawFlight(){
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
    drawFriendMarks(); drawTarget(); if(cockpitView) drawSight();
  }
  if(cockpitView&&G.cockpit) drawCockpit();
  if(G.mode==='fly') drawStick(cockpitView&&G.cockpit?46:6, cockpitView&&G.cockpit?120:VH-30);
  drawHud();
  if(G.showMap) drawMap();
  if(G.msgT>0&&G.msg) drawCenterText(G.msg,32);
  if(G.flash>0){ctx.fillStyle=`rgba(170,0,0,${Math.min(0.4,G.flash*0.4)})`;ctx.fillRect(-4,-4,VW+8,VH+8);}
  if(G.mode==='dead'){
    if(G.mission){ drawCenterText('ABGESCHOSSEN – ENTER = Einsatzbericht, R = Einsatz neu',VH*0.3); drawCenterText('Abschüsse: '+G.kills+'   Punkte: '+G.score,VH*0.3+13); }
    else { drawCenterText('ABGESTÜRZT – ENTER / R = Neustart, I = Einsatz',VH*0.3); drawCenterText('Abschüsse: '+G.kills+'   Punkte: '+G.score+'   Welle: '+G.wave,VH*0.3+13); }
  }
  if(G.paused&&!G.menu){ctx.fillStyle='rgba(0,0,0,0.6)';ctx.fillRect(0,0,VW,VH);drawCenterText('PAUSE – Weiter mit P',VH/2-4);}
}
// Eigene Bomber: hellblaue Raute, Zustand in Prozent
function drawFriendMarks(){
  ctx.font='4px '+MONO; ctx.textAlign='center'; ctx.lineWidth=0.5;
  for(const f of friends){
    if(!f.alive) continue;
    const c=toCam(f.x,f.y,f.z); if(c[2]<NEAR) continue;
    const s=scr(c), d=dist3(f.x,f.y,f.z,P.x,P.y,P.z);
    if(d<120||s[0]<0||s[0]>VW||s[1]<10||s[1]>VH) continue;
    const r=clamp(MODELS.ju88.rad*VIS.ju88*FOC/c[2]*0.7,3,30);
    ctx.strokeStyle='rgba(120,230,255,0.85)';
    ctx.beginPath(); ctx.moveTo(s[0],s[1]-r); ctx.lineTo(s[0]+r,s[1]); ctx.lineTo(s[0],s[1]+r); ctx.lineTo(s[0]-r,s[1]); ctx.closePath(); ctx.stroke();
    if(d<4000){ ctx.fillStyle='rgba(120,230,255,0.9)'; ctx.fillText('Ju 88 '+Math.round(f.hp/f.maxHp*100)+'%',s[0],s[1]+r+5); }
  }
  ctx.textAlign='left';
}
function drawBomb(b){
  const c=toCam(b.x,b.y,b.z); if(c[2]<NEAR) return;
  const s=scr(c), q=Math.max(1.2/SCALE,0.6*FOC/c[2]);
  ctx.fillStyle='#1c1c1a'; ctx.fillRect(s[0]-q/2,s[1]-q,q,q*2);
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
    else if(s.ref){ const r=s.ref; if(r.gone) continue; const B=r.sunk?basis(r.h,r.tilt,r.tilt*0.6):s.B; add(s.x,4,s.z,()=>drawModel(s.m,s.x,-r.tilt*12,s.z,B,1,0,false)); }
    else add(s.x,4,s.z,()=>drawModel(s.m,s.x,0,s.z,s.B,1,0,false));
  }
  // Wolken
  for(const c of clouds) for(const p of c.puffs){
    const x=c.x+p.dx, y=c.y+p.dy, z=c.z+p.dz;
    add(x,y,z,()=>drawPuff(x,y,z,p.r));
  }
  // Flugzeuge
  for(const e of enemies.concat(friends)) if(e.alive||e.dying){
    const B=basis(e.heading,e.pitch,e.roll);
    add(e.x,e.y,e.z,()=>drawModel(MODELS[e.type],e.x,e.y,e.z,B,VIS[e.type],e.hitT>0?Math.min(0.7,e.hitT*2.5):0,true));
  }
  for(const b of bombs) add(b.x,b.y,b.z,()=>drawBomb(b));
  if(G.extView&&G.mode==='fly'){
    const B=P.B;
    add(P.x,P.y,P.z,()=>drawModel(MODELS.bf109,P.x,P.y,P.z,B,1,0,true));
  }
  for(const p of parts) add(p.x,p.y,p.z,()=>drawPart(p));
  for(const b of bullets) add(b.x,b.y,b.z,b.kan?()=>drawTracer(b,26,'rgba(255,235,190,0.6)','#ffffff',1.6):()=>drawTracer(b,20,'rgba(255,170,60,0.55)','#fff3b8'));
  for(const b of ebullets) add(b.x,b.y,b.z,b.side==='axis'?()=>drawTracer(b,16,'rgba(255,200,90,0.5)','#fff3c8'):()=>drawTracer(b,16,'rgba(255,80,60,0.55)','#ffe2d6'));
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
  const spr=p.kind==='fire'?SPR.fire:(p.kind==='splash'?SPR.cloud:((p.kind==='flak'||p.kind==='dsmoke')?SPR.dark:SPR.smoke));
  const fog=fogK(Math.hypot(p.x-CAM.x,p.y-CAM.y,p.z-CAM.z));
  ctx.globalAlpha=(p.kind==='fire'?Math.min(1,k*1.6):(p.kind==='flak'||p.kind==='splash'?Math.min(0.9,k*1.2):Math.min(0.55,k*0.8)))*(1-fog*0.8);
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
    ctx.fillText(TYPE_NAME[e.type]+(e.ace?' (Ass)':'')+'  '+Math.round(dist)+' m',s[0],s[1]+r+6);
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
  gauge(206,177,14,[{f:(P.rpm-600)/2400}],'U/min',Math.round(P.rpm/10)*10);
  gauge(246,177,14,[{f:(P.ata-0.5)/1.3}],'ata',P.ata.toFixed(2));
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
  ctx.fillText(G.mission?`Abschüsse ${G.kills}  Punkte ${G.score}`:`Abschüsse ${G.kills}  Welle ${G.wave}  Punkte ${G.score}`,VW-4,7);
  ctx.textAlign='left';
  if(G.mode==='fly'&&Math.floor(performance.now()/300)%2===0){
    const warn=P.stall&&!P.onGround?'ABRISS':(P.ias>720?'ÜBERGESCHWINDIGKEIT':(P.nz>7.8?'ÜBERLAST':(P.y<150&&!P.gear&&P.V[1]<-3?'BODENNÄHE':'')));
    if(warn){ ctx.fillStyle='#ff4030'; ctx.font='bold 6px '+MONO; ctx.textAlign='center'; ctx.fillText(warn,VW/2,19); ctx.textAlign='left'; }
  }
  if(G.mode!=='fly') return;
  // Auftrag (oben rechts) und Funkspruch (oben links)
  const ot=objText();
  if(ot){
    ctx.font='4.5px '+MONO; const w=ctx.measureText(ot).width;
    ctx.fillStyle='rgba(0,0,0,0.5)'; ctx.fillRect(VW-w-7,11.5,w+5,6.5);
    ctx.fillStyle=G.mission.resolved?(G.mission.success?'#7ee07e':'#ff8060'):'#ffd27a'; ctx.textAlign='right'; ctx.fillText(ot,VW-4.5,16.3); ctx.textAlign='left';
  }
  if(G.radioT>0&&G.radio){
    ctx.font='4px '+MONO;
    const lines=wrapText('FUNK: '+G.radio,112).slice(0,4);
    ctx.globalAlpha=Math.min(1,G.radioT);
    ctx.fillStyle='rgba(0,0,0,0.5)'; ctx.fillRect(2,11.5,116,lines.length*5+2);
    ctx.fillStyle='#9fe0ff'; lines.forEach((l,i)=>ctx.fillText(l,4,16+i*5));
    ctx.globalAlpha=1;
  }
}

function drawMap(){
  const mx=VW-82,my=20,mw=78,mh=58, R=G.mapZoom?27000:9000;
  ctx.fillStyle='rgba(8,14,20,0.82)';ctx.fillRect(mx,my,mw,mh);
  ctx.strokeStyle='#4aa8b0';ctx.lineWidth=0.6;ctx.strokeRect(mx+0.5,my+0.5,mw-1,mh-1);
  const toM=(x,z)=>[mx+mw/2+(x-P.x)/R*mw/2, my+mh/2-(z-P.z)/R*mh/2];
  ctx.save(); ctx.beginPath(); ctx.rect(mx+1,my+1,mw-2,mh-2); ctx.clip();
  // Küste
  ctx.fillStyle='rgba(40,90,130,0.6)'; ctx.beginPath();
  const st=R/22;
  for(let x=P.x-R*1.2;x<=P.x+R*1.2;x+=st){ const p=toM(x,coastZ(x)); if(x===P.x-R*1.2) ctx.moveTo(p[0],p[1]); else ctx.lineTo(p[0],p[1]); }
  ctx.lineTo(mx+mw+10,my-10); ctx.lineTo(mx-10,my-10); ctx.closePath(); ctx.fill();
  const dot2=(x,z,col,s)=>{ const p=toM(x,z); ctx.fillStyle=col; ctx.fillRect(p[0]-s/2,p[1]-s/2,s,s); };
  dot2(0,0,'#ffffff',2.5);
  for(const f of flak) dot2(f.x,f.z,'#c07030',1.6);
  const M=G.mission;
  if(M){
    if(M.type==='jagd'){ const p=toM(M.b.ax,M.b.az); ctx.strokeStyle='rgba(255,90,70,0.85)'; ctx.lineWidth=0.5; ctx.beginPath(); ctx.arc(p[0],p[1],M.b.ar/R*mw/2,0,Math.PI*2); ctx.stroke(); }
    if(M.ships) for(const s of M.ships) if(!s.gone) dot2(s.x,s.z,s.sunk?'#555':'#c8c8c0',1.4);
    if(M.tgt){ const p=toM(M.tgt.x,M.tgt.z); ctx.strokeStyle='#ffd040'; ctx.lineWidth=0.6; ctx.beginPath(); ctx.moveTo(p[0]-2.5,p[1]-2.5); ctx.lineTo(p[0]+2.5,p[1]+2.5); ctx.moveTo(p[0]+2.5,p[1]-2.5); ctx.lineTo(p[0]-2.5,p[1]+2.5); ctx.stroke(); }
  }
  for(const f of friends) if(f.alive) dot2(f.x,f.z,'#78e6ff',2);
  for(const e of enemies) if(e.alive){
    dot2(e.x,e.z,e.type==='b17'?'#ff60ff':'#ff4040',2);
    if(e===G.target){ const p=toM(e.x,e.z); ctx.strokeStyle='#ffc450'; ctx.lineWidth=0.6; ctx.beginPath(); ctx.arc(p[0],p[1],3,0,Math.PI*2); ctx.stroke(); }
  }
  ctx.restore();
  // Ziel außerhalb des Ausschnitts: Randmarke
  const nav=M?(M.resolved?{x:0,z:0}:(M.type==='jagd'?{x:M.b.ax,z:M.b.az}:M.tgt)):null;
  if(nav){
    const p=toM(nav.x,nav.z);
    if(p[0]<mx||p[0]>mx+mw||p[1]<my||p[1]>my+mh){
      const cx=mx+mw/2, cy=my+mh/2, dx=p[0]-cx, dy=p[1]-cy, k=Math.min((mw/2-3)/Math.abs(dx||1e-6),(mh/2-3)/Math.abs(dy||1e-6));
      ctx.fillStyle='#ffd040'; ctx.beginPath(); ctx.arc(cx+dx*k,cy+dy*k,1.5,0,Math.PI*2); ctx.fill();
    }
  }
  // Spieler-Pfeil (Norden oben)
  const cx=mx+mw/2, cy=my+mh/2, s=Math.sin(P.heading), c=Math.cos(P.heading);
  ctx.fillStyle='#60ff70'; ctx.beginPath();
  ctx.moveTo(cx+s*4,cy-c*4); ctx.lineTo(cx-c*2.5-s*2.5,cy-s*2.5+c*2.5); ctx.lineTo(cx+c*2.5-s*2.5,cy+s*2.5+c*2.5); ctx.closePath(); ctx.fill();
  ctx.fillStyle='#7cc8d0';ctx.font='4px '+MONO;ctx.fillText('KARTE (M) '+(G.mapZoom?27:9)+' km  N↑',mx+2,my+5);
}

function drawCenterText(t,y=VH/2){
  ctx.font='bold 7px '+MONO;
  const w=ctx.measureText(t).width;
  ctx.fillStyle='rgba(0,0,0,0.6)';ctx.fillRect(VW/2-w/2-4,y-8,w+8,11);
  ctx.fillStyle='#ffe070';ctx.fillText(t,VW/2-w/2,y);
}
// Zeilenumbruch nach Breite (vorher Schrift setzen)
function wrapText(t,w){
  const out=[]; let line='';
  for(const word of t.split(' ')){ const s=line?line+' '+word:word; if(line&&ctx.measureText(s).width>w){ out.push(line); line=word; } else line=s; }
  if(line) out.push(line);
  return out;
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
  ctx.fillStyle='#1a1408'; ctx.fillText('ASSE ÜBER EUROPA',VW/2+1,33);
  ctx.fillStyle='#ffd27a'; ctx.fillText('ASSE ÜBER EUROPA',VW/2,32);
  ctx.font='6px '+MONO; ctx.fillStyle='#ececec';
  ctx.fillText('BROWSER-EDITION  ·  Bf 109 G-6  ·  KANALFRONT 1944',VW/2,42);
  ctx.fillStyle='rgba(0,0,0,0.55)'; ctx.fillRect(30,140,260,56);
  ctx.fillStyle='#ffffff'; ctx.font='bold 7px '+MONO;
  ctx.fillText('ENTER = SCHNELLSTART (in der Luft)',VW/2,150);
  ctx.fillText('I = EINSATZ VOM FLUGPLATZ',VW/2,159);
  ctx.font='5px '+MONO; ctx.fillStyle='#d8d8d8';
  ctx.fillText('O = Spielstände · H = Hilfe · Pfeile steuern · Leertaste feuert',VW/2,167);
  const c=CAREER;
  if(c.missions>0){ ctx.fillStyle='#9fe0ff'; ctx.fillText('Laufbahn: '+rankOf(c.score)[1]+' · '+c.missions+' Einsätze · '+c.kills+' Abschüsse · '+c.score+' Punkte',VW/2,174); }
  ctx.fillStyle='#9a9a9a';
  ctx.fillText('Fan-Hommage, kein Original-Remake',VW/2,192);
  if(Math.floor(t*2)%2===0){ ctx.fillStyle='#ffd27a'; ctx.font='bold 6px '+MONO; ctx.fillText('— BEREIT —',VW/2,183); }
  ctx.textAlign='left';
}

// ---------- Einsatzbesprechung / Einsatzbericht / Spielstände (Bildschirme im VGA-Raster) ----------
function boardHead(title,right){
  ctx.fillStyle='#0f130e'; ctx.fillRect(0,0,VW,VH);
  ctx.strokeStyle='rgba(255,255,255,0.03)'; ctx.lineWidth=0.5; ctx.beginPath();
  for(let y=14;y<VH;y+=6){ ctx.moveTo(0,y); ctx.lineTo(VW,y); }
  ctx.stroke();
  ctx.fillStyle='#2a2410'; ctx.fillRect(0,0,VW,13);
  ctx.font='bold 7px '+MONO; ctx.fillStyle='#ffd27a'; ctx.fillText(title,5,9);
  ctx.font='4.5px '+MONO; ctx.fillStyle='#d8d0b0'; ctx.textAlign='right'; ctx.fillText(right,VW-5,8.5); ctx.textAlign='left';
}
function boardFoot(l1,l2){
  ctx.fillStyle='#1b1f17'; ctx.fillRect(0,VH-15,VW,15);
  ctx.font='4.5px '+MONO; ctx.fillStyle='#ffd27a'; ctx.textAlign='center';
  ctx.fillText(l1,VW/2,VH-9); ctx.fillStyle='#b8b8a8'; ctx.fillText(l2,VW/2,VH-3.5);
  ctx.textAlign='left';
}
function pilotBox(x,y,w){
  const c=CAREER, r=rankOf(c.score);
  ctx.fillStyle='#161b14'; ctx.fillRect(x,y,w,40); ctx.strokeStyle='#4a4630'; ctx.lineWidth=0.5; ctx.strokeRect(x+0.25,y+0.25,w-0.5,39.5);
  ctx.font='bold 5px '+MONO; ctx.fillStyle='#ffaa00'; ctx.fillText('FLUGZEUGFÜHRER',x+3,y+6.5);
  ctx.font='4.5px '+MONO; ctx.fillStyle='#e0e0d4';
  ctx.fillText(r[1],x+3,y+13);
  ctx.fillText('Einsätze '+c.missions+' ('+c.success+' erfolgreich)',x+3,y+19);
  ctx.fillText('Abschüsse '+c.kills+' · Punkte '+c.score,x+3,y+25);
  ctx.fillText('Abgeschossen: '+c.losses+'×',x+3,y+31);
  ctx.fillStyle='#9fe0ff'; ctx.fillText(c.awards.length?c.awards[c.awards.length-1]:'noch keine Auszeichnung',x+3,y+37);
}
function drawBriefing(){
  const b=G.brief; if(!b) return;
  boardHead('EINSATZBESPRECHUNG', b.date+' · '+b.time+' · 3./Jagdgeschwader Kanal');
  MTYPES.forEach((t,i)=>{
    const x=5+i*64, sel=t===b.type;
    ctx.fillStyle=sel?'#ffaa00':'#2a2f28'; ctx.fillRect(x,16,62,9);
    ctx.fillStyle=sel?'#111':'#c8c8b8'; ctx.font=(sel?'bold ':'')+'5px '+MONO; ctx.fillText((i+1)+' '+MNAME[t].toUpperCase(),x+3,22.5);
  });
  let y=33;
  for(const [lab,txt] of b.text){
    ctx.font='bold 4.5px '+MONO; ctx.fillStyle='#ffaa00'; ctx.fillText(lab,5,y);
    ctx.font='4.5px '+MONO; ctx.fillStyle='#e0e0d4';
    for(const l of wrapText(txt,160)){ ctx.fillText(l,30,y); y+=5.4; }
    y+=2;
    if(y>180) break;
  }
  drawBriefMap(b,200,16,116,116);
  pilotBox(200,138,116);
  boardFoot('ENTER = START VOM FLUGPLATZ   1/2/3 oder ←/→ = EINSATZART   R = ANDERE LAGE','O = Spielstände   H = Hilfe   ESC = zurück zum Titel   Klick ins Bild = Start');
}
// Lagekarte: 30 × 30 km, Norden oben, Platz bei (0,0)
function drawBriefMap(b,x,y,w,h){
  const X0=-15000, Z0=-10000, S=30000, pm=(wx,wz)=>[x+(wx-X0)/S*w, y+h-(wz-Z0)/S*h];
  ctx.save(); ctx.beginPath(); ctx.rect(x,y,w,h); ctx.clip();
  ctx.fillStyle='#3a4a2b'; ctx.fillRect(x,y,w,h);
  ctx.fillStyle='#2b5673'; ctx.beginPath();
  for(let wx=X0;wx<=X0+S;wx+=1000){ const p=pm(wx,coastZ(wx)); if(wx===X0) ctx.moveTo(p[0],p[1]); else ctx.lineTo(p[0],p[1]); }
  ctx.lineTo(x+w,y); ctx.lineTo(x,y); ctx.closePath(); ctx.fill();
  ctx.strokeStyle='rgba(255,255,255,0.1)'; ctx.lineWidth=0.4; ctx.beginPath();
  for(let i=1;i<6;i++){ ctx.moveTo(x+i*w/6,y); ctx.lineTo(x+i*w/6,y+h); ctx.moveTo(x,y+i*h/6); ctx.lineTo(x+w,y+i*h/6); }
  ctx.stroke();
  for(const f of flak){ const p=pm(f.x,f.z); ctx.fillStyle='#d08038'; ctx.fillRect(p[0]-1,p[1]-1,2,2); }
  const line=(pts,col,dash)=>{ ctx.strokeStyle=col; ctx.lineWidth=0.7; ctx.setLineDash(dash||[]); ctx.beginPath(); pts.forEach((q,i)=>{ const p=pm(q[0],q[1]); if(i) ctx.lineTo(p[0],p[1]); else ctx.moveTo(p[0],p[1]); }); ctx.stroke(); ctx.setLineDash([]); };
  const arrow=(a,b2,col)=>{ const p=pm(a[0],a[1]), q=pm(b2[0],b2[1]), an=Math.atan2(q[1]-p[1],q[0]-p[0]); ctx.fillStyle=col; ctx.beginPath(); ctx.moveTo(q[0],q[1]); ctx.lineTo(q[0]-Math.cos(an-0.5)*4,q[1]-Math.sin(an-0.5)*4); ctx.lineTo(q[0]-Math.cos(an+0.5)*4,q[1]-Math.sin(an+0.5)*4); ctx.closePath(); ctx.fill(); };
  const label=(wx,wz,t,col,dy)=>{ const p=pm(wx,wz); ctx.font='4px '+MONO; ctx.fillStyle=col; ctx.textAlign='center'; ctx.fillText(t,p[0],p[1]+(dy||-4)); ctx.textAlign='left'; };
  const cross=(wx,wz,col)=>{ const p=pm(wx,wz); ctx.strokeStyle=col; ctx.lineWidth=0.8; ctx.beginPath(); ctx.moveTo(p[0]-2.5,p[1]-2.5); ctx.lineTo(p[0]+2.5,p[1]+2.5); ctx.moveTo(p[0]+2.5,p[1]-2.5); ctx.lineTo(p[0]-2.5,p[1]+2.5); ctx.stroke(); };
  if(b.type==='abwehr'){
    const mid=[b.ax+(b.tx-b.ax)*0.92,b.az+(b.tz-b.az)*0.92];
    line([[b.ax,b.az],[b.tx,b.tz]],'#ff5050',[3,2]); arrow([b.ax,b.az],mid,'#ff5050');
    const p=pm(b.ax,b.az); ctx.fillStyle='#ff60ff'; ctx.fillRect(p[0]-2,p[1]-1,4,2);
    label(b.ax,b.az,b.nB+'× B-17','#ff9090',-3);
    cross(b.tx,b.tz,'#ffd040'); label(b.tx,b.tz,'Ziel','#ffd040',7);
  } else if(b.type==='jagd'){
    const p=pm(b.ax,b.az); ctx.strokeStyle='#ff5050'; ctx.lineWidth=0.7; ctx.setLineDash([2,2]); ctx.beginPath(); ctx.arc(p[0],p[1],b.ar/S*w,0,Math.PI*2); ctx.stroke(); ctx.setLineDash([]);
    label(b.ax,b.az,'Jagdraum','#ff9090',1.5);
    line([[0,0],[b.ax,b.az]],'rgba(255,255,255,0.5)',[1,2]);
  } else {
    line([[b.fx,b.fz],[b.tx,b.tz]],'#78e6ff',[3,2]); arrow([b.fx,b.fz],[b.fx+(b.tx-b.fx)*0.45,b.fz+(b.tz-b.fz)*0.45],'#78e6ff');
    line([[b.tx,b.tz],[0,-3000]],'rgba(120,230,255,0.45)',[1,2]);
    label(b.fx,b.fz,b.nF+'× Ju 88','#78e6ff',7);
    cross(b.tx,b.tz,'#ffd040'); label(b.tx,b.tz,'Geleitzug','#ffd040',-4);
    for(let i=0;i<3;i++) arrow([b.tx+(i-1)*3500,b.tz+9000],[b.tx+(i-1)*2500,b.tz+5500],'rgba(255,80,80,0.8)');
  }
  const a=pm(0,0); ctx.fillStyle='#ffffff'; ctx.fillRect(a[0]-1,a[1]-2.5,2,5); label(0,0,'Platz','#ffffff',7);
  ctx.restore();
  ctx.strokeStyle='#6a6040'; ctx.lineWidth=0.6; ctx.strokeRect(x+0.3,y+0.3,w-0.6,h-0.6);
  ctx.font='4px '+MONO; ctx.fillStyle='#e8e0c0'; ctx.fillText('N↑',x+2,y+5);
  ctx.fillRect(x+w-3-w/6,y+h-3,w/6,0.7); ctx.fillText('5 km',x+w-3-w/6,y+h-4.5);
}
function drawDebrief(){
  const d=G.debrief; if(!d) return;
  const b=d.b, m=d.M;
  boardHead('EINSATZBERICHT', MNAME[b.type]+' · '+b.date);
  ctx.font='bold 10px '+MONO; ctx.fillStyle=d.res==='ERFOLG'?'#7ee07e':(d.res==='TEILERFOLG'?'#ffd040':'#ff6050');
  ctx.fillText(d.res,6,27);
  ctx.font='4.5px '+MONO; ctx.fillStyle='#e0e0d4';
  const L=[];
  if(b.type==='abwehr') L.push('B-17 abgeschossen: '+m.kB+', zum Abdrehen gezwungen: '+m.aborted+' (nötig: '+b.need+'). Bombentreffer im Ziel: '+m.hits+'.');
  else if(b.type==='jagd') L.push('Feindjäger abgeschossen: '+m.kF+' (nötig: '+b.need+'). Entkommen: '+m.escaped+'.');
  else L.push('Ju 88 im Ziel: '+m.dropped+' von '+b.nF+' (nötig: '+b.need+'), verloren: '+m.fLost+'. Schiffe versenkt: '+m.ships+'. Abschüsse der Bordschützen: '+m.fKills+'.');
  L.push({noflight:'Nicht gestartet – die Maschine blieb am Boden.', landed:'Sicher auf dem Platz gelandet.', landedOut:'Außenlandung – die Maschine wird geborgen.', quit:'Einsatz vorzeitig beendet, Rückflug ohne Landung.', shot:'Abgeschossen – Fallschirmabsprung, zurück bei der Staffel.'}[d.how]);
  const kl=Object.keys(d.kills).map(t=>d.kills[t]+'× '+TYPE_NAME[t]);
  L.push('Eigene Abschüsse: '+(kl.length?kl.join(', '):'keine')+'.');
  let y=36;
  for(const t of L) for(const l of wrapText(t,190)){ ctx.fillText(l,6,y); y+=5.4; }
  y+=3;
  ctx.font='bold 4.5px '+MONO; ctx.fillStyle='#ffaa00'; ctx.fillText('PUNKTE',6,y); y+=6;
  ctx.font='4.5px '+MONO;
  for(const [lab,v] of d.pts){ ctx.fillStyle='#e0e0d4'; ctx.fillText(lab,10,y); ctx.textAlign='right'; ctx.fillText(String(v),110,y); ctx.textAlign='left'; y+=5.4; }
  ctx.fillStyle='#ffd27a'; ctx.fillRect(10,y-3.5,100,0.5); ctx.font='bold 5px '+MONO; ctx.fillText('Gesamt',10,y+2); ctx.textAlign='right'; ctx.fillText(String(d.total),110,y+2); ctx.textAlign='left';
  y+=11;
  if(d.promo){ ctx.font='bold 6px '+MONO; ctx.fillStyle='#7ee07e'; ctx.fillText('BEFÖRDERT zum '+d.promo+'!',6,y); y+=8; }
  for(const a of d.awards){ ctx.font='bold 5px '+MONO; ctx.fillStyle='#9fe0ff'; ctx.fillText('AUSZEICHNUNG: '+a,6,y); y+=7; }
  pilotBox(200,20,116);
  ctx.font='bold 4.5px '+MONO; ctx.fillStyle='#ffaa00'; ctx.fillText('LETZTE EINSÄTZE',200,70);
  ctx.font='4px '+MONO;
  CAREER.log.slice(0,10).forEach((e,i)=>{ ctx.fillStyle=e.r==='ERFOLG'?'#9fdc9f':(e.r==='TEILERFOLG'?'#e8d080':'#e09080'); ctx.fillText(MNAME[e.t].slice(0,13).padEnd(14)+e.r.slice(0,10).padEnd(11)+String(e.p).padStart(5),200,77+i*5); });
  ctx.fillStyle='#888'; ctx.fillText(d.autoOk===false?'SPEICHERN FEHLGESCHLAGEN – Browser-Speicher gesperrt/voll!':'Automatisch gespeichert (Platz A).',200,132);
  boardFoot('ENTER = NÄCHSTE EINSATZBESPRECHUNG','O = Spielstände   ESC = Titel   H = Hilfe');
}
function slotText(d){
  const c=d.career||{}, r=rankOf(c.score||0);
  const t=new Date(d.at||0), ts=String(t.getDate()).padStart(2,'0')+'.'+String(t.getMonth()+1).padStart(2,'0')+'. '+String(t.getHours()).padStart(2,'0')+':'+String(t.getMinutes()).padStart(2,'0');
  const fl=d.flight?(d.flight.mission?' · im Flug: '+MNAME[d.flight.mission.type]:' · im Flug: Schnellstart'):(d.mode==='briefing'?' · Einsatzbesprechung':'');
  return [ts+fl, r[2]+' · '+(c.missions||0)+' Einsätze · '+(c.kills||0)+' Abschüsse · '+(c.score||0)+' Punkte'];
}
function drawMenu(){
  ctx.fillStyle='rgba(0,0,0,0.7)'; ctx.fillRect(0,0,VW,VH);
  const x=26,y=24,w=268,h=152;
  ctx.fillStyle='#0b1012'; ctx.fillRect(x,y,w,h); ctx.strokeStyle='#00aaaa'; ctx.lineWidth=0.8; ctx.strokeRect(x+0.5,y+0.5,w-1,h-1);
  ctx.font='bold 7px '+MONO; ctx.fillStyle='#00ffff'; ctx.fillText('SPIELSTÄNDE',x+8,y+12);
  ctx.font='4px '+MONO; ctx.fillStyle='#8a9a9a';
  ctx.fillText('Gespeichert im Browser (localStorage), verlässt den Rechner nicht.',x+8,y+19);
  ctx.fillText('Speichern sichert '+(G.mode==='fly'&&!P.dead?'den laufenden Flug und die Laufbahn.':'die Laufbahn'+(G.mode==='briefing'?' und diese Einsatzbesprechung.':'.')),x+8,y+24);
  for(let i=0;i<4;i++){
    const yy=y+29+i*21, sel=G.menuSel===i, d=G.menuInfo[i];
    ctx.fillStyle=sel?'#3a2a00':'#151a1c'; ctx.fillRect(x+6,yy,w-12,18);
    if(sel){ ctx.strokeStyle='#ffaa00'; ctx.lineWidth=0.6; ctx.strokeRect(x+6.3,yy+0.3,w-12.6,17.4); }
    ctx.font='bold 8px '+MONO; ctx.fillStyle='#ffd27a'; ctx.fillText(i?String(i):'A',x+11,yy+12);
    ctx.font='bold 4.5px '+MONO; ctx.fillStyle='#e0e0d4'; ctx.fillText(i?'Platz '+i:'Automatisch (nach jedem Einsatz)',x+22,yy+6.5);
    ctx.font='4.5px '+MONO;
    if(d){ const s=slotText(d); ctx.fillStyle='#c8c8b8'; ctx.fillText(s[0],x+22,yy+11.5); ctx.fillStyle='#9fe0ff'; ctx.fillText(s[1],x+22,yy+16); }
    else { ctx.fillStyle='#666'; ctx.fillText('— leer —',x+22,yy+12); }
  }
  if(G.menuMsg){ ctx.font='4.5px '+MONO; ctx.fillStyle='#ffd040'; ctx.fillText(G.menuMsg,x+8,y+h-12); }
  ctx.font='4.5px '+MONO; ctx.fillStyle='#b8b8a8';
  ctx.fillText('↑/↓ Platz · S = speichern · L/Enter = laden · Entf = löschen · O/Esc = schließen',x+8,y+h-5);
}

// ---------- Loop ----------
let last=performance.now();
// Beschriftung des Schnellstart-Buttons: Enter wirkt nur außerhalb des Flugs als Start
const btnStartEl=document.getElementById('btnStart');
let startLabel='';
function updateStartLabel(){
  const l=(G.mission&&(G.mode==='fly'||G.mode==='dead'))?'▶ Schnellstart (Einsatz verwerfen)':(G.mode==='fly'?'▶ Schnellstart (neu)':'▶ Schnellstart (Enter)');
  if(l!==startLabel){ startLabel=l; btnStartEl.textContent=l; }
}
function loop(now){
  let dt=(now-last)/1000; last=now;
  dt=Math.min(0.05,dt);
  if(G.quitT>0) G.quitT-=dt;
  update(dt);
  engineSound(dt);
  draw();
  updateStartLabel();
  requestAnimationFrame(loop);
}

// init
const GAME_VERSION = 'v4.0-Einsatz';
buildWorld((Math.random()*1e9)|0, QUICK_WX);
setVgaMode(autoVga());
{ const a=slotInfo(0); if(a&&a.career) CAREER=Object.assign(newCareer(),a.career); }
status('Bereit. ENTER = Schnellstart in der Luft, I = Einsatz vom Flugplatz, O = Spielstände, H = Hilfe. ('+GAME_VERSION+')'
  +(CAREER.missions?'  Laufbahn geladen: '+rankOf(CAREER.score)[1]+', '+CAREER.missions+' Einsätze.':''));
try{ console.log('[aces] ' + GAME_VERSION + ' geladen.'); }catch(e){}
requestAnimationFrame(loop);
})();
