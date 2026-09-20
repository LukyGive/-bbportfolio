import { describe, expect, it } from 'vitest';
import { parseCreationFormData } from '@/lib/admin/payload';

const payload = {
  name: 'Vorakh', category: 'Boss', tags: ['Ice'], description: '',
  coverImage: '/models/_placeholder/creation-placeholder.svg', images: [], animations: [],
  featured: false, published: true,
};

function form(value: unknown = payload) {
  const data = new FormData();
  data.set('payload', JSON.stringify(value));
  return data;
}

describe('parseCreationFormData', () => {
  it('parses payload and image files', () => {
    const data = form();
    data.append('images', new File(['x'], 'front.png', { type: 'image/png' }));
    const result = parseCreationFormData(data);
    expect(result.input.name).toBe('Vorakh');
    expect(result.images).toHaveLength(1);
  });

  it('parses a private source paired with its generated viewer', () => {
    const data = form();
    const source = new File(['{}'], 'Vorakh.bbmodel', { type: 'application/octet-stream' });
    const viewer = new File(['glb'], 'model.glb', { type: 'model/gltf-binary' });
    data.set('bbmodel', source);
    data.set('viewerModel', viewer);
    data.set('viewerAnimationNames', JSON.stringify(['Idle', 'Attack', 'Idle']));
    const result = parseCreationFormData(data);
    expect(result.bbmodel?.name).toBe('Vorakh.bbmodel');
    expect(result.viewer?.file.name).toBe('model.glb');
    expect(result.viewer?.animationNames).toEqual(['Idle', 'Attack']);
  });

  it('rejects a new private source when its generated viewer is missing', () => {
    const data = form();
    data.set('bbmodel', new File(['{}'], 'Vorakh.bbmodel'));
    expect(() => parseCreationFormData(data)).toThrow(/viewer/i);
  });

  it('rejects multiple private source attachments', () => {
    const data = form();
    data.append('bbmodel', new File(['1'], 'one.bbmodel'));
    data.append('bbmodel', new File(['2'], 'two.bbmodel'));
    expect(() => parseCreationFormData(data)).toThrow(/one \.bbmodel/i);
  });

  it('rejects malformed JSON', () => {
    const data = new FormData();
    data.set('payload', '{');
    expect(() => parseCreationFormData(data)).toThrow(/json/i);
  });

  it('rejects missing required fields', () => {
    expect(() => parseCreationFormData(form({ category: 'Boss' }))).toThrow(/name/i);
  });

  it('rejects non-image files and more than 20 images', () => {
    const wrong = form();
    wrong.append('images', new File(['x'], 'readme.txt', { type: 'text/plain' }));
    expect(() => parseCreationFormData(wrong)).toThrow(/image/i);

    const many = form();
    for (let i = 0; i < 21; i++) many.append('images', new File(['x'], `${i}.png`, { type: 'image/png' }));
    expect(() => parseCreationFormData(many)).toThrow(/20/i);
  });
});
