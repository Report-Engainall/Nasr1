#!/usr/bin/env node

/**
 * Free, reproducible TypeScript control-flow depth audit for active Nasr1 code.
 *
 * This uses the TypeScript compiler AST and intentionally documents its own
 * semantics. It is a useful independent structural signal, not CodeInspector
 * and not evidence that a CodeInspector finding is closed.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { relative, resolve, sep } from "node:path";
import ts from "typescript";

const MAX_CONTROL_FLOW_DEPTH = 5;
const INCLUDED_ROOTS = ["src/", "supabase/", "e2e/", "scripts/"];
const EXCLUDED_PATH_PARTS = [
  "node_modules/",
  "dist/",
  "build/",
  "coverage/",
  ".vercel/",
  "docs/bolt-source-reconciliation/READY_TO_REUSE/",
];

const CONTROL_FLOW_KINDS = new Set([
  ts.SyntaxKind.IfStatement,
  ts.SyntaxKind.SwitchStatement,
  ts.SyntaxKind.ForStatement,
  ts.SyntaxKind.ForInStatement,
  ts.SyntaxKind.ForOfStatement,
  ts.SyntaxKind.WhileStatement,
  ts.SyntaxKind.DoStatement,
  ts.SyntaxKind.TryStatement,
  ts.SyntaxKind.CatchClause,
  ts.SyntaxKind.ConditionalExpression,
]);

function lineOf(sourceFile, position) {
  return sourceFile.getLineAndCharacterOfPosition(position).line + 1;
}

function isFunctionLike(node) {
  return (
    ts.isFunctionDeclaration(node) ||
    ts.isFunctionExpression(node) ||
    ts.isArrowFunction(node) ||
    ts.isMethodDeclaration(node) ||
    ts.isConstructorDeclaration(node) ||
    ts.isGetAccessorDeclaration(node) ||
    ts.isSetAccessorDeclaration(node)
  );
}

function functionLabel(node, sourceFile) {
  if (node.name && ts.isIdentifier(node.name)) return node.name.text;

  const parent = node.parent;
  if (
    parent &&
    (ts.isVariableDeclaration(parent) ||
      ts.isPropertyAssignment(parent) ||
      ts.isPropertyDeclaration(parent) ||
      ts.isMethodDeclaration(parent)) &&
    parent.name
  ) {
    return parent.name.getText(sourceFile);
  }

  return ts.SyntaxKind[node.kind] ?? "anonymous";
}

function measureFunction(node, sourceFile, file) {
  const startLine = lineOf(sourceFile, node.getStart(sourceFile));
  const endLine = lineOf(sourceFile, node.end);
  let maximumDepth = 0;
  let maximumDepthLine = startLine;

  function visitControlFlow(child, depth) {
    if (child !== node && isFunctionLike(child)) return;

    const nextDepth = CONTROL_FLOW_KINDS.has(child.kind) ? depth + 1 : depth;
    if (nextDepth > maximumDepth) {
      maximumDepth = nextDepth;
      maximumDepthLine = lineOf(sourceFile, child.getStart(sourceFile));
    }

    ts.forEachChild(child, (grandchild) => visitControlFlow(grandchild, nextDepth));
  }

  if (node.body) visitControlFlow(node.body, 0);

  return {
    file,
    functionName: functionLabel(node, sourceFile),
    startLine,
    endLine,
    functionLines: endLine - startLine + 1,
    maximumDepth,
    maximumDepthLine,
  };
}

function shouldAnalyze(file) {
  if (!/\.tsx?$/.test(file)) return false;
  if (!INCLUDED_ROOTS.some((root) => file.startsWith(root))) return false;
  return !EXCLUDED_PATH_PARTS.some((excluded) => file.includes(excluded));
}

function listTrackedTypeScriptFiles() {
  const output = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" });
  return output
    .split("\0")
    .filter(Boolean)
    .map((file) => file.split(sep).join("/"))
    .filter(shouldAnalyze)
    .sort();
}

const sourceSha = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const files = listTrackedTypeScriptFiles();
const findings = [];
const parseErrors = [];
let parsedFiles = 0;
let functionCount = 0;

for (const file of files) {
  const absolutePath = resolve(process.cwd(), file);
  let source;

  try {
    source = readFileSync(absolutePath, "utf8");
  } catch (error) {
    parseErrors.push({ file, error: `read failed: ${error.message}` });
    continue;
  }

  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
  );

  if (sourceFile.parseDiagnostics.length > 0) {
    for (const diagnostic of sourceFile.parseDiagnostics) {
      parseErrors.push({
        file,
        line: diagnostic.start === undefined ? null : lineOf(sourceFile, diagnostic.start),
        error: ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"),
      });
    }
    continue;
  }

  parsedFiles += 1;

  function visit(node) {
    if (isFunctionLike(node)) {
      functionCount += 1;
      const metric = measureFunction(node, sourceFile, file);
      if (metric.maximumDepth > MAX_CONTROL_FLOW_DEPTH) findings.push(metric);
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

findings.sort((a, b) =>
  b.maximumDepth - a.maximumDepth ||
  a.file.localeCompare(b.file) ||
  a.startLine - b.startLine
);

const report = {
  scanner: "Nasr1 TypeScript AST structural proxy",
  scannerVersion: 1,
  sourceSha,
  generatedAt: new Date().toISOString(),
  semantics: {
    maximumControlFlowDepth: MAX_CONTROL_FLOW_DEPTH,
    countedNodes: [...CONTROL_FLOW_KINDS].map((kind) => ts.SyntaxKind[kind]),
    nestedFunctions: "Measured independently; a parent function does not include nested-function bodies.",
    scope: INCLUDED_ROOTS,
    excluded: EXCLUDED_PATH_PARTS,
    disclaimer: "Supplemental proxy only. Not CodeInspector. Does not close or replace any official scanner finding.",
  },
  totals: {
    trackedTypeScriptFiles: files.length,
    parsedFiles,
    functionsMeasured: functionCount,
    depthViolations: findings.length,
    parseErrors: parseErrors.length,
  },
  findings,
  parseErrors,
};

const outputDir = resolve(process.cwd(), "artifacts/free-static-audit");
mkdirSync(outputDir, { recursive: true });
const jsonPath = resolve(outputDir, "typescript-structural-proxy.json");
const markdownPath = resolve(outputDir, "typescript-structural-proxy.md");
writeFileSync(jsonPath, JSON.stringify(report, null, 2) + "\n", "utf8");

const markdown = [
  "# Nasr1 TypeScript Structural Proxy Audit",
  "",
  `- Source SHA: \`${sourceSha}\``,
  `- Generated: ${report.generatedAt}`,
  `- Tracked TypeScript files: ${files.length}`,
  `- Parsed files: ${parsedFiles}`,
  `- Functions measured: ${functionCount}`,
  `- Control-flow depth violations (> ${MAX_CONTROL_FLOW_DEPTH}): ${findings.length}`,
  `- Parse/read errors: ${parseErrors.length}`,
  "",
  "> Supplemental TypeScript AST proxy only. This is not CodeInspector and does not close official findings.",
  "",
  "## Findings",
  "",
  "| File | Function | Start line | Depth | Depth line | Function lines |",
  "|---|---|---:|---:|---:|---:|",
  ...findings.map((item) =>
    `| ${item.file} | ${item.functionName.replaceAll("|", "\\|")} | ${item.startLine} | ${item.maximumDepth} | ${item.maximumDepthLine} | ${item.functionLines} |`
  ),
  "",
  "## Parse / Read Errors",
  "",
  ...parseErrors.map((item) =>
    `- ${item.file}${item.line ? ":" + item.line : ""}: ${item.error}`
  ),
  "",
].join("\n");
writeFileSync(markdownPath, markdown, "utf8");

console.log(JSON.stringify(report.totals, null, 2));
console.log(`JSON: ${relative(process.cwd(), jsonPath)}`);
console.log(`Markdown: ${relative(process.cwd(), markdownPath)}`);

if (parseErrors.length > 0) {
  console.error("Structural proxy could not parse/read every tracked file.");
  process.exitCode = 1;
}
