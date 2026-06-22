#!/bin/bash
# Paperclip Restore Script
# Restores source code and config from backup folder

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BACKUP_BASE="/Users/admin/workspace/OPC/backup/paperclip-bk"

echo "=== Paperclip Restore ==="

# List available backups
BACKUPS=($(ls -t "$BACKUP_BASE" 2>/dev/null))

if [ ${#BACKUPS[@]} -eq 0 ]; then
    echo "ERROR: No backups found in $BACKUP_BASE"
    exit 1
fi

echo "Available backups:"
for i in "${!BACKUPS[@]}"; do
    echo "  [$i] ${BACKUPS[$i]}"
done
echo ""

read -p "Select backup number [0]: " SELECTION
SELECTION=${SELECTION:-0}

BACKUP_DIR="$BACKUP_BASE/${BACKUPS[$SELECTION]}"
echo "Selected: $BACKUP_DIR"

echo ""
read -p "This will overwrite .env. Continue? [y/N]: " CONFIRM
if [ "$CONFIRM" != "y" ] && [ "$CONFIRM" != "Y" ]; then
    echo "Cancelled."
    exit 0
fi

# Restore .env
if [ -f "$BACKUP_DIR/env.backup" ]; then
    echo "Restoring .env..."
    cp "$BACKUP_DIR/env.backup" "$SCRIPT_DIR/.env"
fi

# Optionally restore source (usually not needed if using git)
if [ -f "$BACKUP_DIR/paperclip-src.tar.gz" ]; then
    read -p "Restore source code? (usually not needed) [y/N]: " RESTORE_SRC
    if [ "$RESTORE_SRC" = "y" ] || [ "$RESTORE_SRC" = "Y" ]; then
        echo "Restoring source..."
        tar -xzf "$BACKUP_DIR/paperclip-src.tar.gz" -C "$(dirname "$SCRIPT_DIR")"
    fi
fi

echo ""
echo "=== Restore Complete ==="
