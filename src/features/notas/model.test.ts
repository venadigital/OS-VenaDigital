import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ createNote: vi.fn(), uploadNoteImage: vi.fn(), linkPreview: vi.fn(), invalidateQueries: vi.fn(), toast: vi.fn() }));
vi.mock('@/data/ApiContext', () => ({ useApi: () => ({ createNote: mocks.createNote, uploadNoteImage: mocks.uploadNoteImage, linkPreview: mocks.linkPreview }) }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }), useQuery: () => ({}) }));
vi.mock('@/components/Toast', () => ({ useToast: () => mocks.toast }));
import { splitLink, useQuickCapture } from './model';

describe('splitLink', () => {
  it('finds a URL anywhere in the text and keeps the rest as the comment', () => {
    expect(splitLink('Referencia para el home https://dribbble.com/shots/1 mirar el header')).toEqual({
      url: 'https://dribbble.com/shots/1',
      comment: 'Referencia para el home mirar el header',
    });
  });
  it('leaves trailing punctuation out of the URL', () => {
    expect(splitLink('Mira esto: https://ejemplo.com/a.')).toEqual({ url: 'https://ejemplo.com/a', comment: 'Mira esto:' });
  });
  it('is null without a URL', () => {
    expect(splitLink('sin link')).toBeNull();
  });
});

describe('quick capture result', () => {
  beforeEach(() => vi.resetAllMocks());
  it('confirms successful capture only after saving and refreshing notes', async () => {
    mocks.createNote.mockResolvedValue({ id: 'note' });
    expect(await useQuickCapture()({ text: '  Pendiente  ', type: 'hacer' })).toBe(true);
    expect(mocks.createNote).toHaveBeenCalledWith({ type: 'hacer', body: 'Pendiente' });
    expect(mocks.invalidateQueries).toHaveBeenCalled();
  });
  it('returns failure so the form preserves the draft when saving fails', async () => {
    mocks.createNote.mockRejectedValue(new Error('Sin conexión'));
    expect(await useQuickCapture()({ text: 'Mi borrador', type: 'nota' })).toBe(false);
    expect(mocks.toast).toHaveBeenCalledWith(expect.stringContaining('Sin conexión'), 'error');
    expect(mocks.invalidateQueries).not.toHaveBeenCalled();
  });
  it('does not create an empty note', async () => {
    expect(await useQuickCapture()({ text: '   ', type: 'nota' })).toBe(false);
    expect(mocks.createNote).not.toHaveBeenCalled();
  });
  it('uploads the image first and saves its path with the note', async () => {
    mocks.uploadNoteImage.mockResolvedValue('u/img.png');
    mocks.createNote.mockResolvedValue({ id: 'note' });
    const image = new File(['x'], 'img.png', { type: 'image/png' });
    expect(await useQuickCapture()({ text: '', type: 'inspiracion', image })).toBe(true);
    expect(mocks.uploadNoteImage).toHaveBeenCalledWith(image);
    expect(mocks.createNote).toHaveBeenCalledWith({ type: 'inspiracion', body: '', image_path: 'u/img.png' });
  });
  it('saves a link note with the surrounding text as the comment, reusing the preview it already has', async () => {
    mocks.createNote.mockResolvedValue({ id: 'note' });
    const preview = { site: 'dribbble.com', title: 'Clinic landing' };
    expect(
      await useQuickCapture()({ text: 'Para Pinares https://dribbble.com/shots/1', type: 'nota', link: { url: 'https://dribbble.com/shots/1', preview } }),
    ).toBe(true);
    expect(mocks.linkPreview).not.toHaveBeenCalled();
    expect(mocks.createNote).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'link', body: 'Para Pinares', url: 'https://dribbble.com/shots/1', link_site: 'dribbble.com', link_title: 'Clinic landing' }),
    );
  });
});
