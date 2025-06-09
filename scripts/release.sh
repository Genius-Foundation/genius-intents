#!/bin/bash

# Release script for genius-intents SDK
# Usage: ./scripts/release.sh [patch|minor|major|beta]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default to patch if no argument provided
RELEASE_TYPE=${1:-patch}

echo -e "${BLUE}🚀 Starting release process for: ${RELEASE_TYPE}${NC}"

# Check if we're on main branch for stable releases
CURRENT_BRANCH=$(git branch --show-current)
if [[ "$RELEASE_TYPE" != "beta" && "$CURRENT_BRANCH" != "main" ]]; then
    echo -e "${RED}❌ Error: Stable releases must be done from main branch${NC}"
    echo -e "${YELLOW}Current branch: $CURRENT_BRANCH${NC}"
    exit 1
fi

# Check if working directory is clean
if [[ -n $(git status --porcelain) ]]; then
    echo -e "${RED}❌ Error: Working directory is not clean${NC}"
    echo -e "${YELLOW}Please commit or stash your changes before releasing${NC}"
    exit 1
fi

# Pull latest changes
echo -e "${BLUE}📥 Pulling latest changes...${NC}"
git pull origin $CURRENT_BRANCH

# Run tests and checks
echo -e "${BLUE}🧪 Running tests and checks...${NC}"
npm run lint:check
npm run format:check
npm run test
npm run build:clean

# Get current version
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo -e "${BLUE}📋 Current version: ${CURRENT_VERSION}${NC}"

# Create version bump
if [[ "$RELEASE_TYPE" == "beta" ]]; then
    # For beta releases, add beta suffix
    NEW_VERSION=$(npm version prerelease --preid=beta --no-git-tag-version)
    TAG_NAME="v${NEW_VERSION#v}-beta"
else
    # For stable releases
    NEW_VERSION=$(npm version $RELEASE_TYPE --no-git-tag-version)
    TAG_NAME="v${NEW_VERSION#v}"
fi

echo -e "${GREEN}🎯 New version: ${NEW_VERSION}${NC}"

# Update CHANGELOG
echo -e "${BLUE}📝 Please update CHANGELOG.md with release notes${NC}"
echo -e "${YELLOW}Press Enter when ready to continue...${NC}"
read

# Commit version bump
git add package.json CHANGELOG.md
git commit -m "chore: bump version to ${NEW_VERSION}"

# Create and push tag
echo -e "${BLUE}🏷️  Creating tag: ${TAG_NAME}${NC}"
git tag $TAG_NAME
git push origin $CURRENT_BRANCH
git push origin $TAG_NAME

echo -e "${GREEN}✅ Release process completed!${NC}"
echo -e "${BLUE}🎉 Version ${NEW_VERSION} has been tagged and pushed${NC}"
echo -e "${YELLOW}📦 GitHub Actions will automatically publish to NPM${NC}"

if [[ "$RELEASE_TYPE" == "beta" ]]; then
    echo -e "${BLUE}🔍 Install with: npm install genius-intents@beta${NC}"
else
    echo -e "${BLUE}🔍 Install with: npm install genius-intents@latest${NC}"
fi 