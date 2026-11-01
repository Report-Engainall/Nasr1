#!/usr/bin/env node

/**
 * Independent TypeScript AST structural regression budget for the P1-owned files.
 *
 * This is an open-source, reproducible proxy for the original CodeInspector
 * function-length and nesting findings. It is NOT CodeInspector and must never
 * be presented as a replacement for a fresh official CodeInspector scan.
 *
 * Metrics:
 * - Function span: physical source lines from function-like node start to end.
 * - Control-flow depth: nested if/switch/loops/try/catch/conditional expressions
 *   within one function body. Nested functions are measured independently.
 *
 * The original CodeInspector report did not expose its parser implementation.
 * The proxy therefore states its measurement semantics explicitly and keeps
 * separate evidence for review instead of claiming rule-engine equivalence.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import ts from "typescript";

const TARGET_FILES = [
  "e2e/helpers/customer-orders-keyboard-test.ts",
  "e2e/storefront-price-visibility.spec.ts",
  "e2e/critical-path.spec.ts",
  "src/test/ai-gateway-logic.test.ts",
  "src/test/password-reset-route-security.test.ts",
];

const MAX_CRITICAL_PATH_FUNCTION_LINES = 80;
const MAX_CONTROL_FLOW_DEPTH = 5;

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

function functionLabel(node, sourceFile) {
  if (node.name && ts.isIdentifier(node.name)) {
    return node.name.text;
  }

  const parent = node.parent;
  if (
    parent &&
    (ts.isVariableDeclaration(parent) ||
      ts.isPropertyAssignment(parent) ||
      ts.isPropertyDeclaration(parent) ||
      ts.isMethodDeclaration(parent))
  ) {
    if (parent.name) return parent.name.getText(sourceFile);
  }

  return ts.SyntaxKind[node.kind];
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

function getFunctionStats(sourceFile) {
  const functions = [];

  function visit(node) {
    if (isFunctionLike(node)) {
      const start = lineOf(sourceFile, node.getStart(sourceFile));
      const end = lineOf(sourceFile, node.end);
      const body = node.body;
      const bodyStart = body ? lineOf(sourceFile, body.getStart(sourceFile)) : start;
      const bodyEnd = body ? lineOf(sourceFile, body.end) : end;
      let maximumDepth = 0;
      let maximumDepthLine = start;

      function visitControlFlow(child, depth) {
        if (child !== node && isFunctionLike(child)) return;

        const isControlFlow = CONTROL_FLOW_KINDS.has(child.kind);
        const nextDepth = isControlFlow ? depth + 1 : depth;

        if (nextDepth > maximumDepth) {
          maximumDepth = nextDepth;
          maximumDepthLine = lineOf(sourceFile, child.getStart(sourceFile));
        }

        ts.forEachChild(child, (grandchild) => visitControlFlow(grandchild, nextDepth));
      }

      if (body) visitControlFlow(body, 0);

      functions.push({
        name: functionLabel(node, sourceFile),
        line: start,
        functionLines: end - start + 1,
        bodyLines: bodyEnd - bodyStart + 1,
        maximumDepth,
        maximumDepthLine,
      });
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return functions;
}

let failures = 0;
const summaries = [];

for (const relativePath of TARGET_FILES) {
  const absolutePath = resolve(process.cwd(), relativePath);
  let source;

  try {
    source = readFileSync(absolutePath, "utf8");
  } catch (error) {
    console.error(`FAIL missing target file: ${relativePath}: ${error.message}`);
    failures += 1;
    continue;
  }

  const scriptKind = relativePath.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(
    relativePath,
    source,
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  );

  if (sourceFile.parseDiagnostics.length > 0) {
    for (const diagnostic of sourceFile.parseDiagnostics) {
      const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n");
      const line = diagnostic.start === undefined ? "?" : lineOf(sourceFile, diagnostic.start);
      console.error(`FAIL parse ${relativePath}:${line}: ${message}`);
      failures += 1;
    }
    continue;
  }

  const functions = getFunctionStats(sourceFile);
  const longest = functions.reduce(
    (best, current) => (current.functionLines > best.functionLines ? current : best),
    { name: "(none)", line: 0, functionLines: 0, bodyLines: 0, maximumDepth: 0, maximumDepthLine: 0 },
  );
  const deepest = functions.reduce(
    (best, current) => (current.maximumDepth > best.maximumDepth ? current : best),
    { name: "(none)", line: 0, functionLines: 0, bodyLines: 0, maximumDepth: 0, maximumDepthLine: 0 },
  );

  const summary = {
    file: relativePath,
    functions: functions.length,
    maxFunctionLines: longest.functionLines,
    longestFunction: longest.name,
    longestFunctionLine: longest.line,
    maxControlFlowDepth: deepest.maximumDepth,
    deepestFunction: deepest.name,
    deepestFunctionLine: deepest.line,
    deepestPointLine: deepest.maximumDepthLine,
  };
  summaries.push(summary);

  console.log(
    `[P1 AST structural proxy] ${relativePath}: functions=${summary.functions}, ` +
      `maxFunctionLines=${summary.maxFunctionLines} (${summary.longestFunction}@${summary.longestFunctionLine}), ` +
      `maxControlFlowDepth=${summary.maxControlFlowDepth} (${summary.deepestFunction}@${summary.deepestFunctionLine}:${summary.deepestPointLine})`,
  );

  if (relativePath === "e2e/critical-path.spec.ts" &&
      summary.maxFunctionLines > MAX_CRITICAL_PATH_FUNCTION_LINES) {
    console.error(
      `FAIL TS0002 proxy: critical-path function block ${summary.maxFunctionLines} > ${MAX_CRITICAL_PATH_FUNCTION_LINES} lines`,
    );
    failures += 1;
  }

  if (summary.maxControlFlowDepth > MAX_CONTROL_FLOW_DEPTH) {
    console.error(
      `FAIL TS0003 proxy: ${relativePath} control-flow depth ${summary.maxControlFlowDepth} > ${MAX_CONTROL_FLOW_DEPTH}`,
    );
    failures += 1;
  }
}

if (summaries.length !== TARGET_FILES.length) {
  console.error(
    `FAIL: expected ${TARGET_FILES.length} P1 source files, parsed ${summaries.length}`,
  );
  failures += 1;
}

if (failures > 0) {
  console.error(`P1 AST structural proxy: FAIL (${failures} issue(s)).`);
  process.exitCode = 1;
} else {
  console.log(
    "P1 AST structural proxy: PASS. This is supplemental TypeScript AST evidence only; " +
      "official CodeInspector verification remains separate.",
  );
}
