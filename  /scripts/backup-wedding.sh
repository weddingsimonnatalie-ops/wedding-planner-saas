#!/bin/bash
cd ~/wedding-planner

BACKUP_DATE=$(date +%Y%m%d-%H%M)
BACKUP_DIR=~/backups/$BACKUP_DATE

# Create dated backup directory
mkdir -p $BACKUP_DIR

# Backup database
echo "Backing up database..."
docker compose exec db pg_dump -U wedding wedding > $BACKUP_DIR/database.sql

# Backup uploads
echo "Backing up uploads..."
cp -r ~/wedding-planner/data/uploads $BACKUP_DIR/uploads 2>/dev/null || echo "No uploads to backup"

# Create a single compressed archive
echo "Compressing..."
cd ~/backups
tar -czf wedding-backup-$BACKUP_DATE.tar.gz $BACKUP_DATE/
rm -rf $BACKUP_DATE/

# Keep only last 7 days of backups
find ~/backups -name "wedding-backup-*.tar.gz" -mtime +7 -delete

echo "Backup complete: $BACKUP_DATE"
echo "Location: ~/backups/wedding-backup-$BACKUP_DATE.tar.gz"
echo "Size: $(du -sh ~/backups/wedding-backup-$BACKUP_DATE.tar.gz | cut -f1)"
