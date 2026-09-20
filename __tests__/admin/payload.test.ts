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
