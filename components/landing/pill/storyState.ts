// Which story scene is active (0-6), or -1 outside the story. Written by
// StickyStory, read every frame by the 3D pill: a plain mutable object, so
// scene changes never re-render the canvas.
export const story = { scene: -1 };

export const SCENE = { wall: 1, path: 2, cliff: 4 } as const;
