#!/bin/bash
# Usage: ./push-to-github.sh <github-username> <repo-name>
# Example: ./push-to-github.sh deepak lawyered-will-maker
#
# Pre-requisite: create an empty repo on GitHub first (no README, no .gitignore)

set -e

GITHUB_USER=${1:-"your-username"}
REPO_NAME=${2:-"lawyered-will-maker"}

echo "Initialising git repo..."
git init
git add .
git commit -m "feat: initial commit — AI-Assisted Will Maker

Parts 1-7 + Part 8 (streaming):
- NestJS backend: auth, DB entities, AI interview, validity, PDF generation
- Next.js frontend: login/register, split-view chat + live preview
- Docker Compose setup with PostgreSQL
- Unit tests: auth, validity, interview services
- DECISIONS.md and INCIDENT.md
"

echo "Adding remote..."
git remote add origin "https://github.com/${GITHUB_USER}/${REPO_NAME}.git"

echo "Pushing to GitHub..."
git branch -M main
git push -u origin main

echo ""
echo "Done! Repo pushed to https://github.com/${GITHUB_USER}/${REPO_NAME}"
