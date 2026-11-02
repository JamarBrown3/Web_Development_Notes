#!/bin/bash
# Quick login test from the terminal. Asks for your email and password (hidden),
# then logs in with the CSRF token handled for you. Nothing is saved: the cookie
# file is deleted at the end.
# Run from the server folder while "npm run dev" is running:  bash scripts/try-login.sh
BASE="${BASE:-http://localhost:3000}"
read -p "Email: " EMAIL
read -s -p "Password: " PW; echo
JAR=$(mktemp)
TOKEN=$(curl -s -c "$JAR" "$BASE/api/auth/csrf" | sed -E 's/.*"csrfToken":"([a-f0-9]+)".*/\1/')
BODY=$(EMAIL="$EMAIL" PW="$PW" node -e 'console.log(JSON.stringify({email:process.env.EMAIL,password:process.env.PW}))')
echo "--- login"
curl -s -b "$JAR" -c "$JAR" -H "Content-Type: application/json" -H "X-CSRF-Token: $TOKEN" -d "$BODY" -w "\nstatus %{http_code}\n" "$BASE/api/auth/login"
echo "--- who am I"
curl -s -b "$JAR" -w "\nstatus %{http_code}\n" "$BASE/api/auth/me"
rm -f "$JAR"
