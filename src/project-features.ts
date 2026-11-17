import { projectSwitches, type ProjectSwitches } from "./project-switches.ts"

// Feature controls themselves are always reachable and cannot be disabled.
export const FEATURES = [
  { id: "skills-management", name: "Skills management" },
  { id: "output-compaction", name: "Output compaction" },
] as const
export type FeatureID = typeof FEATURES[number]["id"]
export type ProjectFeatures = ProjectSwitches<FeatureID>
export type FeatureStores = (root: string) => ProjectFeatures

export function projectFeatures(root: string): ProjectFeatures {
  return projectSwitches(root, "features", (name): name is FeatureID => FEATURES.some(feature => feature.id === name))
}

export async function featureEnabled(store: ProjectFeatures, feature: FeatureID) {
  return !(await store.read()).includes(feature)
}
