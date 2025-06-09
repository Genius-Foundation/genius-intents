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

# Check if GitHub CLI is installed
if ! command -v gh &> /dev/null; then
    echo -e "${RED}❌ Error: GitHub CLI (gh) is required but not installed${NC}"
    echo -e "${YELLOW}Install it with: brew install gh (macOS) or visit https://cli.github.com${NC}"
    exit 1
fi

# Check if authenticated with GitHub CLI
if ! gh auth status &> /dev/null; then
    echo -e "${RED}❌ Error: Not authenticated with GitHub CLI${NC}"
    echo -e "${YELLOW}Run: gh auth login${NC}"
    exit 1
fi

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
    RELEASE_BRANCH="release/beta-${NEW_VERSION#v}"
else
    # For stable releases
    NEW_VERSION=$(npm version $RELEASE_TYPE --no-git-tag-version)
    TAG_NAME="v${NEW_VERSION#v}"
    RELEASE_BRANCH="release/v${NEW_VERSION#v}"
fi

echo -e "${GREEN}🎯 New version: ${NEW_VERSION}${NC}"

# Create release branch
echo -e "${BLUE}🌿 Creating release branch: ${RELEASE_BRANCH}${NC}"
git checkout -b $RELEASE_BRANCH

# Update CHANGELOG
echo -e "${BLUE}📝 Please update CHANGELOG.md with release notes${NC}"
echo -e "${YELLOW}Press Enter when ready to continue...${NC}"
read

# Commit version bump
git add package.json CHANGELOG.md
git commit -m "chore: bump version to ${NEW_VERSION}"

# Push release branch
echo -e "${BLUE}📤 Pushing release branch...${NC}"
git push origin $RELEASE_BRANCH

# Create PR
echo -e "${BLUE}🔄 Creating pull request...${NC}"
if [[ "$RELEASE_TYPE" == "beta" ]]; then
    PR_TITLE="Release ${NEW_VERSION} (Beta)"
    PR_BODY="🚀 **Beta Release ${NEW_VERSION}**

This PR contains the automated release preparation for version ${NEW_VERSION}.

## Changes
- Version bump to ${NEW_VERSION}
- Updated CHANGELOG.md

## Release Type
- Beta release (will be published to NPM with \`beta\` tag)

## Next Steps
1. Review and merge this PR
2. The release will be automatically published to NPM via GitHub Actions
3. Install with: \`npm install genius-intents@beta\`"
else
    PR_TITLE="Release ${NEW_VERSION}"
    PR_BODY="🚀 **Release ${NEW_VERSION}**

This PR contains the automated release preparation for version ${NEW_VERSION}.

## Changes
- Version bump to ${NEW_VERSION}
- Updated CHANGELOG.md

## Release Type
- ${RELEASE_TYPE^} release (will be published to NPM with \`latest\` tag)

## Next Steps
1. Review and merge this PR
2. The release will be automatically published to NPM via GitHub Actions
3. Install with: \`npm install genius-intents@latest\`"
fi

# Create the PR
gh pr create \
    --title "$PR_TITLE" \
    --body "$PR_BODY" \
    --base main \
    --head $RELEASE_BRANCH

PR_URL=$(gh pr view --json url --jq .url)

echo -e "${GREEN}✅ Release PR created successfully!${NC}"
echo -e "${BLUE}🔗 PR URL: ${PR_URL}${NC}"
echo -e "${YELLOW}📋 Next steps:${NC}"
echo -e "  1. Review the PR at the URL above"
echo -e "  2. Merge the PR when ready"
echo -e "  3. The release will be automatically published to NPM"
echo -e "  4. The git tag will be created after the PR is merged"

# Switch back to main branch
git checkout main

echo -e "${BLUE}🎉 Release process completed!${NC}"
echo -e "${YELLOW}⏳ Waiting for PR merge to complete the release...${NC}" 