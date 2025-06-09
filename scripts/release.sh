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

# Get current version
CURRENT_VERSION=$(node -p "require('./package.json').version")
echo -e "${BLUE}📋 Current version: ${CURRENT_VERSION}${NC}"

# Validate semver format
if ! echo "$CURRENT_VERSION" | grep -E '^[0-9]+\.[0-9]+\.[0-9]+' > /dev/null; then
    echo -e "${YELLOW}⚠️  Current version '$CURRENT_VERSION' is not valid semver format${NC}"
    echo -e "${BLUE}🔧 Converting to proper semver format...${NC}"
    
    # Convert to proper semver (e.g., "0.1" -> "0.1.0")
    if echo "$CURRENT_VERSION" | grep -E '^[0-9]+\.[0-9]+$' > /dev/null; then
        FIXED_VERSION="${CURRENT_VERSION}.0"
    elif echo "$CURRENT_VERSION" | grep -E '^[0-9]+$' > /dev/null; then
        FIXED_VERSION="${CURRENT_VERSION}.0.0"
    else
        echo -e "${RED}❌ Error: Cannot parse version '$CURRENT_VERSION'${NC}"
        echo -e "${YELLOW}Please fix the version in package.json to proper semver format (e.g., '0.1.0')${NC}"
        exit 1
    fi
    
    echo -e "${BLUE}🔄 Updating package.json version from '$CURRENT_VERSION' to '$FIXED_VERSION'${NC}"
    npm version $FIXED_VERSION --no-git-tag-version
    git add package.json
    git commit -m "fix: update version to proper semver format ($FIXED_VERSION)"
    git push origin $CURRENT_BRANCH
    
    CURRENT_VERSION=$FIXED_VERSION
    echo -e "${GREEN}✅ Version fixed: ${CURRENT_VERSION}${NC}"
fi

# Determine workflow based on release type
if [[ "$RELEASE_TYPE" == "beta" ]]; then
    # BETA RELEASE: Create release branch from develop
    NEW_VERSION=$(npm version prerelease --preid=beta --no-git-tag-version)
    RELEASE_BRANCH="release/beta-${NEW_VERSION#v}"
    PR_BASE="develop"
    
    echo -e "${GREEN}🎯 New beta version: ${NEW_VERSION}${NC}"
    
    # Create release branch from develop
    echo -e "${BLUE}🌿 Creating beta release branch: ${RELEASE_BRANCH}${NC}"
    git checkout -b $RELEASE_BRANCH
    
    # Update CHANGELOG
    echo -e "${BLUE}📝 Please update CHANGELOG.md with beta release notes${NC}"
    echo -e "${YELLOW}Press Enter when ready to continue...${NC}"
    read
    
    # Commit version bump
    git add package.json package-lock.json CHANGELOG.md
    git commit -m "chore: bump version to ${NEW_VERSION}"
    
    # Push release branch
    echo -e "${BLUE}📤 Pushing beta release branch...${NC}"
    git push origin $RELEASE_BRANCH
    
    # Create PR to develop
    PR_TITLE="Beta Release ${NEW_VERSION}"
    PR_BODY="🚀 **Beta Release ${NEW_VERSION}**

This PR contains the automated beta release preparation for version ${NEW_VERSION}.

## Changes
- Version bump to ${NEW_VERSION}
- Updated CHANGELOG.md

