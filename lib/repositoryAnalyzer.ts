export type DependencyUsage = {
  file: string;
  line: number;
};

export type ExternalDependency = {
  name: string;
  declaredIn: string[];
  usedBy: DependencyUsage[];
};

export type InternalDependency = {
  file: string;
  imports: string[];
};

export type FileImportItem = {
  moduleName: string;
  importedNames: string[];
  resolvedPath: string | null;
  isExternal: boolean;
  line: number;
};

export type GraphNode = {
  id: string;
  label: string;
  folder: string;
  language: string;
  inDegree: number;
  outDegree: number;
  importedBy: string[];
  imports: string[];
  importDetails: FileImportItem[];
};

export type GraphEdge = {
  source: string;
  target: string;
};

export type DependencyGraphData = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  cycles: string[][];
  highImpactFiles: GraphNode[];
};

export type RepositoryAnalysis = {
  totalFiles: number;
  languages: string[];
  frameworks: string[];
  importantFiles: string[];
  externalDependencies: ExternalDependency[];
  dependencies: InternalDependency[];
  graph: DependencyGraphData;
};

const languageMap: Record<string, string> = {
  ".ts": "TypeScript",
  ".tsx": "TypeScript",
  ".js": "JavaScript",
  ".jsx": "JavaScript",
  ".py": "Python",
  ".java": "Java",
  ".cpp": "C++",
  ".c": "C",
  ".go": "Go",
  ".rs": "Rust",
  ".php": "PHP",
  ".html": "HTML",
  ".css": "CSS",
  ".scss": "SCSS",
  ".json": "JSON",
  ".sql": "SQL",
};

const frameworkPackages: Record<string, string> = {
  next: "Next.js",
  react: "React",
  express: "Express",
  vue: "Vue",
  svelte: "Svelte",
  "@angular/core": "Angular",
  django: "Django",
  fastapi: "FastAPI",
  flask: "Flask",
  tailwindcss: "Tailwind CSS",
};

const importantFileNames = [
  "package.json",
  "tsconfig.json",
  "next.config.js",
  "next.config.ts",
  "next.config.mjs",
  "requirements.txt",
  "pyproject.toml",
  "Cargo.toml",
  "go.mod",
  "pom.xml",
  "Dockerfile",
  ".gitignore",
];

const pythonStandardLibrary = new Set([
  "abc", "argparse", "asyncio", "base64", "collections", "contextlib",
  "copy", "csv", "dataclasses", "datetime", "decimal", "email", "enum",
  "functools", "hashlib", "http", "importlib", "inspect", "io",
  "itertools", "json", "logging", "math", "numbers", "operator", "os",
  "pathlib", "pickle", "platform", "random", "re", "shutil", "signal",
  "socket", "sqlite3", "statistics", "string", "subprocess", "sys",
  "tempfile", "textwrap", "threading", "time", "traceback", "types",
  "typing", "unittest", "urllib", "uuid", "warnings", "weakref", "xml",
  "zipfile",
]);

const pythonImportAliases: Record<string, string> = {
  PIL: "pillow",
  cv2: "opencv-python",
  yaml: "pyyaml",
  sklearn: "scikit-learn",
  bs4: "beautifulsoup4",
};

const nodeBuiltins = new Set([
  "assert", "buffer", "child_process", "crypto", "events",
  "fs", "http", "https", "os", "path", "process",
  "stream", "url", "util", "zlib", "timers",
]);

function getExtension(filename: string) {
  const dotIndex = filename.lastIndexOf(".");
  return dotIndex >= 0 ? filename.slice(dotIndex).toLowerCase() : "";
}

function normalizePackageName(name: string) {
  return name.toLowerCase().replace(/[-_.]+/g, "-");
}

function getPackageName(importName: string) {
  const parts = importName.split(".");
  return pythonImportAliases[parts[0]] || parts[0];
}

