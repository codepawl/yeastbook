// AST-based cell code transformation using acorn-loose + magic-string
// Replaces the previous regex-based approach for correctness.

import { parse } from "acorn-loose";
import MagicString from "magic-string";
import type * as ESTree from "estree";

type AcornNode = ESTree.Node & { start: number; end: number };
type AcornProgram = ESTree.Program & { body: AcornNode[]; start: number; end: number };

// ---------------------------------------------------------------------------
// Binding name extraction (for destructuring patterns)
// ---------------------------------------------------------------------------

function extractBindingNames(pattern: AcornNode | null | undefined, names: string[]): void {
  if (!pattern) return;
  switch (pattern.type) {
    case "Identifier":
      names.push((pattern as ESTree.Identifier).name);
      break;
    case "ObjectPattern":
      for (const prop of (pattern as ESTree.ObjectPattern).properties) {
        if (prop.type === "RestElement") {
          extractBindingNames(prop.argument as AcornNode, names);
        } else {
          extractBindingNames((prop as ESTree.Property).value as AcornNode, names);
        }
      }
      break;
    case "ArrayPattern":
      for (const elem of (pattern as ESTree.ArrayPattern).elements) {
        if (elem) extractBindingNames(elem as AcornNode, names);
      }
      break;
    case "AssignmentPattern":
      extractBindingNames((pattern as ESTree.AssignmentPattern).left as AcornNode, names);
      break;
    case "RestElement":
      extractBindingNames((pattern as ESTree.RestElement).argument as AcornNode, names);
      break;
  }
}

// ---------------------------------------------------------------------------
// Import transformation
// ---------------------------------------------------------------------------

function transformImportNode(s: MagicString, node: AcornNode): void {
  const imp = node as unknown as ESTree.ImportDeclaration & { start: number; end: number };
  const mod = (imp.source as ESTree.Literal).value as string;
  const specs = imp.specifiers || [];

  if (specs.length === 0) {
    // Side-effect: import "mod"
    s.overwrite(imp.start, imp.end, `await import("${mod}")`);
    return;
  }

  // Classify specifiers
  let defaultName: string | null = null;
  let namespaceName: string | null = null;
  const named: string[] = [];

  for (const spec of specs) {
    if (spec.type === "ImportDefaultSpecifier") {
      defaultName = spec.local.name;
    } else if (spec.type === "ImportNamespaceSpecifier") {
      namespaceName = spec.local.name;
    } else if (spec.type === "ImportSpecifier") {
      const imported = spec.imported.type === "Identifier" ? spec.imported.name : (spec.imported as ESTree.Literal).value;
      if (imported === spec.local.name) {
        named.push(spec.local.name);
      } else {
        named.push(`${imported} as ${spec.local.name}`);
      }
    }
  }

  if (namespaceName && !defaultName) {
    // import * as ns from "mod"
    s.overwrite(imp.start, imp.end, `const ${namespaceName} = await import("${mod}")`);
  } else if (defaultName && named.length === 0 && !namespaceName) {
    // import foo from "mod"
    s.overwrite(imp.start, imp.end, `const ${defaultName} = (await import("${mod}")).default`);
  } else if (!defaultName && named.length > 0) {
    // import { a, b } from "mod"
    s.overwrite(imp.start, imp.end, `const { ${named.join(", ")} } = await import("${mod}")`);
  } else if (defaultName && named.length > 0) {
    // import def, { a, b } from "mod"
    s.overwrite(imp.start, imp.end, `const { default: ${defaultName}, ${named.join(", ")} } = await import("${mod}")`);
  } else if (defaultName && namespaceName) {
    // import def, * as ns from "mod"
    s.overwrite(imp.start, imp.end, `const ${namespaceName} = await import("${mod}"); const ${defaultName} = ${namespaceName}.default`);
  }
}

// ---------------------------------------------------------------------------
// Variable hoisting
// ---------------------------------------------------------------------------