## Release Type
- Beta release (will be published to NPM with \`beta\` tag)
- This stays on develop branch for continued development

## Next Steps
1. Review and merge this PR to develop
2. The beta will be automatically published to NPM via GitHub Actions
3. Install with: \`npm install genius-intents@beta\`

## Development Continues
After merging, development can continue on develop branch as normal."

else
    # STABLE RELEASE: Direct develop → main PR
    NEW_VERSION=$(npm version $RELEASE_TYPE --no-git-tag-version)
    PR_BASE="main"
    
    echo -e "${GREEN}🎯 New stable version: ${NEW_VERSION}${NC}"
    
    # Auto-update CHANGELOG
    echo -e "${BLUE}📝 Auto-updating CHANGELOG.md...${NC}"
    
    # Get today's date
    TODAY=$(date +"%Y-%m-%d")
    
    # Create changelog entry
    CHANGELOG_ENTRY="## [${NEW_VERSION#v}] - ${TODAY}

### Added
- Version bump to ${NEW_VERSION#v}

### Changed
- Package updates and improvements

### Fixed
- Bug fixes and stability improvements

---

"
    
    # Check if CHANGELOG.md exists
    if [[ -f "CHANGELOG.md" ]]; then
        # Insert new entry after the first line (assuming it's a title)
        echo -e "${BLUE}📄 Updating existing CHANGELOG.md...${NC}"
        # Create temp file with new content
        {
            head -n 1 CHANGELOG.md
            echo ""
            echo "$CHANGELOG_ENTRY"
            tail -n +2 CHANGELOG.md
        } > CHANGELOG.tmp && mv CHANGELOG.tmp CHANGELOG.md
    else
        # Create new CHANGELOG.md
        echo -e "${BLUE}📄 Creating new CHANGELOG.md...${NC}"
        cat > CHANGELOG.md << EOF
# Changelog

All notable changes to this project will be documented in this file.

$CHANGELOG_ENTRY
EOF
    fi
    
    echo -e "${YELLOW}📝 CHANGELOG.md has been auto-updated. Please review and edit if needed.${NC}"
    echo -e "${BLUE}Press Enter when ready to continue...${NC}"
    read
    
    # Commit version bump directly to develop
    git add package.json package-lock.json CHANGELOG.md
    git commit -m "chore: bump version to ${NEW_VERSION}"
    
    # Push develop with version bump
    echo -e "${BLUE}📤 Pushing version bump to develop...${NC}"
    git push origin develop
    
    # Capitalize release type for display
    RELEASE_TYPE_CAPITALIZED="$(echo ${RELEASE_TYPE:0:1} | tr '[:lower:]' '[:upper:]')$(echo ${RELEASE_TYPE:1})"
    
    # Create PR from develop to main
    PR_TITLE="Release ${NEW_VERSION}"
    PR_BODY="🚀 **Release ${NEW_VERSION}**

This PR contains the stable release ${NEW_VERSION} from develop to main.

## Changes
- Version bump to ${NEW_VERSION}
- Updated CHANGELOG.md
- All features and fixes from develop branch

## Release Type
- ${RELEASE_TYPE_CAPITALIZED} release (will be published to NPM with \`latest\` tag)

## Next Steps
1. Review and merge this PR to main
2. The release will be automatically published to NPM via GitHub Actions
3. Install with: \`npm install genius-intents@latest\`

## Post-Release
After merging, main will be tagged and published. Consider merging main back to develop to sync any release-specific changes."
fi

# Create the PR
echo -e "${BLUE}🔄 Creating pull request...${NC}"
gh pr create \
    --title "$PR_TITLE" \
    --body "$PR_BODY" \
    --base $PR_BASE \
    --head $([[ "$RELEASE_TYPE" == "beta" ]] && echo $RELEASE_BRANCH || echo "develop")

PR_URL=$(gh pr view --json url --jq .url)

echo -e "${GREEN}✅ Release PR created successfully!${NC}"
echo -e "${BLUE}🔗 PR URL: ${PR_URL}${NC}"

if [[ "$RELEASE_TYPE" == "beta" ]]; then
    echo -e "${YELLOW}📋 Beta Release Next Steps:${NC}"
    echo -e "  1. Review the PR: ${BLUE}develop ← ${RELEASE_BRANCH}${NC}"
    echo -e "  2. Merge to develop when ready"
    echo -e "  3. Beta will be published to NPM automatically"
    echo -e "  4. Continue development on develop branch"
    
    # Switch back to develop
    git checkout develop
else
    echo -e "${YELLOW}📋 Stable Release Next Steps:${NC}"
    echo -e "  1. Review the PR: ${BLUE}main ← develop${NC}"
    echo -e "  2. Merge to main when ready"
    echo -e "  3. Release will be published to NPM automatically"
    echo -e "  4. Consider merging main back to develop after release"
fi

echo -e "${BLUE}🎉 Release process completed!${NC}"
echo -e "${YELLOW}⏳ Waiting for PR merge to complete the release...${NC}" 