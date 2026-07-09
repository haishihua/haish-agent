// @haish-esm
import { CHAR_DEFS, WalkingSprite } from './sprites.jsx';
import React from 'react';

// World — the office stage with characters
// Position grid is in % of map (1700x950)

export const NPC_SIZE = 88;
const NPC_FOOT_OFFSET = 10;
export const NPC_SIZES = {
  gojo: 108,
  guts: 106,
  okabe: 88,
  kurisu: 88,
  lelouch: 96,
  levi: 88,
  itachi: 88,
  mikey: 88,
};
// Stations — fixed positions on the office map (percentage)
export const STATIONS = {
  gojo:    { x: 0.281, y: 0.418, label: 'You' },
  guts:    { x: 0.336, y: 0.694, label: 'Assistant' },
  okabe:   { x: 0.572, y: 0.277, label: 'OpenAI protocol' },
  kurisu:  { x: 0.454, y: 0.274, label: 'Anthropic protocol' },
  lelouch: { x: 0.508, y: 0.642, label: 'Tool Manager' },
  levi:    { x: 0.77, y: 0.45, label: 'Local Tools' },
  itachi:  { x: 0.702, y: 0.262, label: 'External Tools' },
  mikey:   { x: 0.726, y: 0.645, label: 'Knowledge Base' },
};
export const NAV_POINTS = {
  left_hall_entry: { x: 0.332, y: 0.531 },
  center_left_lane: { x: 0.460, y: 0.637 },
  planning_lane: { x: 0.507, y: 0.493 },
  planning_door: { x: 0.578, y: 0.433 },
  lounge_right: { x: 0.510, y: 0.474 },
  right_upper_hall: { x: 0.626, y: 0.462 },
  right_mid_hall: { x: 0.612, y: 0.473 },
  right_lower_hall: { x: 0.727, y: 0.469 },
};
export const MEET_POINTS = {
  gojo_guts: { x: 0.303, y: 0.621 },
  guts_lelouch: { x: 0.465, y: 0.646 },
  planning_brief: { x: 0.586, y: 0.376 },
  lelouch_levi: { x: 0.727, y: 0.457 },
  lelouch_itachi: { x: 0.676, y: 0.324 },
  lelouch_mikey: { x: 0.728, y: 0.527 },
  lelouch_report: { x: 0.471, y: 0.633 },
  okabe_guts_report: { x: 0.369, y: 0.636 },
  guts_gojo_report: { x: 0.324, y: 0.423 },
};
export const ROUTES = {
  gojoToGuts: ['left_hall_entry', 'gojo_guts'],
  gutsToPlanning: ['center_left_lane', 'planning_lane', 'planning_door', 'planning_brief'],
  planningToLelouch: ['planning_door', 'planning_lane', 'center_left_lane', 'guts_lelouch'],
  gutsToLelouch: ['center_left_lane', 'guts_lelouch'],
  okabeToGuts: ['planning_door', 'planning_lane', 'center_left_lane', 'okabe_guts_report'],
  lelouchToPlanning: ['planning_lane', 'planning_door', 'planning_brief'],
  lelouchToLevi: ['lounge_right', 'right_upper_hall', 'lelouch_levi'],
  lelouchToItachi: ['lounge_right', 'right_mid_hall', 'lelouch_itachi'],
  lelouchToMikey: ['lounge_right', 'right_mid_hall', 'right_lower_hall', 'lelouch_mikey'],
  leviToLelouch: ['right_upper_hall', 'lounge_right', 'lelouch_report'],
  itachiToLelouch: ['right_mid_hall', 'lounge_right', 'lelouch_report'],
  mikeyToLelouch: ['right_lower_hall', 'right_mid_hall', 'lounge_right', 'lelouch_report'],
  planningToGojo: ['planning_door', 'planning_lane', 'center_left_lane', 'left_hall_entry', 'guts_gojo_report'],
  gutsToGojo: ['left_hall_entry', 'guts_gojo_report'],
};
export const ROUTE_EDITOR_DEFS = {
  brief_gojo_guts: { label: 'You -> Assistant', refs: ['left_hall_entry', 'gojo_guts'] },
  guts_to_lab: { label: 'Assistant -> Provider Desk', refs: ['center_left_lane', 'planning_lane', 'planning_door', 'planning_brief'] },
  lab_to_lelouch: { label: 'Provider Desk -> Tool Manager', refs: ['planning_door', 'planning_lane', 'center_left_lane', 'guts_lelouch'] },
  lelouch_to_levi: { label: 'Tool Manager -> Local Tools', refs: ['lounge_right', 'right_upper_hall', 'lelouch_levi'] },
  lelouch_to_itachi: { label: 'Tool Manager -> External Tools', refs: ['lounge_right', 'right_mid_hall', 'lelouch_itachi'] },
  lelouch_to_mikey: { label: 'Tool Manager -> Knowledge Base', refs: ['lounge_right', 'right_mid_hall', 'right_lower_hall', 'lelouch_mikey'] },
  okabe_to_guts: { label: 'Provider -> Assistant', refs: ['planning_door', 'planning_lane', 'center_left_lane', 'okabe_guts_report'] },
};
export const PROVIDER_CHANNELS = [
  { id: 'auto', label: 'Auto', x: 0.422, y: 0.208 },
  { id: 'openai', label: 'Anthropic protocol', x: 0.486, y: 0.192 },
  { id: 'deepseek', label: 'OpenAI protocol', x: 0.548, y: 0.204 },
  { id: 'dashscope', label: 'DashScope', x: 0.585, y: 0.246 },
  { id: 'zhipu', label: 'Zhipu', x: 0.566, y: 0.308 },
  { id: 'ollama', label: 'Ollama', x: 0.502, y: 0.332 },
  { id: 'vllm', label: 'vLLM', x: 0.438, y: 0.306 },
];
function normalizeProviderChannelId(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized || normalized === 'generic') return 'auto';
  if (normalized === 'qwen') return 'dashscope';
  if (normalized === 'local') return 'ollama';
  return normalized;
}

