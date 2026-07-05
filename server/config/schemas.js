// Esquemas de respuesta estructurada para las llamadas a la IA (Gemini/OpenAI)

export const sceneResponseSchema = {
  type: 'object',
  properties: {
    locationId: { type: 'string' },
    participantIds: { type: 'array', items: { type: 'string' } },
    narration: { type: 'string' },
    messages: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          speakerId: { type: 'string' },
          line: { type: 'string' },
          expression: { type: 'string' }
        },
        required: ['speakerId', 'line', 'expression'],
        additionalProperties: false
      }
    },
    relationshipDeltas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          npcId: { type: 'string' },
          delta: { type: 'integer' }
        },
        required: ['npcId', 'delta'],
        additionalProperties: false
      }
    },
    trustDeltas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          npcId: { type: 'string' },
          delta: { type: 'integer' }
        },
        required: ['npcId', 'delta'],
        additionalProperties: false
      }
    },
    newNpc: {
      type: 'object',
      description: 'use it when you wish to introduce a new npc or the player talks to someone who is not pre-generated or an npc mention some new character.',
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
      description: 'Use it to create new locations required by the story.',
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
    minutesPassed: { type: 'integer' },
    exitTheConversation: { type: 'array', items: { type: 'string' } },
    enterTheConversation: { type: 'array', items: { type: 'string' } },
    updateLocationImage: {
      type: 'object',
      description:'Use it to change tha image of a location only when the location looks change significantly.',
      properties: {
        locationId: { type: 'string' },
        prompt: { type: 'string' }
      },
      required: ['locationId', 'prompt'],
      additionalProperties: false
    },
    inventoryDeltas: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          description: { type: 'string' },
          action: { type: 'string' }
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
          status: { type: 'string' }
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
    'locationId',
    'participantIds',
    'narration',
    'messages',
    'relationshipDeltas',
    'trustDeltas',
    'newNpc',
    'newLocation',
    'minutesPassed',
    'exitTheConversation',
    'enterTheConversation',
    'updateLocationImage',
    'inventoryDeltas',
    'goldDelta',
    'questUpdates',
    'generateQuest'
  ],
  additionalProperties: false
};

export const worldUpdateResponseSchema = {
  type: 'object',
  properties: {
    npcActions: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          npcId: { type: 'string' },
          action: { type: 'string' }
        },
        required: ['npcId', 'action'],
        additionalProperties: false
      }
    },
    deprecatedEventIds: {
      type: 'array',
      items: { type: 'string' }
    },
    newEvents: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          name: { type: 'string' },
          description: { type: 'string' },
          consequence: { type: 'string' },
          day: { type: 'integer' },
          timeOfDay: { type: 'string' },
          locationId: { type: 'string' },
          involvedNpcs: { type: 'array', items: { type: 'string' } },
          requiresFlags: { type: 'array', items: { type: 'string' } },
          excludesIfFlags: { type: 'array', items: { type: 'string' } },
          repeatable: { type: 'boolean' },
          repeatInterval: { type: 'integer' }
        },
        required: [
          'id', 'name', 'description', 'consequence', 'day', 'timeOfDay',
          'locationId', 'involvedNpcs', 'requiresFlags', 'excludesIfFlags',
          'repeatable', 'repeatInterval'
        ],
        additionalProperties: false
      }
    },
    quests: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          npcId: { type: 'string' },
          title: { type: 'string' },
          description: { type: 'string' },
          objective: { type: 'string' },
          urgency: { type: 'string' },
          triggerDirectMeet: { type: 'boolean' },
          reward: {
            type: 'object',
            properties: {
              gold: { type: 'integer' },
              relationDelta: { type: 'integer' },
              item: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  name: { type: 'string' },
                  description: { type: 'string' }
                },
                required: ['id', 'name', 'description'],
                additionalProperties: false
              }
            },
            required: ['gold', 'relationDelta', 'item'],
            additionalProperties: false
          }
        },
        required: ['id', 'npcId', 'title', 'description', 'objective', 'urgency', 'triggerDirectMeet', 'reward'],
        additionalProperties: false
      }
    },
    npcGoalUpdates: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          npcId: { type: 'string' },
          shortTermGoal: { type: 'string' },
          longTermGoal: { type: 'string' },
          goalProgress: { type: 'string' },
          routine: {
            type: 'object',
            properties: {
              mañana: { type: 'string' },
              tarde: { type: 'string' },
              noche: { type: 'string' }
            },
            required: ['mañana', 'tarde', 'noche'],
            additionalProperties: false
          }
        },
        required: ['npcId', 'shortTermGoal', 'longTermGoal', 'goalProgress', 'routine'],
        additionalProperties: false
      }
    }
  },
  required: ['npcActions', 'deprecatedEventIds', 'newEvents', 'quests', 'npcGoalUpdates'],
  additionalProperties: false
};
