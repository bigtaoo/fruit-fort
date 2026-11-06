#!/usr/bin/env bash
# Rebuilds src/assets/audio/*.mp3 from the CC0 source packs (docs/audio.md lists where they come from).
# Sources live in ref/audio-src/ (git-ignored): the five Kenney zips unpacked into kenney_<pack>/ and
# space_battle_bpm130.ogg from OpenGameArt. Needs ffmpeg on PATH. Run from the repo root.
set -euo pipefail
SRC=ref/audio-src
OUT=src/assets/audio
mkdir -p "$OUT"
pick() { find "$SRC/$1" -name "$2" | head -1; }
# name  pack  file  [extra ffmpeg filter]
sfx() {
  local f; f=$(pick "$2" "$3")
  [ -n "$f" ] || { echo "missing $2/$3" >&2; exit 1; }
  ffmpeg -v error -y -i "$f" -af "${4:-anull}" -ac 1 -ar 44100 -c:a libmp3lame -b:a 80k "$OUT/$1.mp3"
}
sfx fire0   kenney_sci-fi-sounds   laserSmall_000.ogg
sfx fire1   kenney_sci-fi-sounds   laserSmall_001.ogg
sfx fire2   kenney_sci-fi-sounds   laserSmall_003.ogg
sfx hit0    kenney_impact-sounds   impactGeneric_light_000.ogg
sfx hit1    kenney_impact-sounds   impactGeneric_light_001.ogg
sfx hit2    kenney_impact-sounds   impactGeneric_light_002.ogg
sfx crit    kenney_sci-fi-sounds   impactMetal_004.ogg
sfx kill    kenney_sci-fi-sounds   slime_000.ogg
sfx bosskill kenney_sci-fi-sounds  explosionCrunch_000.ogg
sfx boom    kenney_sci-fi-sounds   lowFrequency_explosion_000.ogg
sfx strike  kenney_sci-fi-sounds   lowFrequency_explosion_001.ogg
sfx crunch  kenney_sci-fi-sounds   explosionCrunch_002.ogg
sfx buy     kenney_interface-sounds confirmation_002.ogg
sfx reverse kenney_sci-fi-sounds   thrusterFire_000.ogg "atrim=0:0.55,afade=t=out:st=0.3:d=0.25"
sfx happen  kenney_digital-audio   twoTone1.ogg
sfx grab    kenney_digital-audio   powerUp4.ogg
sfx cast    kenney_sci-fi-sounds   forceField_000.ogg
sfx bite0   kenney_impact-sounds   impactPlate_light_000.ogg
sfx bite1   kenney_impact-sounds   impactPlate_light_001.ogg
sfx bite2   kenney_impact-sounds   impactPlate_light_002.ogg
sfx wave    kenney_music-jingles   jingles_NES09.ogg
sfx bosswave kenney_music-jingles  jingles_HIT09.ogg
sfx trick   kenney_digital-audio   phaserDown2.ogg
sfx over    kenney_music-jingles   jingles_NES11.ogg
sfx win     kenney_music-jingles   jingles_NES12.ogg
sfx revive  kenney_digital-audio   powerUp7.ogg
sfx click   kenney_interface-sounds select_002.ogg
sfx fail    kenney_interface-sounds error_002.ogg
ffmpeg -v error -y -i "$SRC/space_battle_bpm130.ogg" -ac 1 -ar 44100 -c:a libmp3lame -b:a 48k "$OUT/music.mp3"
du -ch "$OUT"/*.mp3 | tail -1
