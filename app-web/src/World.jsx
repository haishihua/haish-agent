// @haish-esm
// World — the office stage with characters
// Position grid is in % of map (1700x950)
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
