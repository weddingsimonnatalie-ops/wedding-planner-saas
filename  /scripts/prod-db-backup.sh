# Stop the app container to ensure a clean backup
docker compose stop app

# Take the backup
docker compose exec db pg_dump -U wedding wedding > backup-$(date +%Y%m%d).sql

# Check it has content
wc -l backup-$(date +%Y%m%d).sql

# Restart the app
docker compose start app
