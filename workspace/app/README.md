# Healthy Meal Recommender (Vite + React)

## Scripts
- `npm run dev`: Start dev server
- `npm run build`: Production build
- `npm run preview`: Preview build

## Env
Create `.env` (or `.env.local`) in the app root:

```
VITE_OPENAI_API_KEY=your_key_here
```

Access in code via `import.meta.env.VITE_OPENAI_API_KEY`.

## Netlify
- Build command: `npm run build`
- Publish directory: `dist`

CLI deploy (after login):
```
netlify deploy --build --dir=dist --prod
```
