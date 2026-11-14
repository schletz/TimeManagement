import { api } from '../api/api';
import type { Project } from '../api/types';
import { useApi } from './useApi';

const LAST_PROJECT_KEY = 'baustelle.lastProject';

/** Cached project list (stale-while-revalidate, persisted for offline use). */
export function useProjects() {
  return useApi<Project[]>('projects', api.listProjects, { persist: true });
}

/** Last project chosen in a form ("Stunden erfassen" remembers it). */
export function getLastProjectId(): string {
  try {
    return localStorage.getItem(LAST_PROJECT_KEY) ?? '';
  } catch {
    return '';
  }
}

export function setLastProjectId(id: string): void {
  try {
    localStorage.setItem(LAST_PROJECT_KEY, id);
  } catch {
    // ignore
  }
}
