import type { Creation } from './types';

export function getRelatedCreations(current: Creation, all: Creation[], limit = 3): Creation[] {
  return all
    .filter((candidate) => candidate.published && candidate.id !== current.id)
    .map((candidate) => {
      const categoryScore = candidate.category === current.category ? 10 : 0;
      const currentTags = new Set(current.tags.map((tag) => tag.toLowerCase()));
      const sharedTagScore = candidate.tags.filter((tag) => currentTags.has(tag.toLowerCase())).length * 2;
      return { candidate, score: categoryScore + sharedTagScore };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => {
      const byScore = b.score - a.score;
      if (byScore) return byScore;
      const byDate = b.candidate.createdAt.localeCompare(a.candidate.createdAt);
      return byDate || a.candidate.name.localeCompare(b.candidate.name);
    })
    .slice(0, limit)
    .map(({ candidate }) => candidate);
}
