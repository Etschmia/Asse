/* Aces über Europa – Browser-Hommage (eigener Code, keine Original-Assets)
 * Intern: VGA 320x200 (Mode 13h). Tastatursteuerung, Bf 109 G-6 Standard.
 */
(() => {
"use strict";
const VW = 320, VH = 200;
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;
const statusEl = document.getElementById('status');
const helpEl = document.getElementById('help');

let SCALE = 1; // 1 = 320x200, 2 = 640x400
function setVga(hi){
  SCALE = hi ? 2 : 1;
  canvas.width = VW * SCALE;
  canvas.height = VH * SCALE;
  ctx.imageSmoothingEnabled = false;
  document.getElementById('btnVga').textContent = hi ? 'VGA: 640×400 (V)' : 'VGA: 320×200 (V)';
  G.vgaHi = hi;
}

// ---------- Zustand ----------
const G = {
  mode: 'title', // title | fly | dead
  paused: false,
  showMap: false,
  cockpit: true,
  sound: true,
  vgaHi: false,
  time: 0,
  kills: 0,
  wave: 0,
  msg: '',
  msgT: 0,
  flash: 0,   // roter Treffer-Blitz
  shake: 0,
  started: false,
};
const P = {
  x:0, y:1200, z:-2500,
  heading: 0,   // rad, 0 = Nord
  pitch: 0,     // rad
  roll: 0,      // rad
  speed: 320,   // km/h
  throttle: 0.7,
  ammo: 500,
  hp: 100,
  flaps: false,
  gear: false,
  vy: 0,
  fireCd: 0,
  dead: false,
};

let enemies=[], bullets=[], ebullets=[], parts=[], clouds=[], groundFeats=[], flak=[];
let keys={};

// ---------- Welt aufbauen ----------
function rnd(a,b){ return a + Math.random()*(b-a); }
function buildWorld(){
  clouds=[];
  for(let i=0;i<26;i++) clouds.push({x:rnd(-9000,9000), y:rnd(1200,2200), z:rnd(-9000,9000), s:rnd(30,90)});
  groundFeats=[];
  // Flugplatz (eigener Start, bei 0,0)
  groundFeats.push({kind:'airfield', x:0, z:0});
  for(let i=0;i<40;i++) groundFeats.push({kind: Math.random()<0.3?'dorf':(Math.random()<0.5?'wald':'feld'), x:rnd(-8000,8000), z:rnd(-8000,8000)});
  // Küstenlinie Ärmelkanal: z > 1500 = Wasser
  flak=[];
  for(let i=0;i<4;i++) flak.push({x:rnd(1000,5000), z:rnd(1000,4000), cd:rnd(2,6)});
}

function spawnWave(n){
  G.wave = n;
  enemies=[];
  const count = n===1 ? 3 : (n===2 ? 5 : 6);
  for(let i=0;i<count;i++){
    let type='spit';
    if(n>=2 && i===0) type='b17';
    else if(n>=2 && i%3===0) type='mustang';
    else if(n>=3 && i%2===0) type='mustang';
    const a = rnd(0,Math.PI*2), d = rnd(1500,3500);
    enemies.push({
      type,
      x: P.x + Math.sin(a)*d,
      y: rnd(800,2200),
      z: P.z + Math.cos(a)*d,
      heading: rnd(0,Math.PI*2),
      speed: type==='b17'?300:rnd(330,430),
      hp: type==='b17'?120:(type==='mustang'?45:35),
      alive:true,
      fireCd: rnd(1,3),
      wob: rnd(0,9),
      hitT:0,
    });
  }
  setMsg('Welle '+n+': '+(n===1?'3× Spitfire von vorn!':(n===2?'B-17 + Jagdschutz!':'Abfangjäger überall!')));
  status('Welle '+n+' – Gegner: '+enemies.filter(e=>e.alive).length);
}

function resetMission(){
  P.x=0; P.y=1200; P.z=-2500; P.heading=0; P.pitch=0; P.roll=0;
  P.speed=320; P.throttle=0.7; P.ammo=500; P.hp=100;
  P.flaps=false; P.gear=false; P.fireCd=0; P.dead=false;
  bullets=[]; ebullets=[]; parts=[];
  G.kills=0; G.flash=0; G.shake=0; G.mode='fly'; G.paused=false; G.started=true;
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
window.addEventListener('keydown', e=>{
  const k = e.key;
  if(['ArrowUp','ArrowDown','ArrowLeft','ArrowRight',' '].includes(k)) e.preventDefault();
  if(k==='F1'){ e.preventDefault(); HELP_TOGGLE(); return; }
  keys[k.toLowerCase()]=true; keys[k]=true;
  audioInit(); if(AC&&AC.state==='suspended') AC.resume();
  if(k==='Enter'){ if(G.mode!=='fly') resetMission(); else if(G.paused) G.paused=false; }
  else if(k==='h'||k==='H') HELP_TOGGLE();
  else if(k==='p'||k==='P'||k==='Escape') { if(G.mode==='fly') G.paused=!G.paused; status(G.paused?'PAUSE – Weiter mit P / Enter':'Weiter gehts!'); }
  else if(k==='n'||k==='N') resetMission();
  else if(k==='r'||k==='R') resetMission();
  else if(k==='m'||k==='M') G.showMap=!G.showMap;
  else if(k==='c'||k==='C') { G.cockpit=!G.cockpit; document.getElementById('btnCockpit').textContent='Cockpit: '+(G.cockpit?'an (C)':'aus (C)'); }
  else if(k==='v'||k==='V') setVga(!G.vgaHi);
  else if(k==='l'||k==='L') { G.sound=!G.sound; document.getElementById('btnSound').textContent='Sound: '+(G.sound?'an (L)':'aus (L)'); }
  else if(k==='f'||k==='F') { if(G.mode==='fly'){ P.flaps=!P.flaps; setMsg(P.flaps?'Landeklappen AUSGEFAHREN':'Landeklappen EINGEFAHREN'); } }
  else if(k==='g'||k==='G') { if(G.mode==='fly'){ P.gear=!P.gear; setMsg(P.gear?'Fahrwerk AUSGEFAHREN':'Fahrwerk EINGEFAHREN'); } }
});
window.addEventListener('keyup', e=>{ keys[e.key.toLowerCase()]=false; keys[e.key]=false; });

// Buttons
document.getElementById('btnStart').onclick=()=>{ audioInit(); resetMission(); };
document.getElementById('btnHelp').onclick=HELP_TOGGLE;
document.getElementById('btnPause').onclick=()=>{ if(G.mode==='fly'){G.paused=!G.paused;} };
document.getElementById('btnNew').onclick=()=>resetMission();
document.getElementById('btnVga').onclick=()=>setVga(!G.vgaHi);
document.getElementById('btnSound').onclick=()=>{ G.sound=!G.sound; document.getElementById('btnSound').textContent='Sound: '+(G.sound?'an (L)':'aus (L)'); };
document.getElementById('btnCockpit').onclick=()=>{ G.cockpit=!G.cockpit; document.getElementById('btnCockpit').textContent='Cockpit: '+(G.cockpit?'an (C)':'aus (C)'); };

// ---------- Physik ----------
function viewVec(h, p){ const c=Math.cos(p); return {x:Math.sin(h)*c, y:Math.sin(p), z:Math.cos(h)*c}; }
function dist3(ax,ay,az,bx,by,bz){ const dx=ax-bx,dy=ay-by,dz=az-bz; return Math.sqrt(dx*dx+dy*dy+dz*dz); }

function update(dt){
  if(G.mode!=='fly'||G.paused) return;
  G.time+=dt;
  if(G.msgT>0) G.msgT-=dt;
  if(G.flash>0) G.flash-=dt*2;
  if(G.shake>0) G.shake-=dt*3;
  if(P.fireCd>0) P.fireCd-=dt;

  // --- Steuerung ---
  const left = keys['ArrowLeft'], right = keys['ArrowRight'];
  const up = keys['ArrowUp'], down = keys['ArrowDown'];
  const rudL = keys['a'], rudR = keys['d'];
  let targetRoll=0;
  if(left) targetRoll=-1.05;   // ~60°
  if(right) targetRoll=1.05;
  const stall = P.speed<180;
  const agility = stall?0.4:1.0;
  P.roll += (targetRoll-P.roll)*Math.min(1,dt*3.2*agility);
  let pitchIn=0;
  if(up) pitchIn-=1;    // drücken
  if(down) pitchIn+=1;  // ziehen
  P.pitch += pitchIn*dt*0.9*agility;
  P.pitch = Math.max(-1.2,Math.min(1.2,P.pitch));
  // Seitenruder: Fein-Heading
  if(rudL) P.heading+=dt*0.35;
  if(rudR) P.heading-=dt*0.35;
  // Kurve aus Rollen
  P.heading -= P.roll*dt*(0.55+P.speed/900);
  // Gas
  if(keys['w']||keys['+']||keys['=']) P.throttle=Math.min(1,P.throttle+dt*0.6);
  if(keys['s']||keys['-']||keys['_']) P.throttle=Math.max(0,P.throttle-dt*0.6);

  // Geschwindigkeit
  let target = 175 + P.throttle*445;
  if(P.flaps) target-=60;
  if(P.gear) target-=45;
  // Steigen kostet, Sinken bringt
  target -= Math.sin(P.pitch)*120;
  if(stall) target+=40; // Nase runter lernt man schnell
  P.speed += (target-P.speed)*Math.min(1,dt*0.7);
  P.speed = Math.max(90,Math.min(720,P.speed));

  // Übergeschwindigkeit: Schaden
  if(P.speed>660){ P.hp-=dt*4; if(Math.random()<dt*4) setMsg('ACHTUNG: Übergeschwindigkeit! Struktur!'); }

  // Bewegung
  const v = viewVec(P.heading,P.pitch);
  const ms = P.speed/3.6; // m/s
  P.x+=v.x*ms*dt; P.y+=v.y*ms*dt; P.z+=v.z*ms*dt;
  // Boden
  if(P.y<=2){
    if(P.gear&&P.speed<260&&Math.abs(v.y)<0.06&&P.y>=-2){
      P.y=2; P.pitch=0; // holprige Notlandung -> weiterrollen
      if(P.ammo<500&&Math.random()<dt){P.ammo=Math.min(500,P.ammo+dt*60); P.hp=Math.min(100,P.hp+dt*5);}
      setMsg('Notlandung – wird aufmunitioniert …',0.2);
    } else {
      return crash('BODENBERÜHRUNG – Maschine zerschellt.');
    }
  }
  if(P.y>8000){P.y=8000;P.pitch=Math.min(P.pitch,0);}
  // Stall-Verhalten
  if(stall){ P.pitch-=dt*0.5; P.y-=dt*18; if(Math.random()<dt) setMsg('ABRISS! Nase runter, Gas rein!'); }

  // Feuern
  if(keys[' ']&&P.fireCd<=0&&P.ammo>0){
    P.fireCd=0.09; P.ammo-=2;
    const spread=0.006;
    for(let i=0;i<2;i++){
      bullets.push({x:P.x+v.x*8, y:P.y+v.y*8-1, z:P.z+v.z*8,
        vx:v.x*900+(Math.random()-0.5)*spread*900, vy:v.y*900+(Math.random()-0.5)*spread*900, vz:v.z*900+(Math.random()-0.5)*spread*900,
        life:1.6});
    }
    noiseBurst(0.09,0.22,1800);
    G.shake=Math.min(0.6,G.shake+0.12);
  }
  if(P.ammo<=0){P.ammo=0; if(Math.random()<dt*0.5) setMsg('MUNITION LEER – zum Platz zurück! (N = neu)');}

  updateBullets(dt);
  updateEnemies(dt);
  updateParts(dt);
  updateFlak(dt);

  // Welle geschafft?
  if(enemies.every(e=>!e.alive)){
    const bonus = 100+G.wave*50;
    setMsg('Welle '+G.wave+' vernichtet! +'+bonus+' Pkte. Nächste Welle …');
    spawnWave(G.wave+1);
  }
  engineSound();
}

function crash(reason){
  G.mode='dead'; P.dead=true;
  explode(P.x,P.y,P.z,40,'#ff8800');
  noiseBurst(0.8,0.5,300);
  setMsg('',0);
  status(reason+'  Abschüsse: '+G.kills+'  Welle: '+G.wave+'  – ENTER / R für Neustart');
}

function updateBullets(dt){
  // eigene
  for(let i=bullets.length-1;i>=0;i--){
    const b=bullets[i]; b.life-=dt;
    b.x+=b.vx*dt; b.y+=b.vy*dt; b.z+=b.vz*dt; b.vy-=dt*4;
    if(b.life<=0||b.y<0){bullets.splice(i,1);continue;}
    for(const e of enemies){
      if(!e.alive) continue;
      const r = e.type==='b17'?26:13;
      if(dist3(b.x,b.y,b.z,e.x,e.y,e.z)<r){
        e.hp-= (e.type==='b17'?6:11);
        e.hitT=0.15;
        spark(b.x,b.y,b.z,'#ffff00',4);
        bullets.splice(i,1);
        if(e.hp<=0&&e.alive){ e.alive=false; G.kills++; explode(e.x,e.y,e.z,e.type==='b17'?46:26,'#ff4400'); noiseBurst(0.5,0.4,500); setMsg(getKillText(e)+'  ('+G.kills+' Abschüsse)'); P.ammo=Math.min(500,P.ammo+40); }
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
      spark(P.x,P.y,P.z,'#ff0000',5);
      if(P.hp<=0){ P.hp=0; return crash('ABGESCHOSSEN – Fallschirm? Zu spät.'); }
      else if(P.hp<30) setMsg('SCHWER BESCHÄDIGT! '+Math.round(P.hp)+'% Hülle');
    }
  }
}
function getKillText(e){
  return e.type==='b17'?'B-17 ABGESCHOSSEN!':(e.type==='mustang'?'Mustang abgeschossen!':'Spitfire abgeschossen!');
}

function updateEnemies(dt){
  for(const e of enemies){
    if(!e.alive) continue;
    if(e.hitT>0) e.hitT-=dt;
    e.wob+=dt*2;
    // Ziel: Spieler
    const dx=P.x-e.x, dy=P.y-e.y, dz=P.z-e.z;
    const dh=Math.sqrt(dx*dx+dz*dz)||1;
    const wantH=Math.atan2(dx,dz);
    let dH=wantH-e.heading;
    while(dH>Math.PI)dH-=Math.PI*2; while(dH<-Math.PI)dH+=Math.PI*2;
    e.heading+=Math.max(-1.2*dt,Math.min(1.2*dt,dH*1.6));
    const wantP=Math.atan2(dy,dh);
    // B-17 fliegt geradeaus, Jäger kurven aggressiv + Schlangenlinie
    const wob = e.type==='b17'?0:Math.sin(e.wob)*0.35;
    const ePitch = Math.max(-0.7,Math.min(0.7,wantP*0.8+wob*0.3));
    const ev=viewVec(e.heading,ePitch);
    const ems=e.speed/3.6;
    e.x+=ev.x*ems*dt; e.y+=ev.y*ems*dt; e.z+=ev.z*ems*dt;
    if(e.y<50){e.y=50;}
    if(e.y>6000)e.y=6000;
    const d=dist3(e.x,e.y,e.z,P.x,P.y,P.z);
    // Rammen?
    if(d<22){ e.hp-=30; P.hp-=35; G.flash=1; G.shake=1; explode((e.x+P.x)/2,(e.y+P.y)/2,(e.z+P.z)/2,20,'#ff6600');
      if(P.hp<=0) return crash('RAMMSTOSS – beide Maschinen verloren.');
      if(e.hp<=0){e.alive=false;G.kills++;setMsg('Gerammt! '+getKillText(e));}
    }
    // Feuern wenn grob hinter/vor Spieler im Kegel
    e.fireCd-=dt;
    if(e.fireCd<=0&&d<900&&d>40){
      // Winkel zwischen Feind-Blick und Spieler
      const f=viewVec(e.heading,ePitch);
      const nx=dx/(d||1),ny=dy/(d||1),nz=dz/(d||1);
      const dot=f.x*nx+f.y*ny+f.z*nz;
      if(dot>0.965){
        e.fireCd = e.type==='b17'?0.5:rnd(0.5,1.2);
        const sp=900;
        ebullets.push({x:e.x,y:e.y,z:e.z,vx:nx*sp+rnd(-25,25),vy:ny*sp+rnd(-25,25),vz:nz*sp+rnd(-25,25),life:1.8});
        noiseBurst(0.07,0.08,900);
      } else e.fireCd=0.25;
    }
  }
}

function updateParts(dt){
  for(let i=parts.length-1;i>=0;i--){const p=parts[i];p.life-=dt;
    p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;p.vy-=dt*9;p.vx*=0.99;p.vz*=0.99;
    if(p.life<=0||p.y<0)parts.splice(i,1);}
}
function spark(x,y,z,color,n){for(let i=0;i<n;i++)parts.push({x,y,z,vx:rnd(-60,60),vy:rnd(-20,60),vz:rnd(-60,60),life:rnd(0.3,0.9),color,size:rnd(1,2.4)});}
function explode(x,y,z,n,color){for(let i=0;i<n;i++)parts.push({x:x+rnd(-6,6),y:y+rnd(-6,6),z:z+rnd(-6,6),vx:rnd(-120,120),vy:rnd(-40,120),vz:rnd(-120,120),life:rnd(0.5,1.8),color:Math.random()<0.4?'#ffff00':(Math.random()<0.5?color:'#555555'),size:rnd(1.5,4)});}

function updateFlak(dt){
  for(const f of flak){
    f.cd-=dt;
    const d=dist3(f.x,0,f.z,P.x,P.y,P.z);
    if(f.cd<=0&&d<4000&&P.y<3500){
      f.cd=rnd(2.5,6);
      // Flak pufft neben Spieler
      const ox=rnd(-80,80),oy=rnd(-40,40),oz=rnd(-80,80);
      parts.push({x:P.x+ox,y:P.y+oy,z:P.z+oz,vx:0,vy:0,vz:0,life:0.7,color:'#ffffff',size:5});
      noiseBurst(0.3,0.12,200);
      if(Math.abs(ox)<22&&Math.abs(oy)<14&&Math.abs(oz)<22){P.hp-=rnd(6,14);G.flash=1;setMsg('FLAKTREFFER! '+Math.round(P.hp)+'%');if(P.hp<=0)return crash('FLAK-VOLLTREFFER über dem Kanal.');}
    }
  }
}

// ---------- Projektion ----------
function project(wx,wy,wz){
  const dx=wx-P.x, dy=wy-P.y, dz=wz-P.z;
  // in Flugzeug-Koordinaten drehen (nur Heading, Pitch kommt über Horizont)
  const ch=Math.cos(-P.heading), sh=Math.sin(-P.heading);
  const rx=dx*ch-dz*sh;
  const rz=dx*sh+dz*ch;
  const fwd=rz, right=rx, up=dy;
  if(fwd<8) return null;
  const F=140; // Brennweite (VGA)
  let sx=VW/2+(right/fwd)*F;
  let sy=VH*0.46-(up/fwd)*F + (P.pitch*140);
  // Rollen: um Bildmitte rotieren
  const cr=Math.cos(-P.roll), sr=Math.sin(-P.roll);
  const ox=sx-VW/2, oy=sy-VH*0.46;
  sx=VW/2+ox*cr-oy*sr; sy=VH*0.46+ox*sr+oy*cr;
  const scale=F/fwd;
  return {x:sx,y:sy,s:scale,dist:Math.sqrt(dx*dx+dy*dy+dz*dz)};
}

// ---------- Zeichnen ----------
function draw(){
  ctx.setTransform(SCALE,0,0,SCALE,0,0);
  // Shake
  if(G.shake>0&&G.mode==='fly'){ctx.translate(rnd(-1,1)*G.shake*3,rnd(-1,1)*G.shake*3);}
  if(G.mode==='title'){drawTitle();return;}
  drawSkyGround();
  drawGroundFeats();
  drawClouds();
  // Gegner + Partikel + Geschosse sortiert
  const draws=[];
  for(const e of enemies) if(e.alive){const pr=project(e.x,e.y,e.z); if(pr&&pr.x>-40&&pr.x<VW+40&&pr.y>-40&&pr.y<VH+40) draws.push({d:pr.dist,fn:()=>drawEnemy(e,pr)});}
  for(const p of parts){const pr=project(p.x,p.y,p.z); if(pr&&pr.x>-10&&pr.x<VW+10&&pr.y>-10&&pr.y<VH+10) draws.push({d:pr.dist,fn:()=>drawPart(p,pr)});}
  for(const b of bullets){const pr=project(b.x,b.y,b.z); if(pr) draws.push({d:pr.dist,fn:()=>{ctx.fillStyle='#ffff00';const s=Math.max(1,pr.s*3);ctx.fillRect(pr.x,pr.y,s,s);}});}
  for(const b of ebullets){const pr=project(b.x,b.y,b.z); if(pr) draws.push({d:pr.dist,fn:()=>{ctx.fillStyle='#ff3333';ctx.fillRect(pr.x,pr.y,2,2);}});}
  draws.sort((a,b)=>b.d-a.d);
  for(const it of draws) it.fn();

  drawSight();
  if(G.cockpit) drawCockpit();
  drawHud();
  if(G.showMap) drawMap();
  if(G.msgT>0&&G.msg) drawCenterText(G.msg);
  if(G.flash>0){ctx.fillStyle=`rgba(170,0,0,${Math.min(0.45,G.flash*0.45)})`;ctx.fillRect(0,0,VW,VH);}
  // Schaden-Rauch
  if(G.mode==='fly'&&P.hp<45&&Math.random()<0.5){ctx.fillStyle='rgba(60,60,60,0.7)';ctx.fillRect(VW/2+rnd(-14,14),VH*0.55+rnd(-6,6),rnd(2,6),rnd(2,5));}
  if(G.mode==='dead'){drawCenterText('ABGESTÜRZT – ENTER / R für Neustart',VH*0.35);drawCenterText('Abschüsse: '+G.kills+'   Welle: '+G.wave,VH*0.35+12);}
  if(G.paused){ctx.fillStyle='rgba(0,0,0,0.6)';ctx.fillRect(0,0,VW,VH);drawCenterText('PAUSE – Weiter mit P',VH/2-4);}
}

function drawSkyGround(){
  // Horizont: Pitch + Höhe beeinflussen leicht
  const horizon = VH*0.46 + P.pitch*140;
  // Himmel mit VGA-Banding (retro!)
  const bands=12;
  for(let i=0;i<bands;i++){
    const y0=(horizon/bands)*i;
    const y1=(horizon/bands)*(i+1);
    if(y1<0)continue; if(y0>VH)break;
    const t=i/bands;
    // oben dunkelblau -> unten hell
    const r=Math.floor(0+t*90), g=Math.floor(0+t*160), b=Math.floor(120+t*120);
    ctx.fillStyle=`rgb(${r},${g},${Math.min(255,b)})`;
    ctx.fillRect(0,Math.max(0,y0),VW,Math.min(VH,y1)-Math.max(0,y0)+1);
  }
  // Sonne
  const sunH=0.7, sunP=0.25; // fix
  let dH=sunH-P.heading; while(dH>Math.PI)dH-=Math.PI*2;while(dH<-Math.PI)dH+=Math.PI*2;
  const sunX=VW/2+dH*120, sunY=horizon-60+ (P.pitch*140)*0.2 + (sunP*40);
  if(sunX>-10&&sunX<VW+10){ctx.fillStyle='#ffff00';ctx.fillRect(sunX-4,sunY-4,8,8);ctx.fillStyle='#ffaa00';ctx.fillRect(sunX-6,sunY-6,2,12);ctx.fillRect(sunX-6,sunY-6,12,2);}
  // Boden
  if(horizon<VH){
    const sea = P.z>1500; // grob
    ctx.fillStyle='#0a5d0a';
    ctx.fillRect(0,Math.max(0,horizon),VW,VH-Math.max(0,horizon));
    // Wasser ab Horizont mischen wenn Richtung Norden/Kanal
    ctx.fillStyle='#003a6e';
    const waterY=horizon+18;
    if(waterY<VH) ctx.fillRect(0,waterY,VW,VH-waterY);
    // Feldlinien (Pseudo-Perspektive): horizontale Streifen
    ctx.fillStyle='rgba(0,0,0,0.25)';
    for(let i=0;i<6;i++){const y=horizon+6+i*i*3; if(y>0&&y<VH)ctx.fillRect(0,y,VW,1);}
  }
  // Horizontlinie bei Rolle drehen (einfach: Linie mit Neigung)
  ctx.save();ctx.translate(VW/2,VH*0.46);ctx.rotate(-P.roll);
  ctx.fillStyle='#ffffff';ctx.fillRect(-VW,-1+ (P.pitch*140),VW*2,1);
  ctx.restore();
}

function drawGroundFeats(){
  for(const f of groundFeats){
    if(f.kind==='airfield'){
      // Landebahn: zwei Punkte
      const a=project(f.x-40,0,f.z-300), b=project(f.x+40,0,f.z+300);
      if(a&&b){ctx.strokeStyle='#888888';ctx.lineWidth=Math.max(1,Math.min(6,a.s*8));ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();
        ctx.fillStyle='#ffffff';const c=project(f.x,0,f.z);if(c)ctx.fillRect(c.x-8,c.y-8,16,8);}
      continue;
    }
    const pr=project(f.x,0,f.z);
    if(!pr)continue; if(pr.x<0||pr.x>VW||pr.y<0||pr.y>VH)continue;
    const s=Math.max(1,Math.min(6,pr.s*4));
    if(f.kind==='dorf'){ctx.fillStyle='#8a6d3b';ctx.fillRect(pr.x-s,pr.y-s,s*2,s*2);ctx.fillStyle='#aa0000';ctx.fillRect(pr.x-s,pr.y-s-1,s*2,1);}
    else if(f.kind==='wald'){ctx.fillStyle='#004d00';ctx.fillRect(pr.x-s,pr.y-s/2,s*2,s);}
    else{ctx.fillStyle='#2d5a27';ctx.fillRect(pr.x-s/2,pr.y-1,s,2);}
  }
  // Flak-Stellungen
  for(const f of flak){const pr=project(f.x,0,f.z);if(!pr)continue;if(pr.x<0||pr.x>VW||pr.y<0||pr.y>VH)continue;ctx.fillStyle='#ff00ff';ctx.fillRect(pr.x-1,pr.y-1,2,2);}
}

function drawClouds(){
  ctx.fillStyle='#ffffff';
  for(const c of clouds){
    const pr=project(c.x,c.y,c.z);
    if(!pr)continue; if(pr.x<-30||pr.x>VW+30||pr.y<-20||pr.y>VH+20)continue;
    const s=Math.max(2,pr.s*c.s*0.4);
    ctx.globalAlpha=0.85;
    ctx.fillRect(pr.x-s/2,pr.y-1,s,3);
    ctx.fillRect(pr.x-s/3,pr.y-3,s*0.66,2);
    ctx.globalAlpha=1;
  }
}

function drawEnemy(e,pr){
  const dist=pr.dist;
  let size = Math.max(2,Math.min(e.type==='b17'?70:44, 9000/dist*(e.type==='b17'?2.2:1.4)));
  const x=Math.round(pr.x), y=Math.round(pr.y);
  // Typfarben
  let col = e.type==='spit'?'#2d6a2d':(e.type==='mustang'?'#b8b8b8':'#4a4a4a');
  if(e.hitT>0) col='#ffffff';
  // Fern: Punkt + Entfernung
  if(dist>1500){ctx.fillStyle=col;ctx.fillRect(x-1,y-1,2,2);
    if(dist<4000){ctx.fillStyle='#ffffff';ctx.font='6px monospace';ctx.fillText(Math.round(dist)+'m',x+3,y+2);}return;}
  // Nah: Pixel-Silhouette (Rumpf + Tragflächen + Leitwerk)
  ctx.fillStyle='#000000'; // Schatten
  const w=size, h=Math.max(2,size*0.28);
  ctx.fillRect(x-w/2+1,y-h/2+1,w,h);
  ctx.fillStyle=col;
  ctx.fillRect(x-w/2,y-h/2,w,h);              // Tragfläche
  ctx.fillRect(x-1.5,y-h/2- size*0.35,3,size*0.9); // Rumpf
  ctx.fillStyle=e.type==='b17'?'#222':'#7a0000';
  ctx.fillRect(x-size*0.12,y-size*0.42,size*0.24,3); // Leitwerk
  if(e.type==='b17'){ctx.fillStyle='#111';for(let i=-1;i<=1;i+=2)ctx.fillRect(x+i*w*0.22-1,y-h/2-2,2,2);}
  else { // Cockpit-Kanzel
    ctx.fillStyle='#00ffff';ctx.fillRect(x-1,y-1,2,2);
  }
  // Balkenkreuz / Roundel-Andeutung
  ctx.fillStyle=e.type==='spit'?'#0000aa':'#ffffff';
  ctx.fillRect(x+w*0.25,y-1,2,2);
  // Name + Distanz
  ctx.fillStyle='#ffffff';ctx.font='6px monospace';
  const nm=e.type==='b17'?'B-17':(e.type==='mustang'?'P-51':'SPIT');
  ctx.fillText(nm+' '+Math.round(dist)+'m',x-14,y-h/2-size*0.35-3);
  // Vorhaltelinie wenn sehr nah
  if(dist<300){ctx.strokeStyle='#ff0000';ctx.beginPath();ctx.moveTo(x-4,y+6);ctx.lineTo(x+4,y+6);ctx.stroke();}
}

function drawPart(p,pr){
  const s=Math.max(1,p.size*pr.s*0.6);
  ctx.fillStyle=p.color;
  ctx.fillRect(pr.x-s/2,pr.y-s/2,s,s);
}

function drawSight(){
  if(G.mode!=='fly')return;
  const cx=VW/2, cy=VH*0.46;
  ctx.strokeStyle='#00ff00';ctx.lineWidth=1;
  ctx.strokeRect(cx-8,cy-8,16,16);
  ctx.fillStyle='#00ff00';
  ctx.fillRect(cx,cy-1,1,1);
  ctx.fillRect(cx-12,cy,4,1);ctx.fillRect(cx+8,cy,4,1);
  // Munitions-Warnung
  if(P.ammo<100){ctx.fillStyle='#ff0000';ctx.font='6px monospace';ctx.fillText('MUN KNAPP',cx-16,cy+16);}
}

function drawCockpit(){
  // Bf-109-Cockpit: dunkler Rahmen + Revi + Instrumente
  ctx.fillStyle='#1a1a1a';
  ctx.fillRect(0,VH-52,VW,52);                       // Panel
  ctx.fillStyle='#333333';ctx.fillRect(0,VH-52,VW,2);
  // Bügel
  ctx.fillStyle='#101010';
  ctx.fillRect(0,VH-80,26,28);ctx.fillRect(VW-26,VH-80,26,28);
  ctx.fillStyle='#222';ctx.fillRect(26,VH-84,VW-52,4);
  // Instrumente: Fahrt, Höhe, Kompass, Drehzahl
  inst(40,VH-26,'KM/H',Math.round(P.speed));
  inst(110,VH-26,'M',Math.round(P.y));
  inst(180,VH-26,'KURS',Math.round(((P.heading*180/Math.PI)%360+360)%360)+'°');
  inst(250,VH-26,'GAS',Math.round(P.throttle*100)+'%');
  // Hülle + Mun
  ctx.fillStyle='#ff0000';ctx.fillRect(285,VH-46,Math.max(0,30*P.hp/100),3);
  ctx.fillStyle='#888';ctx.font='6px monospace';ctx.fillText('HUL '+Math.round(P.hp),282,VH-36);
  ctx.fillStyle='#ffff00';ctx.fillRect(285,VH-32,Math.max(0,30*P.ammo/500),3);
  ctx.fillText('MUN '+P.ammo,282,VH-22);
  // MG-Visier-Spiegel
  ctx.fillStyle='#0a0a0a';ctx.fillRect(VW/2-10,VH-84,20,10);
  ctx.fillStyle='#88ffff';ctx.fillRect(VW/2-8,VH-82,16,1);
}
function inst(x,y,label,val){
  ctx.fillStyle='#000';ctx.fillRect(x-26,y-16,52,28);
  ctx.strokeStyle='#555';ctx.strokeRect(x-26.5,y-16.5,52,28);
  ctx.fillStyle='#00ff00';ctx.font='6px monospace';
  ctx.fillText(label,x-20,y-8);
  ctx.fillStyle='#ffffff';ctx.font='8px monospace';
  ctx.fillText(String(val),x-20,y+4);
}

function drawHud(){
  ctx.fillStyle='#000';ctx.fillRect(0,0,VW,14);
  ctx.fillStyle='#00ff00';ctx.font='8px monospace';
  const kompass=Math.round(((P.heading*180/Math.PI)%360+360)%360);
  ctx.fillText(`BF109 ${Math.round(P.speed)}KM/H H:${Math.round(P.y)}M K:${kompass}°`,2,9);
  ctx.fillStyle='#ffaa00';ctx.font='8px monospace';
  ctx.fillText(`AB:${G.kills} W:${G.wave} MUN:${P.ammo}`,VW-108,9);
  // Fahrwerk/Klappen-Lämpchen
  ctx.fillStyle=P.gear?'#00ff00':'#333';ctx.fillRect(VW-118,3,4,4);
  ctx.fillStyle=P.flaps?'#00ff00':'#333';ctx.fillRect(VW-112,3,4,4);
}

function drawMap(){
  const mx=VW-72,my=22,mw=66,mh=50;
  ctx.fillStyle='rgba(0,0,0,0.8)';ctx.fillRect(mx,my,mw,mh);
  ctx.strokeStyle='#00aaaa';ctx.strokeRect(mx+0.5,my+0.5,mw-1,mh-1);
  const R=8000;
  const dot=(x,z,col)=>{
    let px=mx+mw/2+(x-P.x)/R*mw/2, py=my+mh/2+(z-P.z)/R*mh/2;
    px=Math.max(mx+1,Math.min(mx+mw-1,px));py=Math.max(my+1,Math.min(my+mh-1,py));
    ctx.fillStyle=col;ctx.fillRect(px-1,py-1,2,2);
  };
  dot(0,0,'#ffffff');
  for(const e of enemies) if(e.alive) dot(e.x,e.z,e.type==='b17'?'#ff00ff':'#ff0000');
  // Spieler-Pfeil
  ctx.fillStyle='#00ff00';
  const cxp=mx+mw/2, cyp=my+mh/2;
  ctx.fillRect(cxp-1,cyp-1,3,3);
  ctx.fillStyle='#00aaaa';ctx.font='6px monospace';ctx.fillText('KARTE (M)',mx+2,my+7);
}

function drawCenterText(t,y=VH/2){
  ctx.font='8px monospace';
  const w=ctx.measureText(t).width;
  ctx.fillStyle='rgba(0,0,0,0.7)';ctx.fillRect(VW/2-w/2-4,y-9,w+8,12);
  ctx.fillStyle='#ffff00';ctx.fillText(t,VW/2-w/2,y);
}

function drawTitle(){
  // Retro-Titel im VGA-Look
  ctx.fillStyle='#0000aa';ctx.fillRect(0,0,VW,VH);
  ctx.fillStyle='#00aaaa';ctx.fillRect(0,120,VW,80);
  ctx.fillStyle='#00aa00';ctx.fillRect(0,150,VW,50);
  // Pixel-Sonne
  ctx.fillStyle='#ffff00';ctx.fillRect(140,40,24,24);
  // Silhouetten: 109 vs Spit
  ctx.fillStyle='#222';ctx.fillRect(60,80,60,6);ctx.fillRect(86,72,6,22);
  ctx.fillStyle='#555';ctx.fillRect(200,70,50,5);ctx.fillRect(222,63,5,18);
  // Tracer
  ctx.fillStyle='#ff0000';for(let i=0;i<8;i++)ctx.fillRect(120+i*10,78+(i%2),4,1);
  ctx.fillStyle='#ffffff';ctx.font='16px monospace';
  ctx.fillText('ACES ÜBER',70,30);
  ctx.fillStyle='#ffff00';
  ctx.fillText('EUROPA',110,48);
  ctx.fillStyle='#00ff00';ctx.font='8px monospace';
  ctx.fillText('BROWSER-EDITION * VGA * Bf109',52,108);
  ctx.fillStyle='#ffffff';
  ctx.fillText('ENTER = START   H = HILFE',56,132);
  ctx.fillText('PFEILE STEUERN, SPACE FEUERT',44,142);
  ctx.fillStyle='#ffaa00';
  ctx.fillText('STANDARD: Bf 109 G-6 (ME 109)',48,164);
  ctx.fillStyle='#000';
  ctx.fillText('FAN-HOMMAGE, KEIN ORIGINAL-REMAKE',36,176);
  if(Math.floor(performance.now()/500)%2===0){ctx.fillStyle='#fff';ctx.fillText('- BEREIT -',120,190);}
}

// ---------- Loop ----------
let last=performance.now();
function loop(now){
  let dt=(now-last)/1000; last=now;
  dt=Math.min(0.05,dt);
  // Eingabe-Statuszeile live
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

// init
buildWorld();
setVga(false);
status('Bereit. ENTER = Start mit Bf 109. H = Hilfe.');
requestAnimationFrame(loop);
})();
