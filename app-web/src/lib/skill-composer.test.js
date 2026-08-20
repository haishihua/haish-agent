import test from 'node:test';
import assert from 'node:assert/strict';
import {
  agentCatalogFromProfiles,
  matchingAgentSkills,
  withSelectedSkillInstruction,
} from './agent-catalog.js';

test('runtime skills feed slash suggestions and selected skill instructions', () => {
  const catalog = agentCatalogFromProfiles({
    agents: [{
      agent_id: 'preset.general',
      display_name: 'Code Agent',
      effective_skill_items: [
        { name: 'esx', description: 'Requirement workflow' },
        { name: 'autest', description: 'Unit testing' },
      ],
    }],
  });

  assert.deepEqual(matchingAgentSkills('/esx', catalog.options[0].skills), [
    { name: 'esx', description: 'Requirement workflow' },
  ]);
  assert.equal(
    withSelectedSkillInstruction('分析需求', catalog.options[0].skills[0]),
    'Use the esx skill.\n分析需求',
  );
});
