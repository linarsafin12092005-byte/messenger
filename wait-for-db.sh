#!/bin/sh

echo "Ждем базу данных..."

while ! nc -z db 5432; do
  sleep 1
done

echo "База данных готова!"

exec "$@"