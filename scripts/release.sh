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

# Get current branch
CURRENT_BRANCH=$(git branch --show-current)

# Check branch requirements
if [[ "$RELEASE_TYPE" == "beta" ]]; then
    # Beta releases should be done from develop
    if [[ "$CURRENT_BRANCH" != "develop" ]]; then
        echo -e "${RED}❌ Error: Beta releases must be done from develop branch${NC}"
        echo -e "${YELLOW}Current branch: $CURRENT_BRANCH${NC}"
        echo -e "${BLUE}Switch to develop: ${YELLOW}git checkout develop${NC}"
        exit 1
    fi
else
    # Stable releases should be done from develop
    if [[ "$CURRENT_BRANCH" != "develop" ]]; then
        echo -e "${RED}❌ Error: Stable releases must be done from develop branch${NC}"
        echo -e "${YELLOW}Current branch: $CURRENT_BRANCH${NC}"
        echo -e "${BLUE}Switch to develop: ${YELLOW}git checkout develop${NC}"
        exit 1
    fi
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

# Get current version for display
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo -e "${BLUE}📋 Current version: ${CURRENT_VERSION}${NC}"

# Determine workflow based on release type
if [[ "$RELEASE_TYPE" == "beta" ]]; then
    # BETA RELEASE: Create release branch from develop
    echo -e "${BLUE}🧪 Preparing beta release...${NC}"
    
    # Create a temporary commit to trigger version bump calculation
    TEMP_COMMIT_MSG="chore: prepare beta release"
    
    # Create release branch from develop
    RELEASE_BRANCH="release/beta-$(date +%Y%m%d-%H%M%S)"
    echo -e "${BLUE}🌿 Creating beta release branch: ${RELEASE_BRANCH}${NC}"
    git checkout -b $RELEASE_BRANCH
    
    # Create temporary commit to mark release intent
    git commit --allow-empty -m "chore: bump version to beta"
    
    # Push release branch
    echo -e "${BLUE}📤 Pushing beta release branch...${NC}"
    git push origin $RELEASE_BRANCH
    
    # Create PR to develop for beta
    PR_TITLE="🧪 Beta Release"
    PR_BODY="🧪 **Beta Release Preparation**

This PR prepares a beta release from the develop branch.

## What happens when merged:
1. GitHub Actions will automatically:
   - Generate version number with beta suffix
   - Create changelog from commit history and PRs
   - Create git tag
   - Publish to NPM with \`beta\` tag
   - Create GitHub pre-release

## Release Type
- Beta release (will be published to NPM with \`beta\` tag)
- Based on current develop branch state
- Intended for testing and feedback

## Installation after release:
\`\`\`bash
npm install genius-intents@beta
\`\`\`

## Next Steps
1. Review and merge this PR to develop
2. The beta will be automatically published via GitHub Actions
3. Test the beta version and provide feedback
4. Continue development on develop branch as normal"

    # Create PR from release branch to develop
    echo -e "${BLUE}🔄 Creating beta release PR...${NC}"
    gh pr create \
        --title "$PR_TITLE" \
        --body "$PR_BODY" \
        --base develop \
        --head $RELEASE_BRANCH

    PR_URL=$(gh pr view --json url --jq .url)

    echo -e "${GREEN}✅ Beta release PR created successfully!${NC}"
    echo -e "${BLUE}🔗 PR URL: ${PR_URL}${NC}"
    echo -e "${YELLOW}📋 Beta Release Next Steps:${NC}"
    echo -e "  1. Review the PR: ${BLUE}develop ← ${RELEASE_BRANCH}${NC}"
    echo -e "  2. Merge to develop when ready"
    echo -e "  3. Beta will be published to NPM automatically with version and changelog"
    echo -e "  4. Install with: ${BLUE}npm install genius-intents@beta${NC}"
    echo -e "  5. Continue development on develop branch"
    
    # Switch back to develop
    git checkout develop
    
else
    # STABLE RELEASE: Create release branch from develop
    echo -e "${BLUE}🎯 Preparing stable release...${NC}"
    
    # Capitalize release type for display
    RELEASE_TYPE_CAPITALIZED="$(echo ${RELEASE_TYPE:0:1} | tr '[:lower:]' '[:upper:]')$(echo ${RELEASE_TYPE:1})"
    
    # Create release branch from develop
    RELEASE_BRANCH="release/$(date +%Y%m%d-%H%M%S)"
    echo -e "${BLUE}🌿 Creating stable release branch: ${RELEASE_BRANCH}${NC}"
    git checkout -b $RELEASE_BRANCH
    
    # Create temporary commit to mark release intent
    git commit --allow-empty -m "chore: bump version to ${RELEASE_TYPE}"
    
    # Push release branch
    echo -e "${BLUE}📤 Pushing stable release branch...${NC}"
    git push origin $RELEASE_BRANCH
    
    # Create PR from release branch to main
    PR_TITLE="🚀 ${RELEASE_TYPE_CAPITALIZED} Release"
    PR_BODY="🚀 **${RELEASE_TYPE_CAPITALIZED} Release Preparation**

This PR contains a ${RELEASE_TYPE} release from the develop branch.

## What happens when merged to main:
1. GitHub Actions will automatically:
   - Generate new version number (${RELEASE_TYPE} bump)
   - Create comprehensive changelog from commit history and PRs
   - Create git tag
   - Update package.json version
   - Update CHANGELOG.md file
   - Publish to NPM with \`latest\` tag
   - Create GitHub release
   - Create sync PR back to develop

## Release Type
- ${RELEASE_TYPE_CAPITALIZED} release (will be published to NPM with \`latest\` tag)
- All features and fixes from develop branch (frozen at release branch creation)

## Installation after release:
\`\`\`bash
npm install genius-intents@latest
\`\`\`

## Next Steps
1. Review and merge this PR to main
2. The release will be automatically published via GitHub Actions with full changelog
3. Main will be synced back to develop automatically

## Changelog Preview
The final changelog will be automatically generated from:
- Conventional commit messages
- Merged PR titles and descriptions
- Commit history since last release

*Full changelog will be available in the GitHub release and CHANGELOG.md*"

    # Create the PR
    echo -e "${BLUE}🔄 Creating release PR...${NC}"
    gh pr create \
        --title "$PR_TITLE" \
        --body "$PR_BODY" \
        --base main \
        --head $RELEASE_BRANCH

    PR_URL=$(gh pr view --json url --jq .url)

    echo -e "${GREEN}✅ Release PR created successfully!${NC}"
    echo -e "${BLUE}🔗 PR URL: ${PR_URL}${NC}"
    echo -e "${YELLOW}📋 Stable Release Next Steps:${NC}"
    echo -e "  1. Review the PR: ${BLUE}main ← ${RELEASE_BRANCH}${NC}"
    echo -e "  2. Merge to main when ready"
    echo -e "  3. Release will be published to NPM automatically with full changelog"
    echo -e "  4. CHANGELOG.md will be updated automatically"
    echo -e "  5. Main will be synced back to develop automatically"
    
    # Switch back to develop
    git checkout develop
fi

echo -e "${BLUE}🎉 Release process completed!${NC}"
echo -e "${YELLOW}⏳ The changelog will be automatically generated from your commit history and PRs when the PR is merged.${NC}"
echo -e "${GREEN}💡 Tip: Use conventional commit messages (feat:, fix:, docs:, etc.) for better changelog categorization!${NC}"