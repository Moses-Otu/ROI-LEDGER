export interface DeploymentRefs {
  id: string;
  external_refs: Record<string, unknown> | null;
}

/**
 * Builds a lookup from every string in a deployment's external_refs (n8n
 * workflow ids, Langfuse tags/project, OpenRouter key label, …) to its id.
 * Ambiguous refs (shared by two deployments) are dropped so nothing is misfiled.
 */
export function buildRefIndex(deployments: DeploymentRefs[]): Map<string, string> {
  const index = new Map<string, string>();
  const ambiguous = new Set<string>();
  for (const d of deployments) {
    for (const ref of flattenRefs(d.external_refs)) {
      const existing = index.get(ref);
      if (existing && existing !== d.id) ambiguous.add(ref);
      else index.set(ref, d.id);
    }
  }
  for (const ref of ambiguous) index.delete(ref);
  return index;
}

export function flattenRefs(refs: Record<string, unknown> | null | undefined): string[] {
  const out: string[] = [];
  for (const v of Object.values(refs ?? {})) {
    if (typeof v === "string" && v.trim()) out.push(v.trim());
    else if (Array.isArray(v)) for (const x of v) if (typeof x === "string" && x.trim()) out.push(x.trim());
  }
  return out;
}

export function resolveDeployment(
  record: { deployment_id?: string; deployment_ref?: string },
  ids: Set<string>,
  refIndex: Map<string, string>,
): string | null {
  if (record.deployment_id) return ids.has(record.deployment_id) ? record.deployment_id : null;
  if (record.deployment_ref) {
    const ref = record.deployment_ref.trim();
    if (ids.has(ref)) return ref;
    return refIndex.get(ref) ?? null;
  }
  return null;
}
