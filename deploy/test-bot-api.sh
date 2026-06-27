#!/usr/bin/env bash
KEY=$(grep '^BOT_API_KEY=' /home/nolan/pm-api/.env | cut -d= -f2- | tr -d '\r')
curl -s -w "\nHTTP:%{http_code}\n" \
  -X POST http://localhost:3000/api/bot/auth/discord \
  -H "x-bot-key: $KEY" \
  -H "Content-Type: application/json" \
  -d '{"discordId":"test_deploy","username":"deploy_test"}'
