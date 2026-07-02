export async function callLlm(manager, prompt, schema, schemaName = 'response') {
  if (!manager?.client) {
    console.warn(`[LlmHelper] No AI client configured for "${schemaName}". Returning null.`);
    return null;
  }

  const { client, model, isGemini } = manager;

  try {
    if (isGemini) {
      const response = await client.models.generateContent({
        model: model,
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: {
          responseMimeType: 'application/json',
          responseSchema: schema
        }
      });
      return JSON.parse(response.text);
    } else {
      const response = await client.chat.completions.create({
        model: model,
        messages: [{ role: 'user', content: prompt }],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: schemaName,
            strict: true,
            schema: schema
          }
        }
      });
      const content = response.choices[0].message.content;
      return JSON.parse(content);
    }
  } catch (err) {
    console.error(`[LlmHelper] LLM call failed for "${schemaName}":`, err.message);
    return null;
  }
}
