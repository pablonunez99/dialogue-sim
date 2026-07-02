export function getNpcImagePrompt(jsonStr) {
  return `Semi-realistic painterly anime concept art, cinematic digital painting style (photoreal anime hybrid, detailed rendering).
A character expression sprite sheet featuring 6 centered waist-up portraits of the same character: ${jsonStr}.

ART STYLE DIRECTION:
- Semi-realistic rendering: anime-proportioned large detailed eyes with realistic iris texture and multiple layered catchlights, combined with painterly, near-photoreal skin shading (soft subsurface glow, no flat cel edges).
- Hair rendered strand-by-strand with strong directional specular highlights, soft ambient occlusion at the roots, natural flyaway strands.
- Skin: soft realistic gradient shading, subtle warm rim light matching the scene's key light source, no glossy oily sheen.
- Dramatic but consistent studio-style lighting across all 6 panels (single fixed key light direction), warm color temperature.
- Fine linework limited to eyes, lips, and jaw definition; everywhere else relies on soft painted shading rather than hard ink outlines.
- Avoid: flat cel-shaded anime look, plastic mobage skin, harsh black outlines, inconsistent lighting direction between panels.

All 6 portraits must wear the exact same clothing (avoid green clothing), fully modest and consistent across all panels. Each portrait must have a clearly different dynamic pose with a distinct silhouette (avoid mirrored poses) and showcase one of these expressions: Neutral, happy, sad, angry, surprised, sassy.

LAYOUT: single continuous solid chroma green background (#00FF00). NO borders, NO grid lines, NO panels, NO framing, NO text. Fully seamless green background behind all figures.
Keep each figure fully centered inside its cell with a wide green margin of at least 35 pixels on left, right, and top, so no part of the character (clothes, arms, hair) touches the top, left, or right edges.`;
}

export function getLocationImagePrompt(description) {
  return `Masterpiece, high quality visual novel background art, flat anime coloring, beautiful lighting, medieval fantasy style, depicting a ${description}. Highly detailed.`;
}

export const npcImageConfig = {
  responseModalities: ['IMAGE'],
  temperature: 0.5,
  imageConfig: {
    aspectRatio: '1:1'
  }
};

export const locationImageConfig = {
  responseModalities: ['IMAGE'],
  temperature: 0.6,
  imageConfig: {
    aspectRatio: '16:9' // Widescreen background for locations
  }
};
