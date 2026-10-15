// Compatibility facade for existing consumers. New core code imports src modules directly.
export type { PackageDefinition, Registry, SkillsCommand, SessionState, SkillLoadRecord, ProjectState, RouterState } from "../src/types.ts"
export { loadRegistry } from "../src/registry.ts"
export { packageLabel, orderedPackageNames, parseCommand, validateSelection } from "../src/commands.ts"
export { resolveProjectRoot, detectPackages } from "../src/project.ts"
export { StateStore } from "../src/state-store.ts"
