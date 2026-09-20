export function normalizeViewerAnimationNames(names: string[]): string[] {
  return [...new Set(names.map((name) => name.trim()).filter(Boolean))];
}

function comparableAnimationName(name: string): string {
  return name
    .replace(/^animation[._-]/i, '')
    .replace(/[^a-z0-9]/gi, '')
    .toLowerCase();
}

export function pickDefaultAnimation(names: string[]): string | undefined {
  if (names.length === 0) return undefined;
  return names.find((name) => comparableAnimationName(name) === 'idle') ?? names[0];
}

export function displayAnimationName(name: string): string {
  const stripped = name.replace(/^animation[._-]/i, '');
  return stripped
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim()
    .replace(/\b\w/g, (character) => character.toUpperCase());
}
