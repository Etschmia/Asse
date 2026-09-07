# Aces über Europa – Browser-Edition (Bf 109)

Fan-Hommage an das Spielprinzip von „Aces over Europe" (Dynamix, 1993):
Jagdfliegerei an der Kanalfront im Browser – mit Tastatur, deutscher Hilfe,
VGA-Look und **Bf 109 G-6 („Me 109") als Standardflugzeug**.

Live: **https://brett.martuni.de/**

> Hinweis: Freie Hommage, kein Remake. Kein Original-Code, keine
> Original-Grafiken oder -Sounds. Alle Sprites und der gesamte Code in
> diesem Repo sind neu geschrieben (MIT, siehe unten).

## Features

- Arcade-Flugmodell (Gas, Abriss < 180 km/h, Strukturschaden > 660 km/h)
- Gegner-KI in Wellen: Spitfire Mk.V, P-51 Mustang, B-17-Bomber (ab Welle 2)
- Flak, Wolken, Dörfer/Wälder, Flugplatz mit Notlandung + Aufmunitionierung
- Cockpit mit Instrumenten (Fahrt, Höhe, Kurs, Gas, Hülle, Munition)
- Taktische Karte, Treffer-Blitz, Screen-Shake, Schadensrauch
- Sound per WebAudio (Motor + MG/Explosionen), ohne Dateien
- VGA-Modus: intern 320×200 (Mode 13h), pixelig hochskaliert + Scanlines;
  per `V` auf 640×400 umschaltbar
- Komplett statisch, keine Cookies, kein Tracking, keine Dependencies

## Steuerung (Tastatur, deutsche Hilfe auf der Seite per `H`/`F1`)

| Taste | Wirkung |
|---|---|
| `←` / `→` | Querruder: rollen + Kurve |
| `↑` / `↓` | Höhenruder: drücken / ziehen (wie Steuerknüppel) |
| `A` / `D` | Seitenruder links / rechts |
| `W` / `S` oder `+` / `-` | Gas mehr / weniger |
| `Leertaste` | Feuern (2× MG 131 + MG 151/20) |
| `F` | Landeklappen umschalten |
| `G` | Fahrwerk ein / aus |
| `M` | Taktische Karte ein / aus |
| `C` | Cockpit ein / aus |
| `V` | VGA-Modus 320×200 ↔ 640×400 |
| `L` | Sound an / aus |
| `H` oder `F1` | Hilfe ein / aus |
| `P` / `Esc` | Pause |
| `N` | Neue Mission |
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
