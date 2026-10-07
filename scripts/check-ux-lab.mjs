import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

// Dependency-free, deliberately scoped lint for the development-only prototype.
// This is not a repository-wide ESLint replacement.
const root = path.resolve(import.meta.dirname, "..");
const dir = path.join(root, "apps/web/src/ux-lab");
const files = readdirSync(dir).filter((file) => /\.tsx?$/.test(file) && !file.endsWith(".test.ts"));
const errors = [];
for (const file of files) {
  const source = readFileSync(path.join(dir, file), "utf8");
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  function visit(node) {
    if (node.kind === ts.SyntaxKind.AnyKeyword) errors.push(`${file}: explicit any`);
    if (ts.isImportDeclaration(node)) {
      const specifier = node.moduleSpecifier.text;
      if (!specifier.startsWith("./") && !["react", "react-dom/client", "react-router-dom", "../components/Icon", "../components/layout/TopNavigation"].includes(specifier)) errors.push(`${file}: import outside isolated lab: ${specifier}`);
    }
    if (ts.isIdentifier(node) && ["fetch", "XMLHttpRequest", "WebSocket", "supabase", "localStorage", "sessionStorage"].includes(node.text)) errors.push(`${file}: forbidden network/persistence access: ${node.text}`);
    if (ts.isPropertyAccessExpression(node) && node.name.text === "sendBeacon") errors.push(`${file}: forbidden network access`);
    ts.forEachChild(node, visit);
  }
  visit(tree);
  if (/\beval\s*\(|dangerouslySetInnerHTML|@ts-ignore|@ts-nocheck/.test(source)) errors.push(`${file}: unsafe escape hatch`);
}
const main = readFileSync(path.join(root, "apps/web/src/main.tsx"), "utf8");
if (!main.includes('if (import.meta.env.DEV && /^\\/ux-lab(?:\\/|$)/.test(window.location.pathname))')) errors.push("main.tsx: development-only route guard changed");
const program = ts.createProgram(files.map((file) => path.join(dir, file)), { noEmit: true, strict: true, noUncheckedIndexedAccess: true, noUnusedLocals: true, noUnusedParameters: true, skipLibCheck: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, moduleResolution: ts.ModuleResolutionKind.Bundler, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, allowImportingTsExtensions: true });
for (const diagnostic of ts.getPreEmitDiagnostics(program)) errors.push(ts.flattenDiagnosticMessageText(diagnostic.messageText, "\n"));
if (errors.length) { console.error(errors.join("\n")); process.exitCode = 1; }
else console.log(`UX Lab scoped lint PASS: ${files.length} files, strict unused checks, isolated imports, no network or persistence.`);
