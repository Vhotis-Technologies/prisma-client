#!/bin/sh
# Ensure SQLite DB file exists so Django can open/create it (avoids "unable to open database file" when file was deleted)
if [ ! -f /app/db.sqlite3 ]; then
  touch /app/db.sqlite3
fi
exec "$@"
