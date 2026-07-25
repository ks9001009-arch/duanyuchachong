#!/bin/sh
set -e
echo "Running prisma migrate deploy..."
pnpm prisma migrate deploy
echo "Starting bot..."
exec node dist/main.js
