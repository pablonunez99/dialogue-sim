export const npcResponseSchema = {
  type: 'object',
  properties: {
    decide_to_speak: { type: 'boolean' },
    dialogue: { type: 'string' },
    actions: { type: 'string' },
    expression: {
      type: 'string',
      enum: ['neutral', 'happy', 'angry', 'sad', 'surprised', 'smirky']
    },
    wants_to_leave: { type: 'boolean' },
    relationshipDelta: { type: 'integer' },
    trustDelta: { type: 'integer' },
    inventoryDeltas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          description: { type: 'string' },
          action: { type: 'string', enum: ['add', 'remove'] }
        },
        required: ['id', 'name', 'description', 'action'],
        additionalProperties: false
      }
    },
    goldDelta: { type: 'integer' },
    questUpdates: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          status: { type: 'string', enum: ['completed', 'failed'] }
        },
        required: ['id', 'status'],
        additionalProperties: false
      }
    },
    generateQuest: {
      type: 'object',
      properties: {
        npcId: { type: 'string' },
        urgency: { type: 'string' },
        theme: { type: 'string' }
      },
      required: ['npcId', 'urgency', 'theme'],
      additionalProperties: false
    }
  },
  required: [
    'decide_to_speak',
    'dialogue',
    'actions',
    'expression',
    'wants_to_leave',
    'relationshipDelta',
    'trustDelta',
    'inventoryDeltas',
    'goldDelta',
    'questUpdates',
    'generateQuest'
  ],
  additionalProperties: false
};
