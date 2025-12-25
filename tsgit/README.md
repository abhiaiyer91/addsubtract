# tsgit - Git Reimplemented in TypeScript

A complete Git implementation built from the ground up in TypeScript. This project recreates Git's core functionality to demonstrate how version control systems work under the hood.

## 🚀 Features

### Core Git Objects
- **Blob**: Stores file contents
- **Tree**: Stores directory structure
- **Commit**: Stores commit metadata and points to trees
- **Tag**: Stores annotated tag information

### Object Storage
- SHA-1 hashing (just like real Git)
- Zlib compression for efficient storage
- Content-addressable storage in `.tsgit/objects/`

### Staging Area (Index)
- Track files staged for commit
- Compare working directory with staged changes
- Support for file modifications and deletions

### References (Refs)
- Branch management (`refs/heads/`)
- Tag support (`refs/tags/`)
- Symbolic references (HEAD)
- Detached HEAD state

### Commands

**Porcelain (User-facing):**
- `init` - Initialize a new repository
- `add` - Stage files for commit
- `commit` - Create a new commit
- `status` - Show working tree status
- `log` - Display commit history
- `diff` - Show changes between commits/index/working tree
- `branch` - List, create, or delete branches
- `checkout` - Switch branches or restore files

**Plumbing (Low-level):**
- `cat-file` - Display object contents
- `hash-object` - Compute object hash
- `ls-files` - Show staged files
- `ls-tree` - List tree contents

## 📦 Installation

```bash
# Clone and install
cd tsgit
npm install

# Build
npm run build

# Link globally (optional)
npm link
```

## 🎯 Usage

### Initialize a Repository
```bash
tsgit init
# or
tsgit init my-project
```

### Basic Workflow
```bash
# Create some files
echo "Hello, World!" > hello.txt
echo "Goodbye!" > bye.txt

# Stage files
tsgit add hello.txt bye.txt
# or add all files
tsgit add .

# Check status
tsgit status

# Commit changes
tsgit commit -m "Initial commit"

# View history
tsgit log
tsgit log --oneline
```

### Branching
```bash
# List branches
tsgit branch

# Create a new branch
tsgit branch feature

# Switch to branch
tsgit checkout feature

# Create and switch in one command
tsgit checkout -b new-feature

# Delete a branch
tsgit branch -d feature
```

### Viewing Diffs
```bash
# Show unstaged changes
tsgit diff

# Show staged changes
tsgit diff --staged
```

### Low-level Commands
```bash
# Hash a file
tsgit hash-object myfile.txt

# Write object to database
tsgit hash-object -w myfile.txt

# View object contents
tsgit cat-file -p <hash>
tsgit cat-file -t <hash>  # show type
tsgit cat-file -s <hash>  # show size

# List staged files
tsgit ls-files
tsgit ls-files -s  # with staging info

# List tree contents
tsgit ls-tree HEAD
tsgit ls-tree -r HEAD  # recursive
```

## 🏗️ Architecture

```
tsgit/
├── src/
│   ├── core/
│   │   ├── types.ts        # Type definitions
│   │   ├── object.ts       # Git objects (Blob, Tree, Commit, Tag)
│   │   ├── object-store.ts # Object storage and retrieval
│   │   ├── index.ts        # Staging area implementation
│   │   ├── refs.ts         # Reference management
│   │   ├── repository.ts   # Main repository class
│   │   └── diff.ts         # Diff algorithm (LCS-based)
│   ├── commands/
│   │   ├── init.ts         # init command
│   │   ├── add.ts          # add command
│   │   ├── commit.ts       # commit command
│   │   ├── status.ts       # status command
│   │   ├── log.ts          # log command
│   │   ├── diff.ts         # diff command
│   │   ├── branch.ts       # branch command
│   │   ├── checkout.ts     # checkout command
│   │   └── ...             # plumbing commands
│   ├── utils/
│   │   ├── hash.ts         # SHA-1 hashing
│   │   ├── compression.ts  # Zlib compression
│   │   └── fs.ts           # File system utilities
│   ├── cli.ts              # CLI entry point
│   └── index.ts            # Library exports
├── package.json
├── tsconfig.json
└── README.md
```

## 🔧 How It Works

### Object Model

Git stores all content as objects in `.tsgit/objects/`. Each object is:
1. Hashed using SHA-1: `{type} {size}\0{content}`
2. Compressed using zlib
3. Stored at `objects/{first 2 chars of hash}/{rest of hash}`

### The Three Trees

1. **Working Directory**: Your actual files
2. **Index (Staging Area)**: Files prepared for next commit
3. **HEAD**: The last committed snapshot

### Commit Structure

```
tree {tree-hash}
parent {parent-commit-hash}
author {name} <{email}> {timestamp} {timezone}
committer {name} <{email}> {timestamp} {timezone}

{commit message}
```

## 📊 Comparison with Real Git

| Feature | tsgit | Git |
|---------|-------|-----|
| Object storage | ✅ | ✅ |
| SHA-1 hashing | ✅ | ✅ |
| Zlib compression | ✅ | ✅ |
| Blob/Tree/Commit | ✅ | ✅ |
| Index/Staging | ✅ | ✅ (binary format) |
| Branches | ✅ | ✅ |
| Tags | ✅ | ✅ |
| Diff | ✅ (LCS) | ✅ (Myers) |
| Merge | ❌ | ✅ |
| Remote operations | ❌ | ✅ |
| Packfiles | ❌ | ✅ |

## 🧪 Programmatic Usage

```typescript
import { Repository, Blob, Tree, Commit } from 'tsgit';

// Initialize a repository
const repo = Repository.init('/path/to/project');

// Add files
repo.add('file.txt');

// Commit
const hash = repo.commit('My commit message');

// Read commit
const commit = repo.objects.readCommit(hash);
console.log(commit.message);

// List branches
const branches = repo.listBranches();
```

## 📝 License

MIT

## 🙏 Acknowledgments

- Inspired by [Git](https://git-scm.com/)
- Built to understand Git internals
- References: [Git Internals](https://git-scm.com/book/en/v2/Git-Internals-Plumbing-and-Porcelain)
