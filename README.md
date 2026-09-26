# Aces über Europa – Browser-Edition (Bf 109)

Fan-Hommage an das Spielprinzip von „Aces over Europe" (Dynamix, 1993):
Jagdfliegerei an der Kanalfront im Browser – mit Tastatur, deutscher Hilfe,
VGA-Look und **Bf 109 G-6 („Me 109") als Standardflugzeug**.

Live: **https://brett.martuni.de/**

> Hinweis: Freie Hommage, kein Remake. Kein Original-Code, keine
> Original-Grafiken oder -Sounds. Alle Sprites und der gesamte Code in
> diesem Repo sind neu geschrieben (MIT, siehe unten).

## Features

- Flugmodell mit Kräften: Auftrieb über Anstellwinkel, Luftdichte nach Höhe,
  DB-605-Leistung mit Volldruckhöhe, Ruderwirkung über Staudruck, Abriss mit
  Abkippen, g-Begrenzung durch Steuerkräfte, Grau-/Rotsehen, Trimmung
- Maussteuerung per Zeigerposition zusätzlich zur Tastatur; Maus verlässt das Bild = Pause
- Waffenwahl: 2× MG 131, MG 151/20 oder beide
- Gegner-KI in Wellen: Spitfire Mk.V, P-51 Mustang, B-17-Bomber (ab Welle 2)
- Flak, Wolken, Dörfer/Wälder, Flugplatz mit Notlandung + Aufmunitionierung
- Cockpit mit Instrumenten (Fahrt, Höhe, Kurs, Gas, Hülle, Munition)
- Taktische Karte (Norden oben, mit Küste und Flak), Treffer-Blitz, Schadensrauch, Flak als schwarze Sprengwolken
- Sound per WebAudio (Motor + MG/Explosionen), ohne Dateien
- Echte 3D-Kamera mit flach schattierten Polygonmodellen (Spitfire Mk.V,
  P-51D, B-17G, Bf 109 G-6) inkl. Tarnanstrich und Hoheitszeichen
- Landschaft als Feld-Flickenteppich mit Hecken, Dörfern, Wäldern, Küste,
  Ärmelkanal und Dunst; weiche Wolken (Durchflug = Sichtverlust)
- Zielanzeige (`T`) mit Entfernung, Zustandsbalken, Vorhaltepunkt und Randpfeil
- Außenansicht (`K`); abgeschossene Gegner stürzen brennend ab
- Logik intern 320×200 (Mode 13h), gerendert bis 1280×800; `V` schaltet um,
  320×200 = klassischer Look mit Scanlines und reduzierter Palette
- Treffer-Feedback: Hit-Marker am Visier, Schadensbalken + Blitz am Gegner
- Leuchtspur für eigene MG-Garben
- Cheats: `X` = instand setzen, `B` = volle Munition
- Fliegerschule auf der Seite: ausführliche Anleitung zu Rudern, Abriss/g-Last,
  Energie und Gas, Zielen mit Vorhaltepunkt, Waffenwahl, Taktik, Karte, Landen, Instrumenten
- Komplett statisch, keine Cookies, kein Tracking, keine Dependencies

## Steuerung (Tastatur, deutsche Hilfe auf der Seite per `H`/`F1`)

| Taste | Wirkung |
|---|---|
| `←` / `→` | Querruder: rollen (Rollrate abhängig von der Fahrt) |
| `↑` / `↓` | Höhenruder: drücken / ziehen (wie Steuerknüppel) |
| `Q` / `E` | Höhentrimmung kopflastig / schwanzlastig |
| `A` / `D` | Seitenruder links / rechts (Gieren, Schieben) |
| `W` / `S` oder `+` / `-` | Gas mehr / weniger |
| `Leertaste` | Feuern mit gewählter Waffe |
| `1` / `2` / `3` | Waffe: MG 131 / MG 151/20 / beide |
| Maus | Klick ins Bild = Maussteuerung: Zeigerposition = Knüppel (Visier = Mitte), links = Feuer, rechts = Kanone, Rad = Gas; Maus aus dem Bild = Pause |
| `F` | Landeklappen umschalten |
| `G` | Fahrwerk ein / aus |
| `M` | Taktische Karte ein / aus |
| `C` | Cockpit ein / aus |
| `T` | Nächstes Ziel aufschalten (Klammer, Entfernung, Vorhaltepunkt) |
| `K` | Außenansicht / Cockpitsicht |
| `V` | Auflösung 320×200 (klassisch) → 640×400 → 960×600 → 1280×800 |
| `L` | Sound an / aus |
| `H` oder `F1` | Hilfe ein / aus |
| `P` / `Esc` | Pause |
| `N` | Neue Mission |
| `X` | Cheat: Flugzeug instand setzen (Hülle 100 %) |
| `B` | Cheat: Volle Munition (500 Schuss) |
| `R` / `Enter` | Start / Neustart |

## Projektstruktur

```text
aces/
├── AGENTS.md          # Arbeitsanweisungen für Coding-Agenten
├── README.md          # diese Datei
└── dist/              # wird von Caddy ausgeliefert (brett.martuni.de)
    ├── index.html     # UI, deutsche Hilfe, Buttons
    ├── style.css      # VGA-Design, Scanlines
    └── game.js        # Spiel: Physik, KI, Software-Rendering, Sound
```

## Lokal starten

Statisch, kein Build nötig – einfach aus `dist/` servieren:

```bash
python3 -m http.server 8000 --directory dist
# → http://localhost:8000/
```

JS-Syntaxcheck:

```bash
node --check dist/game.js
```

## Deployment

- Domain: `brett.martuni.de` (DNS → Server, automatisches HTTPS via Caddy/Let's Encrypt)
- Caddy-Site: `/etc/caddy/sites/brett.caddy` (Root `/home/librechat/aces/dist`, `file_server` + `try_files`)
- Nach Änderungen an `dist/` ist **kein Reload nötig** (statische Files).
  Nur nach Änderung der Caddy-Config:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
sudo caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
curl -sk -o /dev/null -w "https:%{http_code}\n" https://brett.martuni.de/
```

## Lizenz

Eigener Code und eigene Pixel-Grafiken in diesem Repo: **MIT**.
Der Name „Aces over Europe" und alle Original-Assets bleiben Eigentum der
jeweiligen Rechteinhaber (Dynamix/Sierra); dieses Projekt ist eine
nicht-kommerzielle Fan-Hommage ans Genre, kein Remake.
