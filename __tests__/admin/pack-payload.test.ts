import { expect, it } from 'vitest';
import { parsePackMutationBody } from '@/lib/admin/pack-payload';

const userId = '11111111-1111-4111-8111-111111111111';
const sessionId = '22222222-2222-4222-8222-222222222222';
const a = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

it('rejects duplicate ordered creation ids', () => {
  expect(() => parsePackMutationBody({
    payload: { name: 'Pack', slug: 'pack', description: '', published: true, orderedCreationIds: [a, a] },
  }, userId)).toThrow(/duplicate creation/i);
});

it('rejects malformed creation ids', () => {
  expect(() => parsePackMutationBody({
    payload: { name: 'Pack', slug: 'pack', description: '', published: true, orderedCreationIds: ['not-a-uuid'] },
  }, userId)).toThrow(/valid uuid/i);
});

it('rejects simultaneous removeCover and uploaded replacement', () => {
  expect(() => parsePackMutationBody({
    payload: { name: 'Pack', slug: 'pack', description: '', published: true, orderedCreationIds: [] },
    removeCover: true,
    uploads: { cover: {
      clientKey: 'pack-cover', kind: 'render', bucket: 'portfolio-renders',
      path: `uploads/${userId}/${sessionId}/33333333-3333-4333-8333-333333333333.png`,
      filename: 'cover.png', size: 10, contentType: 'image/png',
    } },
  }, userId)).toThrow(/remove and replace/i);
});


it('rejects non-boolean published values', () => {
  expect(() => parsePackMutationBody({
    payload: { name: 'Pack', slug: 'pack', description: '', published: 'false', orderedCreationIds: [] },
  }, userId)).toThrow(/published must be a boolean/i);
});

it('rejects unsafe or non-string slugs instead of silently replacing them', () => {
  expect(() => parsePackMutationBody({
    payload: { name: 'Pack', slug: '../bad', description: '', published: true, orderedCreationIds: [] },
  }, userId)).toThrow(/slug/i);

  expect(() => parsePackMutationBody({
    payload: { name: 'Pack', slug: 42, description: '', published: true, orderedCreationIds: [] },
  }, userId)).toThrow(/slug/i);
});