function parseJsImportedSymbols(clause: string): string[] {
  const cleaned = clause.replace(/\btype\b/g, "").trim();
  if (!cleaned) return [];

  const symbols: string[] = [];

  // Named imports: { Foo, Bar as Baz }
  const braceMatch = cleaned.match(/\{([\s\S]*?)\}/);
  if (braceMatch) {
    braceMatch[1]
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .forEach((item) => {
        const parts = item.split(/\s+as\s+/);
        symbols.push((parts[1] || parts[0]).trim());
      });
  }

  // Namespace import: * as Foo
  const nsMatch = cleaned.match(/\*\s+as\s+([A-Za-z_$][\w$]*)/);
  if (nsMatch) {
    symbols.push(nsMatch[1]);
  }

  // Default import: Foo or Foo, { Bar }
  const withoutBraces = cleaned
    .replace(/\{[\s\S]*?\}/g, "")
    .replace(/\*\s+as\s+[A-Za-z_$][\w$]*/g, "")
    .replace(/,/g, "")
    .trim();

  if (withoutBraces && /^[A-Za-z_$][\w$]*$/.test(withoutBraces)) {
    symbols.unshift(withoutBraces);
  }

  return symbols;
}

function matchJsTsFile(resolvedBase: string, availableSet: Set<string>): string | null {
  const possiblePaths = [
    resolvedBase,
    ...[".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs"].map(
      (ext) => resolvedBase + ext
    ),
    ...["index.ts", "index.tsx", "index.js", "index.jsx"].map(
      (filename) => `${resolvedBase}/${filename}`
    ),
  ];

  return possiblePaths.find((candidate) => availableSet.has(candidate)) ?? null;
}

function resolveJsTsImport(
  importerPath: string,
  specifier: string,
  availableSet: Set<string>,
  repoRootPrefix: string
): string | null {
  if (specifier.startsWith("@/")) {
    const cleanAlias = specifier.slice(2);
    const rootParts = repoRootPrefix ? [repoRootPrefix] : [];
    const candidates = [
      [...rootParts, cleanAlias].join("/"),
      [...rootParts, "src", cleanAlias].join("/"),
    ];

    for (const candidate of candidates) {
      const resolved = matchJsTsFile(candidate, availableSet);
      if (resolved) return resolved;
    }
    return null;
  }

  if (!specifier.startsWith(".")) return null;

  const baseParts = importerPath.split("/").slice(0, -1);
  for (const part of specifier.split("/")) {
    if (part === "." || part === "") continue;
    if (part === "..") {
      baseParts.pop();
    } else {
      baseParts.push(part);
    }
  }

  return matchJsTsFile(baseParts.join("/"), availableSet);
}

function resolvePythonImport(
  importerPath: string,
  rawModule: string,
  importedNames: string[],
  availableSet: Set<string>,
  repoRootPrefix: string
): string[] {
  const resolved = new Set<string>();

  const tryModulePath = (baseParts: string[]) => {
    const joined = baseParts.filter(Boolean).join("/");
    if (!joined) return;
    const candidates = [`${joined}.py`, `${joined}/__init__.py`];
    for (const candidate of candidates) {
      if (availableSet.has(candidate) && candidate !== importerPath) {
        resolved.add(candidate);
      }
    }
  };

  if (rawModule.startsWith(".")) {
    const dotMatch = rawModule.match(/^(\.+)(.*)$/);
    if (!dotMatch) return [];

    const dots = dotMatch[1].length;
    const remainder = dotMatch[2];
    const dirParts = importerPath.split("/").slice(0, -1);

    for (let i = 1; i < dots; i++) {
      dirParts.pop();
    }

    const modParts = remainder ? remainder.split(".").filter(Boolean) : [];
    const targetBase = [...dirParts, ...modParts];
    tryModulePath(targetBase);

    for (const name of importedNames) {
      const cleanName = name.trim().split(/\s+as\s+/)[0]?.trim();
      if (cleanName && cleanName !== "*") {
        tryModulePath([...targetBase, cleanName]);
      }
    }
  } else {
    const modParts = rawModule.split(".").filter(Boolean);
    const prefixes = repoRootPrefix ? [[repoRootPrefix], []] : [[]];

    for (const prefix of prefixes) {
      tryModulePath([...prefix, ...modParts]);
      for (const name of importedNames) {
        const cleanName = name.trim().split(/\s+as\s+/)[0]?.trim();
        if (cleanName && cleanName !== "*") {
          tryModulePath([...prefix, ...modParts, cleanName]);
        }
      }
    }
  }

  return Array.from(resolved);
}

function detectCycles(adjacency: Map<string, string[]>): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const stack = new Set<string>();
  const path: string[] = [];

  function dfs(node: string) {
    visited.add(node);
    stack.add(node);
    path.push(node);

    for (const neighbor of adjacency.get(node) ?? []) {
      if (!visited.has(neighbor)) {
        dfs(neighbor);
      } else if (stack.has(neighbor)) {
        const startIdx = path.indexOf(neighbor);
        if (startIdx !== -1 && cycles.length < 15) {
          cycles.push([...path.slice(startIdx), neighbor]);
        }
      }
    }

    path.pop();
    stack.delete(node);
  }

  for (const node of adjacency.keys()) {
    if (!visited.has(node)) {
      dfs(node);
    }
  }

  return cycles;
}

