import { ConnectorError } from './errors.js';

export interface Workspace {
  id: string;
  name: string;
  projectPath: string;
  loaded: boolean;
  selectedInApp: boolean;
}

/**
 * Picks the workspace a request is about: the one named, else the one whose folder contains
 * the current directory, else the one selected in the Toone app.
 */
export function pickWorkspace(all: Workspace[], wanted: string | undefined, cwd: string): Workspace {
  if (wanted) {
    const needle = wanted.toLowerCase();
    const hit =
      all.find((w) => w.id.toLowerCase() === needle || w.name.toLowerCase() === needle || w.projectPath === wanted) ??
      all.find((w) => w.name.toLowerCase().includes(needle));
    if (!hit) {
      throw new ConnectorError(
        'WORKSPACE_NOT_FOUND',
        `No Toone workspace matches "${wanted}". Available: ${all.map((w) => w.name).join(', ') || 'none'}.`,
      );
    }
    return hit;
  }
  const byFolder = all
    .filter((w) => cwd === w.projectPath || cwd.startsWith(`${w.projectPath}/`))
    .sort((a, b) => b.projectPath.length - a.projectPath.length)[0];
  const chosen = byFolder ?? all.find((w) => w.selectedInApp) ?? all[0];
  if (!chosen) throw new ConnectorError('WORKSPACE_NOT_FOUND', 'Toone has no workspaces yet. Open a project in Toone first.');
  return chosen;
}
