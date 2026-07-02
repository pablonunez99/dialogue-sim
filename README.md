# Aldea de Robledal

Juego web de novela visual medieval con dialogo interactivo mediante IA generativa.

## Ejecutar

```bash
npm install
npm run generate:portraits
npm run dev
```

Abre `http://localhost:5173`.

## IA

El servidor usa `OPENAI_API_KEY` desde `.env`. Si no hay clave, la demo sigue funcionando con respuestas locales para que puedas probar la interfaz.

```env
OPENAI_API_KEY=tu_clave
OPENAI_MODEL=gpt-5.5
PORT=5173
```

## Assets

El script `npm run generate:portraits` crea:

- `public/assets/portraits/*.png`: retratos transparentes usados por el juego.
- `public/assets/portraits/green-source/*-green.png`: las 6 expresiones por NPC sobre fondo verde `#00ff00`.
- `public/assets/locations/*.svg`: fondos de ubicacion medieval.

Expresiones por NPC: `neutral`, `happy`, `angry`, `sad`, `surprised`, `thinking`.