export async function analyzeRepository(
  files: File[]
): Promise<RepositoryAnalysis> {
  const languages = new Set<string>();
  const frameworks = new Set<string>();
  const importantFiles = new Set<string>();

  const fileContents = new Map<string, string>();
  const fileLanguages = new Map<string, string>();

  const externalPackages = new Map<
    string,
    {
      name: string;
      declaredIn: Set<string>;
      usedBy: Map<string, Set<number>>;
    }
  >();

  // STEP 1: Read repository files.
  for (const file of files) {
    const path = file.webkitRelativePath || file.name;
    const extension = getExtension(file.name);
    const filename = path.split("/").pop() || file.name;
    const lang = languageMap[extension] || "Other";

    if (languageMap[extension]) {
      languages.add(languageMap[extension]);
    }
    fileLanguages.set(path, lang);

    if (importantFileNames.includes(filename)) {
      importantFiles.add(path);
    }

    try {
      const content = await file.text();
      fileContents.set(path, content);
    } catch {
      // Skip binary or unreadable files.
    }
  }

  const availablePaths = Array.from(fileContents.keys());
  const availableSet = new Set(availablePaths);

  const firstParts = new Set(
    availablePaths
      .filter((p) => p.includes("/"))
      .map((p) => p.split("/")[0])
  );
  const repoRootPrefix = firstParts.size === 1 ? Array.from(firstParts)[0] : "";

  const internalPythonRoots = new Set<string>();
  for (const p of availablePaths) {
    const parts = p.split("/");
    const withoutRoot = repoRootPrefix && parts[0] === repoRootPrefix ? parts.slice(1) : parts;
    if (withoutRoot.length > 0) {
      const top = withoutRoot[0].replace(/\.py$/, "");
      if (top) internalPythonRoots.add(top);
    }
    if (repoRootPrefix) internalPythonRoots.add(repoRootPrefix);
  }

  function addExternalPackage(
    name: string,
    declaredIn?: string,
    usedBy?: DependencyUsage
  ) {
    const key = normalizePackageName(name);
    if (!key) return;

    if (!externalPackages.has(key)) {
      externalPackages.set(key, {
        name,
        declaredIn: new Set<string>(),
        usedBy: new Map<string, Set<number>>(),
      });
    }

    const dependency = externalPackages.get(key)!;
    if (declaredIn) dependency.declaredIn.add(declaredIn);
    if (usedBy) {
      if (!dependency.usedBy.has(usedBy.file)) {
        dependency.usedBy.set(usedBy.file, new Set<number>());
      }
      dependency.usedBy.get(usedBy.file)!.add(usedBy.line);
    }
  }

  // STEP 2: Read package.json dependencies.
  for (const [path, content] of fileContents) {
    if (path.split("/").pop() !== "package.json") continue;
    try {
      const packageData = JSON.parse(content);
      const sections = [
        "dependencies",
        "devDependencies",
        "peerDependencies",
        "optionalDependencies",
      ];
      for (const section of sections) {
        const packages = packageData[section] || {};
        Object.keys(packages).forEach((name) => addExternalPackage(name, path));
      }
    } catch {
      // Ignore invalid package.json.
    }
  }

  // STEP 3: Read Python requirements.txt files.
  for (const [path, content] of fileContents) {
    if (path.split("/").pop() !== "requirements.txt") continue;
    for (const line of content.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("-")) continue;
      const match = trimmed.match(
        /^([A-Za-z0-9_.-]+)(?:\[[^\]]+\])?\s*(?:[<>=!~;].*)?$/
      );
      if (match) addExternalPackage(match[1], path);
    }
  }

  // STEP 4: Read PEP 621 dependencies from pyproject.toml.
  for (const [path, content] of fileContents) {
    if (path.split("/").pop() !== "pyproject.toml") continue;
    const dependencySection = content.match(
      /\[project\][\s\S]*?dependencies\s*=\s*\[([\s\S]*?)\]/
    );
    if (dependencySection) {
      const matches = dependencySection[1].matchAll(/["']\s*([A-Za-z0-9_.-]+)/g);
      for (const match of matches) addExternalPackage(match[1], path);
    }
  }

  // STEP 5: Detect internal and external source imports + exact imported "This" symbols.
  const internalDependencies: InternalDependency[] = [];
  const adjacency = new Map<string, string[]>();
  const reverseAdjacency = new Map<string, Set<string>>();
  const fileImportDetailsMap = new Map<string, FileImportItem[]>();

  const codeFilePaths = availablePaths.filter((p) =>
    /\.(py|[cm]?[jt]sx?|go|rs|java)$/.test(p)
  );
  for (const p of codeFilePaths) {
    adjacency.set(p, []);
    reverseAdjacency.set(p, new Set());
    fileImportDetailsMap.set(p, []);
  }

  const jsImportStatementPattern =
    /(?:import|export)\s+([\s\S]*?)\s+from\s+(['"])([^'"]+)\2|require\s*\(\s*(['"])([^'"]+)\4\s*\)/g;

  const pythonFromPattern =
    /^\s*from\s+(\.+[A-Za-z0-9_.]*|[A-Za-z_][\w.]*)\s+import\s+\(?([^)\n]+)\)?/gm;

  const pythonImportStmtPattern =
    /^\s*import\s+([A-Za-z_][\w.]*(?:\s+as\s+[A-Za-z_]\w*)?(?:\s*,\s*[A-Za-z_][\w.]*(?:\s+as\s+[A-Za-z_]\w*)?)*)/gm;

  for (const [filePath, content] of fileContents) {
    const internalImports = new Set<string>();
    const details: FileImportItem[] = [];

    // JavaScript / TypeScript imports
    if (/\.[cm]?[jt]sx?$/.test(filePath)) {
      for (const match of content.matchAll(jsImportStatementPattern)) {
        const clause = match[1] || "";
        const specifier = match[3] || match[5] || "";
        if (!specifier) continue;

        const line = content.slice(0, match.index ?? 0).split(/\r?\n/).length;
        const symbols = parseJsImportedSymbols(clause);
        const fallbackName = specifier.split("/").pop()?.replace(/\.[^.]+$/, "") || specifier;
        const importedNames = symbols.length > 0 ? symbols : [fallbackName];

        const resolvedInternal = resolveJsTsImport(
          filePath,
          specifier,
          availableSet,
          repoRootPrefix
        );

        if (resolvedInternal && resolvedInternal !== filePath) {
          internalImports.add(resolvedInternal);
          details.push({
            moduleName: specifier,
            importedNames,
            resolvedPath: resolvedInternal,
            isExternal: false,
            line,
          });
        } else if (!specifier.startsWith(".") && !specifier.startsWith("@/") && !specifier.startsWith("node:")) {
          const packageName = specifier.startsWith("@")
            ? specifier.split("/").slice(0, 2).join("/")
            : specifier.split("/")[0];

          if (packageName && !nodeBuiltins.has(packageName)) {
            addExternalPackage(packageName, undefined, { file: filePath, line });
            details.push({
              moduleName: specifier,
              importedNames,
              resolvedPath: null,
              isExternal: true,
              line,
            });
          }
        }
      }
    }

    // Python imports (`from X import This` and `import This`)
    if (filePath.endsWith(".py")) {
      for (const match of content.matchAll(pythonFromPattern)) {
        const rawModule = match[1];
        const rawItems = match[2]
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean);

        const cleanImportedNames = rawItems.map((item) => {
          const parts = item.split(/\s+as\s+/);
          return (parts[1] || parts[0]).trim();
        });

        const line = content.slice(0, match.index ?? 0).split(/\r?\n/).length;
        const resolvedInternal = resolvePythonImport(
          filePath,
          rawModule,
          rawItems,
          availableSet,
          repoRootPrefix
        );

        if (resolvedInternal.length > 0) {
          resolvedInternal.forEach((target) => internalImports.add(target));
          details.push({
            moduleName: rawModule,
            importedNames: cleanImportedNames,
            resolvedPath: resolvedInternal[0],
            isExternal: false,
            line,
          });
        } else if (!rawModule.startsWith(".")) {
          const rootName = rawModule.split(".")[0];
          const isStdOrPrivate =
            pythonStandardLibrary.has(rootName) ||
            rootName.startsWith("_") ||
            internalPythonRoots.has(rootName);

          if (!isStdOrPrivate) {
            addExternalPackage(getPackageName(rawModule), undefined, {
              file: filePath,
              line,
            });
          }

          details.push({
            moduleName: rawModule,
            importedNames: cleanImportedNames,
            resolvedPath: null,
            isExternal: !isStdOrPrivate,
            line,
          });
        }
      }

      for (const match of content.matchAll(pythonImportStmtPattern)) {
        const line = content.slice(0, match.index ?? 0).split(/\r?\n/).length;
        const modules = match[1]
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean);

        for (const item of modules) {
          const [rawModule, alias] = item.split(/\s+as\s+/).map((s) => s.trim());
          const displaySymbol = alias || rawModule.split(".").pop() || rawModule;

          const resolvedInternal = resolvePythonImport(
            filePath,
            rawModule,
            [],
            availableSet,
            repoRootPrefix
          );

          if (resolvedInternal.length > 0) {
            resolvedInternal.forEach((target) => internalImports.add(target));
            details.push({
              moduleName: rawModule,
              importedNames: [displaySymbol],
              resolvedPath: resolvedInternal[0],
              isExternal: false,
              line,
            });
          } else {
            const rootName = rawModule.split(".")[0];
            const isStdOrPrivate =
              pythonStandardLibrary.has(rootName) ||
              rootName.startsWith("_") ||
              internalPythonRoots.has(rootName);

            if (!isStdOrPrivate) {
              addExternalPackage(getPackageName(rawModule), undefined, {
                file: filePath,
                line,
              });
            }

            details.push({
              moduleName: rawModule,
              importedNames: [displaySymbol],
              resolvedPath: null,
              isExternal: !isStdOrPrivate,
              line,
            });
          }
        }
      }
    }

    const sortedImports = Array.from(internalImports).sort();
    if (sortedImports.length > 0) {
      internalDependencies.push({
        file: filePath,
        imports: sortedImports,
      });
    }

    if (fileImportDetailsMap.has(filePath)) {
      fileImportDetailsMap.set(
        filePath,
        details.sort((a, b) => a.line - b.line)
      );
    }

    if (adjacency.has(filePath)) {
      adjacency.set(filePath, sortedImports);
      for (const target of sortedImports) {
        if (!reverseAdjacency.has(target)) {
          reverseAdjacency.set(target, new Set());
        }
        reverseAdjacency.get(target)!.add(filePath);
      }
    }
  }

  // STEP 6: Detect frameworks.
  for (const packageName of Object.keys(frameworkPackages)) {
    if (externalPackages.has(normalizePackageName(packageName))) {
      frameworks.add(frameworkPackages[packageName]);
    }
  }

  // STEP 7: Build Graph Nodes, Edges, Cycles & High-Impact Ranking.
  const edges: GraphEdge[] = [];
  const nodes: GraphNode[] = codeFilePaths.map((filePath) => {
    const imports = adjacency.get(filePath) ?? [];
    const importedBy = Array.from(reverseAdjacency.get(filePath) ?? []).sort();
    const parts = filePath.split("/");
    const label = parts.at(-1) || filePath;
    const folder = parts.length > 1 ? parts.slice(0, -1).join("/") : "(root)";

    for (const target of imports) {
      edges.push({ source: filePath, target });
    }

    return {
      id: filePath,
      label,
      folder,
      language: fileLanguages.get(filePath) || "Other",
      inDegree: importedBy.length,
      outDegree: imports.length,
      importedBy,
      imports,
      importDetails: fileImportDetailsMap.get(filePath) ?? [],
    };
  });

  const cycles = detectCycles(adjacency);
  const highImpactFiles = [...nodes]
    .filter((node) => node.inDegree > 0)
    .sort((a, b) => b.inDegree - a.inDegree || b.outDegree - a.outDegree)
    .slice(0, 6);

  // STEP 8: Prepare final external dependency results.
  const externalDependencies: ExternalDependency[] = Array.from(
    externalPackages.values()
  )
    .map((dependency) => ({
      name: dependency.name,
      declaredIn: Array.from(dependency.declaredIn),
      usedBy: Array.from(dependency.usedBy.entries()).flatMap(
        ([file, lines]) =>
          Array.from(lines).map((line) => ({
            file,
            line,
          }))
      ),
    }))
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    totalFiles: files.length,
    languages: Array.from(languages).sort(),
    frameworks: Array.from(frameworks).sort(),
    importantFiles: Array.from(importantFiles).sort(),
    externalDependencies,
    dependencies: internalDependencies,
    graph: {
      nodes,
      edges,
      cycles,
      highImpactFiles,
    },
  };
}