export function ProviderRail({ mapW, mapH, providerKey, providerLabel, providerState, requestedProvider }) {
  const activeChannelId = normalizeProviderChannelId(providerKey || providerLabel || requestedProvider || 'auto');
  const requestChannelId = normalizeProviderChannelId(requestedProvider || 'auto');
  const stateLabel = String(providerState || 'idle').toLowerCase();

  return (
    <div className="provider-rail">
      <div
        className={`provider-hub state-${stateLabel}`}
        style={{
          left: STATIONS.kurisu.x * mapW - 70,
          top: STATIONS.kurisu.y * mapH - 72,
          width: 140,
        }}
      >
        <div className="provider-hub-title">Provider Channels</div>
        <div className="provider-hub-subtitle">{providerLabel || 'Awaiting provider route'}</div>
      </div>
      <svg className="provider-links" width={mapW} height={mapH} aria-hidden="true">
        {PROVIDER_CHANNELS.map((channel) => {
          const isActive = channel.id === activeChannelId;
          const isRequested = !isActive && channel.id === requestChannelId;
          return (
            <line
              key={channel.id}
              className={isActive ? 'active' : isRequested ? 'requested' : ''}
              x1={STATIONS.kurisu.x * mapW}
              y1={STATIONS.kurisu.y * mapH - 6}
              x2={channel.x * mapW}
              y2={channel.y * mapH}
            />
          );
        })}
      </svg>
      {PROVIDER_CHANNELS.map((channel) => {
        const isActive = channel.id === activeChannelId;
        const isRequested = !isActive && channel.id === requestChannelId;
        return (
          <div
            key={channel.id}
            className={`provider-channel ${isActive ? 'active' : ''} ${isRequested ? 'requested' : ''}`}
            style={{
              left: channel.x * mapW - 34,
              top: channel.y * mapH - 16,
              width: 68,
            }}
          >
            <span>{channel.label}</span>
          </div>
        );
      })}
    </div>
  );
}
export function NPC({
  id,
  state,
  spriteConfig = null,
  mapW,
  mapH,
  showLabel = true,
  interactive = false,
  selected = false,
  showDebug = false,
  debugText = '',
  onPointerDown,
}) {
  const def = CHAR_DEFS[id];
  const station = STATIONS[id];
  const pos = state?.pos || station;
  const poseDebug = state?.poseDebug;
  const dir = poseDebug?.dir || state?.dir || 'front';
  const walking = poseDebug ? poseDebug.movement === 'walking' : !!state?.walking;
  const action = state?.action;
  const bubble = state?.bubble;
  const busy = poseDebug ? poseDebug.pose === 'busy' : state?.busy;
  const thinking = poseDebug ? poseDebug.pose === 'think' : state?.thinking;
  const actionKind = poseDebug?.pose && poseDebug.pose !== 'idle' ? poseDebug.pose : action?.kind;
  const npcSize = NPC_SIZES[id] || NPC_SIZE;

  const left = pos.x * mapW - npcSize / 2;
  const top = pos.y * mapH - npcSize + NPC_FOOT_OFFSET;

  return (
    <div
      className={`npc ${walking ? 'walking' : ''} ${busy ? 'busy' : ''} ${thinking ? 'thinking' : ''} ${interactive ? 'calibration-ready' : ''} ${selected ? 'selected' : ''}`}
      style={{ left, top, width: npcSize, height: npcSize }}
      data-npc-id={id}
      onPointerDown={interactive ? (event) => onPointerDown?.(id, event) : undefined}
    >
      <div className="npc-shadow" />
      <div className={`npc-body ${walking ? 'walking' : 'idle'}`}>
        <WalkingSprite
          id={id}
          dir={dir}
          size={npcSize}
          walking={walking}
          actionKind={actionKind}
          actionVariant={action?.variant}
          busy={busy}
          thinking={thinking}
          spriteConfig={spriteConfig}
        />
      </div>
      {showDebug && <div className="npc-debug">{debugText}</div>}
      {showLabel && <div className="npc-label">{def.name}</div>}
      {showDebug && <div className="npc-foot-anchor" />}
      {action && !poseDebug && !bubble && <div className={`action-tag kind-${action.kind}`}>{action.label}</div>}
      {bubble && <div className="bubble">{bubble}</div>}
    </div>
  );
}
export function CalibrationPoint({
  id,
  point,
  mapW,
  mapH,
  kind = 'nav',
  selected = false,
  showDebug = false,
  badgeText = null,
  onPointerDown,
}) {
  if (!point) return null;
  const size = kind === 'meet' ? 20 : 16;
  return (
    <div
      className={`calibration-point point-${kind} ${selected ? 'selected' : ''}`}
      style={{
        left: point.x * mapW - size / 2,
        top: point.y * mapH - size / 2,
        width: size,
        height: size,
      }}
      onPointerDown={(event) => onPointerDown?.(id, event)}
    >
      <div className="calibration-point-dot" />
      {badgeText != null && <div className="calibration-point-order">{badgeText}</div>}
      <div className="calibration-point-label">{id}</div>
      {showDebug && <div className="calibration-point-debug">{point.x.toFixed(3)}, {point.y.toFixed(3)}</div>}
    </div>
  );
}
export function CalibrationRoutePreview({ routeId, mapW, mapH }) {
  const route = ROUTE_EDITOR_DEFS?.[routeId]?.refs || ROUTES?.[routeId];
  if (!route?.length) return null;
  const points = route
    .map((ref) => STATIONS[ref] || NAV_POINTS?.[ref] || MEET_POINTS?.[ref] || null)
    .filter(Boolean);
  if (points.length < 2) return null;
  const polyline = points.map((point) => `${point.x * mapW},${point.y * mapH}`).join(' ');
  return (
    <div className="calibration-route-preview">
      <svg width={mapW} height={mapH}>
        <polyline points={polyline} />
        {points.map((point, index) => (
          <g key={`${routeId}-${index}`} transform={`translate(${point.x * mapW}, ${point.y * mapH})`}>
            <circle r="12" />
            <text textAnchor="middle" dy="4">{index + 1}</text>
          </g>
        ))}
      </svg>
    </div>
  );
}


// Derived / compatibility exports
export const CALIBRATION_IDS = Object.keys(STATIONS);
export const NAV_POINT_IDS = Object.keys(NAV_POINTS);
export const MEET_POINT_IDS = Object.keys(MEET_POINTS);
export const ROUTE_IDS = Object.keys(ROUTES);
export const ROUTE_EDITOR_IDS = Object.keys(ROUTE_EDITOR_DEFS);
