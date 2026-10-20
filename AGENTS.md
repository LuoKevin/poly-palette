# PolyPalette working context

Before continuing, read `HANDOFF.md`, then `README.md`. The handoff records implemented milestones, historical verification, known limitations, Git state, and the proposed next milestone. Update it after meaningful implementation changes.

This is a browser-only React/TypeScript/Vite/Three.js application using React Three Fiber and Drei. Models are processed locally; keep the initial app free of accounts, backend services, and remote model-resource fetching.

The user knows React/TypeScript/backend development and is learning 3D graphics. Implement in runnable milestones, explain unfamiliar graphics concepts briefly, and provide exact run commands plus a short manual verification checklist. Distinguish implemented features from future plans. Preserve the existing local changes and user work.

Use `npm test` for behavioral checks and `npm run build` for TypeScript/production validation when changing implementation. Verify actual browser interactions for UI/graphics changes; build success alone does not establish painting/export behavior. Treat past test results in the handoff as historical evidence, not results for newly changed code.

The code lives in this repository at `/Users/kevinluo/Documents/Projects/poly-palette`. The earlier `terminus/polypalette` location was moved and should not be used. Follow the current user's requested scope; the roadmap does not itself authorize starting every future milestone.
