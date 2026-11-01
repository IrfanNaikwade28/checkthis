# CheckThis

**Understand any file. Explore any folder. Know what's inside.**

CheckThis is a lightweight, offline-first file and directory inspection tool,
available as both a command-line application and a reusable Node.js/TypeScript
library. It works entirely offline — no AI, no cloud APIs, no internet
required.

## Features

- **File inspection** — name, path, extension, size, modification date, type
  category, hidden-file detection
- **Directory analysis** — recursive traversal, file/subdirectory counts,
  aggregate size, extension distribution, empty-directory detection
- **Content safety** — size-bounded reads, binary file detection, never reads
  file contents automatically
- **Project detection** — recognizes Node.js, Python, Rust, Go, and Java
  projects from marker files
- **Deterministic explanations** — separates verified facts from assumptions
- **Symlink safety** — detects symlink loops, never follows symlinks
  recursively by default
- **Read-only** — never modifies, deletes, moves, renames, or executes
  inspected files
- **Zero runtime dependencies** — uses only Node.js built-in APIs

## Installation

```bash
npm install checkthis
```

## CLI Usage

### Commands

```bash
checkthis README.md        # Inspect a single file
checkthis ./src            # Analyze a directory recursively
checkthis .                # Analyze the current directory
checkthis package.json     # Inspect a specific file
```

### Flags

| Flag | Description |
|------|-------------|
| `-h, --help` | Show help message |
| `-v, --version` | Show version number |
| `--no-color` | Disable colored terminal output |

### Examples

```bash
# Inspect a file
$ checkthis README.md
README.md — file, 2.4 KB
Facts:
  • Name: README.md
  • Size: 2.4 KB
  • Extension: .md
  ...

# Analyze a directory
$ checkthis ./src
src — 12 files, 3 directories, 45.6 KB
Facts:
  • Files: 12
  • Subdirectories: 3
  • Extension distribution: .ts: 8, .js: 3, .json: 1
  ...

# Disable colors
$ checkthis --no-color .
```

## Library Usage

CheckThis is an ESM-only package. Import it in your Node.js or TypeScript
project:

```ts
import {
  inspectPath,
  analyzeDirectory,
  explain,
  render,
  formatSize,
} from "checkthis";

// Inspect a single file
const fileResult = await inspectPath("./README.md");
console.log(render(explain(fileResult)));

// Analyze a directory
const dirResult = await analyzeDirectory("./src");
console.log(
  render(
    explain({
      entry: dirResult,
      explanation: { summary: "", facts: [], assumptions: [] },
    })
  )
);

// Format byte sizes
console.log(formatSize(dirResult.totalSize)); // "45.6 KB"
```

### Public API

| Function | Signature | Description |
|----------|-----------|-------------|
| `inspectPath` | `(path, options?) => Promise<InspectPathResult>` | Inspect a single file or directory |
| `analyzeDirectory` | `(path, options?) => Promise<DirectoryStats>` | Recursively analyze a directory |
| `explain` | `(result) => ExplainResult` | Produce a deterministic explanation |
| `render` | `(result, options?) => string` | Format an explanation for the terminal |
| `formatSize` | `(bytes) => string` | Convert bytes to human-readable size |

All functions are asynchronous except `explain`, `render`, and `formatSize`,
which are synchronous.

## Technical Architecture

```
checkthis/
├── src/
│   ├── index.ts      # Public API barrel
│   ├── types.ts      # Shared TypeScript interfaces
│   ├── utils.ts      # Pure formatting helpers
│   ├── inspect.ts    # inspectPath() — file metadata
│   ├── directory.ts  # analyzeDirectory() — recursive traversal
│   ├── explain.ts    # explain() — deterministic explanations
│   ├── render.ts     # render() — terminal output
│   └── cli.ts        # CLI argument handling
├── bin/
│   └── checkthis     # CLI executable
├── tests/            # node:test test suites
├── dist/             # Compiled JavaScript + declarations
├── package.json
├── tsconfig.json
└── README.md
```

- **TypeScript strict mode** — no implicit `any`, strict null checks
- **ESM** — `"type": "module"` with `exports` map
- **Compiled output** in `dist/` with `.d.ts` declaration files
- **Node.js built-ins only** — `fs/promises`, `path`, `os`
- **Zero runtime dependencies**

## Limitations (v0.1.0)

- No AI or LLM integration (offline-only)
- File contents are not read automatically; content preview is size-bounded
- No configuration file support
- No color output customization beyond `--no-color`
- No JSON output mode
- No watch mode
- No Git integration (no `.gitignore` awareness beyond default exclusions)

## Development

```bash
# Install dependencies
npm install

# Build TypeScript to dist/
npm run build

# Run all tests
npm test

# Type-check without emitting
npx tsc --noEmit

# Validate npm package contents
npm pack --dry-run
```

## License

MIT License. See [LICENSE](./LICENSE) for details.
