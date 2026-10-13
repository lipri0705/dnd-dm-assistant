#!/bin/sh
# Builds the app and publishes dist/ to the gh-pages branch (GitHub Pages serves it).
# Uses the lipri0705 gh login explicitly, so it works whichever gh account is active.
set -e
REPO=https://github.com/lipri0705/dnd-dm-assistant.git
GH_USER=lipri0705
EMAIL=341873650+lipri0705@users.noreply.github.com

npm run build
cd dist
touch .nojekyll
rm -rf .git
git init -q -b gh-pages
git add -A
git -c user.name="$GH_USER" -c user.email="$EMAIL" commit -q -m "Deploy $(date -u +%Y-%m-%dT%H:%M:%SZ)"
git -c credential.helper= \
  -c "credential.helper=!f() { echo username=$GH_USER; echo password=\$(gh auth token -h github.com -u $GH_USER); }; f" \
  push -q -f "$REPO" gh-pages
rm -rf .git
echo "Deployed: https://lipri0705.github.io/dnd-dm-assistant/"
