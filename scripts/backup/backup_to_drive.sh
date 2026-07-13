#!/bin/sh
# ─────────────────────────────────────────────────────────────────────────────
# Backup SNAPSHOT incrementale del repo verso una cartella (es. Google Drive).
#
# NON è sync bidirezionale: copia solo i delta (rsync --delete):
#   • file nuovi     → creati nella destinazione
#   • file modificati→ aggiornati
#   • file eliminati → rimossi anche dalla destinazione
# Unidirezionale (repo → dest): non crea mai copie di conflitto "nome (1)".
#
# Esclude le cartelle rigenerabili/mutevoli (node_modules, artifacts, cache, out,
# typechain-types) — si rigenerano con `pnpm install` + compile. Include il
# codice, i documenti e la history git (.git), così la copia è un repo completo.
# In più crea un `git bundle`: UN file atomico con tutta la storia, il backup
# git più robusto (recupero: `git clone TokenIGT.bundle nuova-cartella`).
#
# Uso:
#   scripts/backup/backup_to_drive.sh "/percorso/della/cartella/Drive"
#   # oppure imposta BACKUP_DEST e lancialo senza argomenti
# Automatico ogni 15 min (opzionale): vedi in fondo.
# ─────────────────────────────────────────────────────────────────────────────
set -eu

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
DEST="${1:-${BACKUP_DEST:-}}"

if [ -z "$DEST" ]; then
  echo "❌ Destinazione non indicata."
  echo "   Uso: $0 \"/Users/<tu>/Library/CloudStorage/GoogleDrive-<email>/My Drive/Backup\""
  echo "   (oppure: export BACKUP_DEST=... e rilancia)"
  exit 1
fi

TARGET="$DEST/$(basename "$REPO")"
mkdir -p "$TARGET"

echo "Snapshot: $REPO  →  $TARGET"

rsync -a --delete \
  --exclude '.git/index.lock' \
  --exclude 'node_modules/' \
  --exclude 'artifacts/' \
  --exclude 'out/' \
  --exclude 'cache/' \
  --exclude 'typechain-types/' \
  --exclude '.DS_Store' \
  --exclude '*.log' \
  --exclude '* ([0-9])*' \
  "$REPO/" "$TARGET/"

# Backup git atomico e consistente (tutta la storia, tutti i branch)
git -C "$REPO" bundle create "$TARGET/$(basename "$REPO").bundle" --all >/dev/null 2>&1 \
  && echo "✓ git bundle aggiornato"

echo "✅ Snapshot completato ($(date '+%H:%M:%S'))"
