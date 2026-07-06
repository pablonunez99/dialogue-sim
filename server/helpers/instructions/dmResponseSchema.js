export const dmResponseSchema = {
  type: 'object',
  properties: {
    locationId: { type: 'string' },
    participantIds: { type: 'array', items: { type: 'string' } },
    narration: { type: 'string' },
    sceneContext: { type: 'string' },
    minutesPassed: { type: 'integer' },
    newNpc: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        role: { type: 'string' },
        personality: { type: 'string' },
        secret: { type: 'string' },
        hint: { type: 'string' },
        color: { type: 'string' },
        skin: { type: 'string' },
        hair: { type: 'string' },
        outfit: { type: 'string' },
        suggestions: { type: 'array', items: { type: 'string' } },
        appearancePrompt: { type: 'string' }
      },
      required: ['id', 'name', 'role', 'personality', 'secret', 'hint', 'color', 'skin', 'hair', 'outfit', 'suggestions', 'appearancePrompt'],
      additionalProperties: false
    },
    newLocation: {
      type: 'object',
      properties: {
        id: { type: 'string' },
        name: { type: 'string' },
        prompt: { type: 'string' },
        ambient: { type: 'string' },
        connectedTo: { type: 'string' },
        distance: { type: 'integer' }
      },
      required: ['id', 'name', 'prompt', 'ambient', 'connectedTo', 'distance'],
      additionalProperties: false
    },
    exitTheConversation: { type: 'array', items: { type: 'string' } },
    enterTheConversation: { type: 'array', items: { type: 'string' } },
    updateLocationImage: {
      type: 'object',
      properties: {
        locationId: { type: 'string' },
        prompt: { type: 'string' }
      },
      required: ['locationId', 'prompt'],
      additionalProperties: false
    }
  },
  required: [
    'locationId',
    'participantIds',
    'narration',
    'sceneContext',
    'minutesPassed',
  ],
  additionalProperties: false
};
