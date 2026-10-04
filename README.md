# Asse über Europa – Browser-Edition (Bf 109)

Fan-Hommage an das Spielprinzip von „Aces over Europe" (Dynamix, 1993):
Jagdfliegerei an der Kanalfront im Browser – mit Tastatur, deutscher Hilfe,
VGA-Look und **Bf 109 G-6 („Me 109") als Standardflugzeug**.

Live: **https://brett.martuni.de/**

> Hinweis: Freie Hommage, kein Remake. Kein Original-Code, keine
> Original-Grafiken oder -Sounds. Alle Sprites und der gesamte Code in
> diesem Repo sind neu geschrieben (MIT, siehe unten).

## Features

- **Zwei Spielarten:** `Enter` = Schnellstart in der Luft gegen Wellen,
  `I` = Einsatz vom Flugplatz mit Einsatzbesprechung (Lage, Auftrag, Feind, Wetter, Lagekarte),
  Start von der Graspiste (Spornrad, Linksdrall), Landung und Einsatzbericht
- **Drei Einsatzarten:** Bomberabwehr (B-17-Pulk vor dem Werk abfangen), Freie Jagd
  (Jagdraum über dem Kanal), Begleitschutz (Ju 88 zum Geleitzug schützen); Schwierigkeit wächst mit der Laufbahn
- **Laufbahn + Spielstände:** Punkte, Dienstgrade, Auszeichnungen; Platz A automatisch nach jedem Einsatz,
  Plätze 1–3 von Hand (in der Luft samt laufendem Flug) – nur im Browser (localStorage)
- **Motorklang nach Drehzahl und Last:** Zündfrequenz des V12, Verzerrung/Filter nach Ladedruck,
  Leerlauf-Blubbern, Patschen im Schiebebetrieb, Fahrtwind; Drehzahlregler + Ladedruck im Cockpit
- **Gegner-KI:** Energiemodell (Fahrt, Kurvenlast, Steigen/Sinken), Querlage aus dem Auftriebsvektor,
  Vorhalt beim Schießen, Feuerstöße, Abwehrkurven/Scheren, Abstand gewinnen nach dem Überschießen,
  Spitfire-Kurvenkampf vs. Mustang-Sturzangriff, Rotten, Jagdschutz, Rückzug bei Schaden, Asse;
  Bomber in Formation mit Zielanflug, Bordschützen, Nachzüglern und Notwurf
- Flugmodell mit Kräften: Auftrieb über Anstellwinkel, Luftdichte nach Höhe,
  DB-605-Leistung mit Volldruckhöhe, Ruderwirkung über Staudruck, Abriss mit
  Abkippen, g-Begrenzung durch Steuerkräfte, Grau-/Rotsehen, Trimmung
- Maussteuerung per Zeigerposition zusätzlich zur Tastatur; Maus verlässt das Bild = Pause
- Waffenwahl: 2× MG 131, MG 151/20 oder beide
- Gegner: Spitfire Mk.V, P-51 Mustang, B-17-Bomber; eigene Ju 88 als Begleitschutz-Schützlinge
- Flak, Wolken, Dörfer/Wälder, Flugplatz mit Notlandung + Aufmunitionierung
- Cockpit mit Instrumenten (Fahrt, Höhe, Kurs, Gas, Hülle, Munition)
- Taktische Karte (Norden oben, 9/27 km, Küste, Flak, Ziel, Jagdraum, Ju 88), Treffer-Blitz, Schadensrauch, Flak als schwarze Sprengwolken
- Sound per WebAudio (Motor + MG/Explosionen), ohne Dateien
- Echte 3D-Kamera mit flach schattierten Polygonmodellen (Spitfire Mk.V,
  P-51D, B-17G, Bf 109 G-6, Ju 88 A-4, Frachter, Werk) inkl. Tarnanstrich und Hoheitszeichen
- Landschaft als Feld-Flickenteppich mit Hecken, Dörfern, Wäldern, Küste,
  Ärmelkanal und Dunst; weiche Wolken (Durchflug = Sichtverlust)
- Zielanzeige (`T`) mit Entfernung, Zustandsbalken, Vorhaltepunkt und Randpfeil
- Außenansicht (`K`); abgeschossene Gegner stürzen brennend ab
- Logik intern 320×200 (Mode 13h), gerendert bis 1280×800; `V` schaltet um,
  320×200 = klassischer Look mit Scanlines und reduzierter Palette
- Treffer-Feedback: Hit-Marker am Visier, Schadensbalken + Blitz am Gegner
- Leuchtspur für eigene MG-Garben
- Cheats: `X` = instand setzen, `B` = volle Munition
- Fliegerschule auf der Seite: ausführliche Anleitung zu Start vom Flugplatz, Einsätzen/Laufbahn/Spielständen,
  Rudern, Abriss/g-Last, Energie und Gas, Zielen mit Vorhaltepunkt, Waffenwahl, Taktik gegen die KI, Karte, Landen, Instrumenten
- Komplett statisch, keine Cookies, kein Tracking, keine Dependencies (Spielstände nur lokal im Browser)

## Steuerung (Tastatur, deutsche Hilfe auf der Seite per `H`/`F1`)

| Taste | Wirkung |
|---|---|
| `←` / `→` | Querruder: rollen (Rollrate abhängig von der Fahrt) |
| `↑` / `↓` | Höhenruder: drücken / ziehen (wie Steuerknüppel) |
| `Q` / `E` | Höhentrimmung kopflastig / schwanzlastig |
| `A` / `D` | Seitenruder links / rechts (Gieren, Schieben; am Boden Spornrad lenken) |
| `W` / `S` oder `+` / `-` | Gas mehr / weniger |
| `Leertaste` | Feuern mit gewählter Waffe |
| `1` / `2` / `3` | Waffe: MG 131 / MG 151/20 / beide |
| Maus | Klick ins Bild = Maussteuerung: Zeigerposition = Knüppel (Visier = Mitte), links = Feuer, rechts = Kanone, Rad = Gas; Maus aus dem Bild = Pause |
| `F` | Landeklappen umschalten |
| `G` | Fahrwerk ein / aus |
| `M` | Taktische Karte: aus → 9 km → 27 km |
| `C` | Cockpit ein / aus |
| `T` | Nächstes Ziel aufschalten (Klammer, Entfernung, Vorhaltepunkt) |
| `K` | Außenansicht / Cockpitsicht |
| `V` | Auflösung 320×200 (klassisch) → 640×400 → 960×600 → 1280×800 |
| `L` | Sound an / aus |
| `H` oder `F1` | Hilfe ein / aus |
| `P` / `Esc` | Pause |
| `Enter` | Schnellstart in der Luft (im Einsatz nach Abschuss: Einsatzbericht) |
| `I` | Einsatz vom Flugplatz (Einsatzbesprechung); im Flug zweimal = Einsatz beenden |
| `1` / `2` / `3`, `←` / `→` | In der Besprechung: Bomberabwehr / Freie Jagd / Begleitschutz; `R` = andere Lage |
| `O` | Spielstände: `↑`/`↓` Platz, `S` speichern, `L` laden, `Entf` zweimal löschen |
| `R` / `N` | Neustart (im Einsatz zweimal = Einsatz neu, ohne Wertung) |
| `X` | Cheat: Flugzeug instand setzen (Hülle 100 %) |
| `B` | Cheat: Volle Munition (MG 600, Kanone 200) |

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
