#!/bin/sh
# Export DB password from Docker secret if available
if [ -f /run/secrets/db_password ]; then
  export DB_PASSWORD=$(cat /run/secrets/db_password)
fi
exec java -XX:MaxRAMPercentage=75.0 -jar /app/app.jar