function hoistVariableDeclaration(s: MagicString, node: AcornNode, code: string): void {
  const decl = node as unknown as ESTree.VariableDeclaration & { start: number; end: number };
  const kind = decl.kind; // const, let, var

  // Convert const/let → var for cross-cell persistence
  if (kind === "const" || kind === "let") {
    s.overwrite(decl.start, decl.start + kind.length, "var");
  }

  for (const declarator of decl.declarations) {
    const d = declarator as unknown as ESTree.VariableDeclarator & { start: number; end: number };
    const id = d.id as AcornNode;

    if (id.type === "Identifier" && d.init) {
      // Simple: var x = expr  →  var x = globalThis.x = expr
      const name = (id as ESTree.Identifier).name;
      const initNode = d.init as AcornNode;
      s.appendLeft(initNode.start, `globalThis.${name} = `);
    } else if ((id.type === "ObjectPattern" || id.type === "ArrayPattern") && d.init) {
      // Destructuring: var { a, b } = expr  →  var { a, b } = expr; globalThis.a = a; globalThis.b = b
      const names: string[] = [];
      extractBindingNames(id, names);
      if (names.length > 0) {
        const assignments = names.map(n => `globalThis.${n} = ${n}`).join("; ");
        s.appendRight(d.end, `; ${assignments}`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Main transform
// ---------------------------------------------------------------------------

export function transformCellCode(code: string): string {
  if (!code.trim()) {
    return "return (async () => {\n\n})()";
  }

  const ast = parse(code, {
    ecmaVersion: "latest" as any,
    sourceType: "module",
  }) as unknown as AcornProgram;

  const s = new MagicString(code);
  const body = ast.body;
  let lastExprIdx = -1;

  for (let i = 0; i < body.length; i++) {
    const node = body[i]!;

    switch (node.type) {
      case "ImportDeclaration":
        transformImportNode(s, node);
        break;

      case "ExportNamedDeclaration": {
        const exp = node as unknown as ESTree.ExportNamedDeclaration & { start: number; end: number };
        if (exp.declaration) {
          // export const x = 1  →  strip "export " then handle declaration
          const declNode = exp.declaration as AcornNode;
          s.overwrite(node.start, declNode.start, "");
          if (declNode.type === "VariableDeclaration") {
            hoistVariableDeclaration(s, declNode, code);
          } else if (declNode.type === "FunctionDeclaration") {
            const name = (declNode as unknown as ESTree.FunctionDeclaration).id?.name;
            if (name) {
              s.appendRight(declNode.end, `\nglobalThis.${name} = ${name};`);
            }
          } else if (declNode.type === "ClassDeclaration") {
            const name = (declNode as unknown as ESTree.ClassDeclaration).id?.name;
            if (name) {
              s.appendRight(declNode.end, `\nglobalThis.${name} = ${name};`);
            }
          }
        }
        break;
      }

      case "VariableDeclaration":
        hoistVariableDeclaration(s, node, code);
        break;

      case "FunctionDeclaration": {
        const name = (node as unknown as ESTree.FunctionDeclaration).id?.name;
        if (name) {
          s.appendRight(node.end, `\nglobalThis.${name} = ${name};`);
        }
        break;
      }

      case "ClassDeclaration": {
        const name = (node as unknown as ESTree.ClassDeclaration).id?.name;
        if (name) {
          s.appendRight(node.end, `\nglobalThis.${name} = ${name};`);
        }
        break;
      }

      case "ExpressionStatement":
        lastExprIdx = i;
        break;

      // All other statements (if, for, while, try, etc.) — keep as-is
      default:
        break;
    }
  }

  // Return last expression
  if (lastExprIdx >= 0 && lastExprIdx === body.length - 1) {
    const exprStmt = body[lastExprIdx]! as unknown as ESTree.ExpressionStatement & { start: number; end: number };
    const expr = exprStmt.expression as AcornNode;
    // Don't return assignment expressions (x = 1)
    if (expr.type !== "AssignmentExpression" || code.slice(expr.start, expr.end).includes("==")) {
      // Place return at the statement start (not expression start) to handle parens correctly
      s.appendLeft(exprStmt.start, "return (");
      // Remove trailing semicolon if present
      const trailingCode = code.slice(expr.end, exprStmt.end).trim();
      if (trailingCode === ";") {
        s.overwrite(expr.end, exprStmt.end, ")");
      } else {
        s.appendRight(exprStmt.end, ")");
      }
    }
  }

  // Wrap in async IIFE
  s.prepend("return (async () => {\n");
  s.append("\n})()");

  return s.toString();
}

// ---------------------------------------------------------------------------
// Extract new variable names from cell code (used for snapshot/context tracking)
// ---------------------------------------------------------------------------

export function extractNewVars(code: string): string[] {
  if (!code.trim()) return [];

  const ast = parse(code, {
    ecmaVersion: "latest" as any,
    sourceType: "module",
  }) as unknown as AcornProgram;

  const vars: string[] = [];

  for (const node of ast.body) {
    switch (node.type) {
      case "VariableDeclaration":
        for (const decl of (node as unknown as ESTree.VariableDeclaration).declarations) {
          extractBindingNames(decl.id as AcornNode, vars);
        }
        break;
      case "FunctionDeclaration": {
        const name = (node as unknown as ESTree.FunctionDeclaration).id?.name;
        if (name) vars.push(name);
        break;
      }
      case "ClassDeclaration": {
        const name = (node as unknown as ESTree.ClassDeclaration).id?.name;
        if (name) vars.push(name);
        break;
      }
      case "ImportDeclaration":
        for (const spec of (node as unknown as ESTree.ImportDeclaration).specifiers || []) {
          if (spec.local?.name) vars.push(spec.local.name);
        }
        break;
      case "ExportNamedDeclaration": {
        const exp = node as unknown as ESTree.ExportNamedDeclaration;
        if (exp.declaration) {
          if (exp.declaration.type === "VariableDeclaration") {
            for (const decl of exp.declaration.declarations) {
              extractBindingNames(decl.id as AcornNode, vars);
            }
          } else if (exp.declaration.type === "FunctionDeclaration" && exp.declaration.id?.name) {
            vars.push(exp.declaration.id.name);
          } else if (exp.declaration.type === "ClassDeclaration" && exp.declaration.id?.name) {
            vars.push(exp.declaration.id.name);
          }
        }
        break;
      }
    }
  }

  return vars;
}

// Standalone import transformation (used by tests, preserves non-import code as-is)
export function transformImports(code: string): string {
  if (!code.trim()) return code;

  const ast = parse(code, {
    ecmaVersion: "latest" as any,
    sourceType: "module",
  }) as unknown as AcornProgram;

  const s = new MagicString(code);

  for (const node of ast.body) {
    if (node.type === "ImportDeclaration") {
      transformImportNode(s, node);
    }
  }

  return s.toString();
}
