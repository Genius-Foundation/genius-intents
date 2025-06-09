# Complete Development Flow Guide

This guide demonstrates the entire development workflow from feature development to production release.

## 🌟 **Branch Strategy**

```
main (production)
├── develop (integration)
├── feature/new-protocol-support
├── feature/improve-error-handling
└── hotfix/critical-bug-fix
```

## 👨‍💻 **Developer Workflow**

### **1. Starting New Feature Development**

```bash
# Start from develop branch
git checkout develop
git pull origin develop

# Create feature branch
git checkout -b feature/add-uniswap-support

# Install dependencies
npm install

# Start development
npm run test:watch  # Run tests in watch mode
```

### **2. Development Process**

```bash
# Make your changes
# Add tests for new functionality
# Run quality checks locally
npm run lint        # Fix linting issues
npm run format      # Format code
npm run test        # Run all tests
npm run build       # Ensure it builds
```

### **3. Commit and Push**

```bash
# Stage changes
git add .

# Commit with conventional commit format
git commit -m "feat: add Uniswap V3 protocol support

- Add Uniswap V3 integration
- Support for concentrated liquidity positions
- Add comprehensive tests for new protocol
- Update documentation"

# Push feature branch
git push origin feature/add-uniswap-support
```

### **4. Create Pull Request**

1. Go to GitHub and create PR from `feature/add-uniswap-support` → `develop`
2. Fill out PR template with:
   - Description of changes
   - Breaking changes (if any)
   - Testing performed
3. PR automatically triggers validation workflow
4. Wait for all checks to pass ✅

## 🔄 **Integration Workflow**

### **5. Code Review & Merge**

```bash
# Reviewer checks:
# - Code quality and standards
# - Test coverage
# - Documentation updates
# - Breaking changes

# After approval, merge to develop
# This triggers CI workflow on develop branch
```

### **6. Integration Testing**

```bash
# CI runs automatically on develop:
# ✅ Lint check
# ✅ Format check  
# ✅ Unit tests
# ✅ Integration tests
# ✅ Build validation
# ✅ Multiple Node.js versions (16, 18, 20, 22)
```

## 🧪 **Beta Release Process**

### **7. Preparing Beta Release**

```bash
# From develop branch with accumulated features
git checkout develop
git pull origin develop

# Run release script for beta
./scripts/release.sh beta
```

**What happens during beta release:**

1. **Pre-flight checks**: Tests, linting, build
2. **Version bump**: `1.2.0` → `1.2.1-beta.0`
3. **Create beta tag**: `v1.2.1-beta.0`
4. **Push tag**: Triggers beta-release workflow
5. **Automated publishing**: NPM with `@beta` tag

### **8. Beta Release Workflow (Automated)**

```yaml
# Triggered by: git tag v1.2.1-beta.0
Beta Release Workflow:
├── Checkout code
├── Setup Node.js 20.x
├── Install dependencies (npm ci)
├── Run tests
├── Run linting
├── Build package
├── Publish to NPM with @beta tag
└── Create GitHub pre-release
```

### **9. Beta Testing & Validation**

```bash
# Install beta version for testing
npm install genius-intents@beta

# Test in staging environment
npm run test:integration

# Community/internal testing feedback
```

## 🚀 **Production Release Process**

### **10. Preparing Production Release**

```bash
# Merge develop to main for release
git checkout main
git pull origin main
git merge develop

# Or create PR: develop → main
# After merge to main:
git checkout main
git pull origin main

# Choose release type and run script
./scripts/release.sh minor  # or patch/major
```

### **11. Production Release Example**

```bash
# Terminal output during release:
🚀 Starting release process for: minor

📥 Pulling latest changes...
🧪 Running tests and checks...
   ✅ Linting passed
   ✅ Formatting passed  
   ✅ Tests passed (45 tests, 0 failures)
   ✅ Build successful

📋 Current version: 1.2.0
🎯 New version: 1.3.0

📝 Please update CHANGELOG.md with release notes
Press Enter when ready to continue...

# After updating CHANGELOG.md:
🏷️ Creating tag: v1.3.0
✅ Release process completed!
🎉 Version 1.3.0 has been tagged and pushed
📦 GitHub Actions will automatically publish to NPM
🔍 Install with: npm install genius-intents@latest
```

### **12. Production Release Workflow (Automated)**

```yaml
# Triggered by: git tag v1.3.0
Production Release Workflow:
├── Checkout code  
├── Setup Node.js 20.x
├── Install dependencies (npm ci)
├── Run full test suite
├── Run linting checks
├── Run formatting checks
├── Build package
├── Update package.json version
├── Publish to NPM with @latest tag
└── Create GitHub release with changelog
```

## 📊 **Real-World Example Timeline**

### **Week 1: Feature Development**
```bash
Monday:
  git checkout -b feature/add-jupiter-v6
  # Development work...
  
Wednesday:  
  git push origin feature/add-jupiter-v6
  # Create PR → develop
  
Friday:
  # PR approved and merged to develop
```

### **Week 2: Integration & Beta**
```bash
Monday:
  # More features merged to develop
  
Wednesday:
  git checkout develop
  ./scripts/release.sh beta
  # v1.2.1-beta.0 published
  
Thursday-Friday:
  # Beta testing and feedback
```

### **Week 3: Production Release**
```bash
Monday:
  # Fix issues found in beta
  
Wednesday:
  git checkout main
  git merge develop
  ./scripts/release.sh minor
  # v1.3.0 published to production
```

## 🛠 **Commands Reference**

### **Development Commands**
```bash
npm run build:clean     # Clean build
npm run lint           # Fix linting issues
npm run lint:check     # Check linting (CI)
npm run format         # Format code
npm run format:check   # Check formatting (CI)
npm run test           # Run tests
npm run test:watch     # Run tests in watch mode
npm run test:coverage  # Run tests with coverage
```

### **Release Commands**
```bash
./scripts/release.sh patch    # 1.0.0 → 1.0.1
./scripts/release.sh minor    # 1.0.0 → 1.1.0  
./scripts/release.sh major    # 1.0.0 → 2.0.0
./scripts/release.sh beta     # 1.0.0 → 1.0.1-beta.0

npm run release:dry          # Test publishing
npm run version:patch        # Bump patch version only
```

### **Installation Commands**
```bash
npm install genius-intents           # Latest stable
npm install genius-intents@beta      # Latest beta
npm install genius-intents@1.2.0     # Specific version
npm install genius-intents@latest    # Explicit latest
```

## 🔍 **Monitoring & Verification**

### **After Each Release**
1. **Check NPM**: Visit npmjs.com/package/genius-intents
2. **Verify Installation**: `npm install genius-intents` in test project
3. **GitHub Release**: Check release notes and assets
4. **Download Stats**: Monitor adoption metrics
5. **Issue Reports**: Watch for bug reports

### **Quality Gates**
- ✅ All tests must pass
- ✅ Linting must pass  
- ✅ Formatting must be consistent
- ✅ Build must succeed
- ✅ PR review must be approved
- ✅ No critical security vulnerabilities

This workflow ensures high-quality releases with proper testing and validation at every step! 🎯 