# SDK Setup and Deployment Guide

This guide will help you set up the automated release workflow for the genius-intents SDK.

## Prerequisites

- Node.js 16+ installed
- NPM account with publishing permissions
- GitHub repository with Actions enabled

## GitHub Repository Setup

### 1. Repository Settings

1. **Branch Protection Rules**:
   - Go to Settings → Branches
   - Add protection rule for `main` branch:
     - ✅ Require a pull request before merging
     - ✅ Require status checks to pass before merging
     - ✅ Require branches to be up to date before merging
     - ✅ Include administrators

2. **Required Status Checks**:
   - Add these required checks:
     - `validate` (from PR validation workflow)
     - `test` (from CI workflow)
     - `build` (from CI workflow)

### 2. Repository Secrets

Add the following secrets in Settings → Secrets and variables → Actions:

#### Required Secrets:

- **`NPM_TOKEN`**: Your NPM automation token
  - Go to npmjs.com → Access Tokens → Generate New Token
  - Select "Automation" type
  - Copy the token and add to GitHub secrets

#### Optional Secrets:

- None required at this time

### 3. NPM Setup

1. **Create NPM Account** (if you don't have one):
   ```bash
   npm adduser
   ```

2. **Generate Automation Token**:
   - Go to npmjs.com → Access Tokens
   - Click "Generate New Token"
   - Select "Automation"
   - Copy the token

3. **Test Local Publishing** (optional):
   ```bash
   npm run release:dry
   ```

## Release Process

### Automated Release (Recommended)

1. **For Patch Release**:
   ```bash
   ./scripts/release.sh patch
   ```

2. **For Minor Release**:
   ```bash
   ./scripts/release.sh minor
   ```

3. **For Major Release**:
   ```bash
   ./scripts/release.sh major
   ```

4. **For Beta Release**:
   ```bash
   ./scripts/release.sh beta
   ```

### Manual Release Process

1. **Update version**:
   ```bash
   npm version patch  # or minor/major
   ```

2. **Update CHANGELOG.md** with release notes

3. **Commit and tag**:
   ```bash
   git add .
   git commit -m "chore: release v1.0.1"
   git tag v1.0.1
   ```

4. **Push to trigger deployment**:
   ```bash
   git push origin main --tags
   ```

## Workflow Overview

### CI Pipeline (`ci.yml`)
- Runs on every push to main/develop
- Tests on Node.js 16, 18, 20, 22
- Runs linting, formatting, tests, and build
- Uploads coverage reports

### PR Validation (`build-lint-pr.yaml`)
- Runs on every pull request
- Validates code quality and tests
- Ensures package can be built

### Release (`release.yml`)
- Triggers on version tags (v*)
- Publishes to NPM with `latest` tag
- Creates GitHub release

### Beta Release (`beta-release.yml`)
- Triggers on beta/alpha/rc tags
- Publishes to NPM with `beta` tag
- Creates GitHub pre-release

### Security (`security.yml`)
- Weekly security audits
- Dependency vulnerability scanning
- PR dependency reviews

## Package Distribution

Your SDK will be available at:
- **NPM**: https://www.npmjs.com/package/genius-intents
- **GitHub Packages**: https://github.com/Genius-Foundation/genius-intents/packages

### Installation Commands:

```bash
# Latest stable version
npm install genius-intents

# Beta version
npm install genius-intents@beta

# Specific version
npm install genius-intents@1.0.0
```

## Monitoring and Maintenance

- **GitHub Actions**: Monitor workflow runs in the Actions tab
- **NPM Stats**: Check download stats at npmjs.com
- **Security**: Review Dependabot alerts regularly
- **Test Results**: Monitor test results in GitHub Actions

## Troubleshooting

### Common Issues:

1. **NPM Token Invalid**:
   - Regenerate token on npmjs.com
   - Update GitHub secret

2. **Build Failures**:
   - Check Node.js version compatibility
   - Verify all dependencies are compatible

3. **Permission Errors**:
   - Ensure NPM token has publish permissions
   - Check package name availability

### Getting Help:

- Check GitHub Actions logs for detailed error messages
- Review NPM documentation for publishing issues
- Consult the repository issues for known problems

## Next Steps

1. Set up the required GitHub secrets
2. Test the workflow with a beta release
3. Monitor the first few releases
4. Set up branch protection rules
5. Consider adding code owners file 