import { useMemo, useSyncExternalStore } from 'react';
import { workflowCanvasPreferencesSnapshot, parseWorkflowCanvasPreferences, subscribeWorkflowCanvasPreferences } from '../model/workflow-canvas-preferences.js';

export function useWorkflowCanvasPreferences(id) {
  const text = useSyncExternalStore(subscribeWorkflowCanvasPreferences, workflowCanvasPreferencesSnapshot, () => '{}');
  return useMemo(() => parseWorkflowCanvasPreferences(text)[id] || {}, [text, id]);
}
