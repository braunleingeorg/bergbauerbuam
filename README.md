# Bergbauerbuam

Die App für unsere Abende 🍺

- **Abend:** Getränke zählen (Helles 0,33 · Halbe 0,5 · Longdrink 0,3 · Shot), Heimgang eintragen (auch für andere), Kotz-Counter, Abstimmung (Der Vollste, MVP, LVP)
- **Exen:** Stoppuhr mit Rekorden pro Getränk
- **Rangliste:** Exen-Bestzeiten, ewige Trinker-Tabelle, Kotz-Counter, wer am frühesten heimgeht, Titel
- **Rückblick:** alle Abende mit Verlauf und Gesamtbilanz
- **Crew:** Spieler anlegen, umbenennen, ausblenden

## Technik

Reine Web-App ohne Build-Schritt (HTML/CSS/JS), Daten in Supabase, Hosting auf Vercel.

- `supabase/schema.sql` einmal im Supabase SQL Editor ausführen
- `config.js` enthält Supabase-URL und publishable Key
