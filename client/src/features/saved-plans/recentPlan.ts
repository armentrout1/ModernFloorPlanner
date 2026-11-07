const PREFIX = 'modern-floor-planner:last-plan:v1:';

const storageKey = (principalId: string, workspaceId: string) =>
  `${PREFIX}${principalId}:${workspaceId}`;

export function readLastPlan(principalId: string, workspaceId: string): number | null {
  try {
    const value = Number(localStorage.getItem(storageKey(principalId, workspaceId)));
    return Number.isInteger(value) && value > 0 ? value : null;
  } catch {
    return null;
  }
}

export function rememberLastPlan(principalId: string, workspaceId: string, planId: number) {
  try {
    localStorage.setItem(storageKey(principalId, workspaceId), String(planId));
  } catch {
    // A convenience preference must never block the authorized plan operation.
  }
}

export function forgetLastPlan(principalId: string, workspaceId: string, planId?: number) {
  try {
    const key = storageKey(principalId, workspaceId);
    if (planId === undefined || localStorage.getItem(key) === String(planId)) localStorage.removeItem(key);
  } catch {
    // Storage can be unavailable while the server plan remains valid.
  }
}
