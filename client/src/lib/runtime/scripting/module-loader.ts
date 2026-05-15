/**
 * Module loading system for ModuleScripts.
 * Handles initialization, caching, and require() functionality.
 */

import type { RuntimeObject, GameAPI, CompiledScript } from "../types";

export type ModuleLoaderContext = {
  /** Map of module name -> cached exports */
  modules: Map<string, any>;
  /** Map of module name -> RuntimeObject for ModuleScripts */
  moduleScripts: Map<string, RuntimeObject>;
  /** Push a log message */
  pushLog: (line: string) => void;
};

export type Script = {
  name: string;
  code: string;
  enabled?: boolean;
  scriptType?: "Script" | "ModuleScript";
};

/**
 * Compile a single script into a runnable function.
 */
export function compileScript(
  name: string,
  code: string,
  pushLog: (line: string) => void
): CompiledScript {
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function("game", `with(game){${code}}`);
    return { name, run: (api: GameAPI) => fn(api) };
  } catch (e: any) {
    pushLog(`[${name}] compile error: ${e.message ?? e}`);
    return { name, error: e.message ?? String(e) };
  }
}

/**
 * Initialize ModuleScripts - finds all ModuleScripts in the object tree
 * and pre-compiles them so they can be required later.
 * 
 * @param scripts - Array of script definitions
 * @param allObjects - Map of all runtime objects
 * @param buildApiForModule - Function to build the API for a module execution
 * @param ctx - Module loader context
 */
export function initializeModuleScripts(
  scripts: Script[],
  allObjects: Map<string, RuntimeObject>,
  buildApiForModule: () => GameAPI,
  ctx: ModuleLoaderContext
): void {
  // Find all ModuleScripts
  for (const o of allObjects.values()) {
    if (o.type !== "ModuleScript") continue;
    
    ctx.moduleScripts.set(o.name, o);
    
    const script = scripts.find(s => s.name === o.name);
    if (script && script.enabled !== false) {
      // Compile and run the module to get its exports
      const compiled = compileScript(o.name, script.code, ctx.pushLog);
      if (compiled.run) {
        try {
          const moduleExports: any = {};
          const moduleObj = { exports: moduleExports };
          const api = buildApiForModule();
          // Inject exports and module into the API
          (api as any).exports = moduleExports;
          (api as any).module = moduleObj;
          compiled.run(api);
          // Store the exports (module.exports may have been reassigned)
          ctx.modules.set(o.name, moduleObj.exports);
        } catch (e: any) {
          ctx.pushLog(`[ModuleScript:${o.name}] init error: ${e.message ?? e}`);
        }
      }
    }
  }
}

/**
 * Require a module by name.
 * Returns the cached exports if available, or logs an error if not found.
 */
export function requireModule(name: string, ctx: ModuleLoaderContext): any {
  const exports = ctx.modules.get(name);
  if (exports !== undefined) return exports;
  ctx.pushLog(`require: module "${name}" not found`);
  return null;
}

/**
 * Check if a script is a regular runnable script (not a ModuleScript).
 */
export function isRunnableScript(
  script: Script,
  moduleScripts: Map<string, RuntimeObject>
): boolean {
  const t = script.scriptType ?? "Script";
  if (t === "ModuleScript") return false;
  if (moduleScripts.has(script.name)) return false;
  return true;
}

/**
 * Create an empty module loader context.
 */
export function createModuleLoaderContext(
  pushLog: (line: string) => void
): ModuleLoaderContext {
  return {
    modules: new Map(),
    moduleScripts: new Map(),
    pushLog,
  };
}
