# AGENTS.md – Anweisungen für Coding-Agenten (Repo: aces)

Browser-Flugsimulation (Fan-Hommage an „Aces over Europe"), live unter
https://brett.martuni.de/. Bitte an diese Regeln halten.

## 1. Repo-Überblick

- `dist/` ist das Deployment-Artefakt (Caddy-Root). **Nur `dist/` geht live.**
- `index.html`: UI-Texte (deutsch), Hilfe-Tabelle, Buttons. Canvas `#game` 320×200.
- `style.css`: VGA-Design, Scanlines, `image-rendering: pixelated`.
- `game.js`: ein IIFE, keine Module, keine Dependencies. Abschnitte:
  Zustand (`G`, `P`) → Weltaufbau → Wellen → Audio → Eingabe → Physik →
  Projektion → Zeichnen → Loop (`requestAnimationFrame`, `dt` auf 0,05 s gedeckelt).

## 2. Produkt-Constraints (nicht brechen)

- **Deutsch:** Alle sichtbaren Texte/Hilfen/Meldungen auf Deutsch.
- **VGA:** Interne Logik rechnet in 320×200 (`VW`/`VH`). `setVga()` skaliert nur
  per `ctx.setTransform(SCALE,…)` – keine Layout-Pixel außerhalb dieses Systems.
- **Me 109 als Standard:** Bf 109 G-6 bleibt Startflugzeug; neue Typen nur als Option.
- **Tastatur-first:** Jede Aktion braucht ein Tastaturkürzel + Eintrag in der
  Hilfe-Tabelle in `index.html` (sonst ist das Feature „unsichtbar").
- **Keine Original-Assets:** Nichts aus dem 1993er-Spiel nachbauen/kopieren
  (Code, Sprites, Sounds, Texte). Alles prozedural/generiert.
- **Statisch + privat:** Keine Build-Tools, keine npm-Deps, keine Cookies,
  kein Tracking, keine externen Requests. Neue Dateien nur nach Absprache.

## 3. Ändern – worauf achten

- Physik/KI nur in den markierten Update-Funktionen anfassen
  (`update`, `updateEnemies`, `updateBullets`, `updateFlak`); Render-Code
  (`draw*`) nicht mit Spiellogik vermischen.
- Neue Tasten: in `keydown`-Handler + Hilfe-Tabelle + README-Tabelle nachtragen.
- Balancing-Konstanten (Speed, Schaden, Munition) sind absichtlich arcade-lastig;
  Änderungen klein halten und im Commit begründen.
- Audio nur via bestehendem `noiseBurst()`/Engine-Oszillator (WebAudio, lazy init
  nach User-Geste – Autoplay-Regel beachten).

## 4. Verifizieren (Pflicht vor Commit)

```bash
node --check dist/game.js
ls -la dist/
```

Bei Caddy-/Deploy-Änderungen zusätzlich:

```bash
sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
curl -sk -o /dev/null -w "https:%{http_code}\n" https://brett.martuni.de/
```

## 5. Deployment

- Caddy-Site: `/etc/caddy/sites/brett.caddy` → Root `/home/librechat/aces/dist`.
- Änderungen in `dist/` brauchen **keinen** Reload. Caddy nur bei Config-Änderung
  neu laden: `sudo caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile`.
- Altes, pausiertes Config-Relikt (`brett.caddy.paused`, Qwen-Dashboard) ist
  entfernt – nicht wiederherstellen.

## 6. Git

- Normale Feature-Commits auf dem aktuellen Branch, kurze aussagekräftige
  Messages (z. B. `Flak-Balance: Schaden 6-14, Cooldown 2.5-6s`).
- Vor Commit: `git status`, `git diff` prüfen; nur gewollte Dateien stagen.
- Keine Secrets einchecken (braucht das Projekt auch nicht).
- `git config` nicht anfassen; Commit-Identität kommt aus der globalen Config.
