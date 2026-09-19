import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ createNote: vi.fn(), invalidateQueries: vi.fn(), toast: vi.fn() }));
vi.mock('@/data/ApiContext', () => ({ useApi: () => ({ createNote: mocks.createNote }) }));
vi.mock('@tanstack/react-query', () => ({ useQueryClient: () => ({ invalidateQueries: mocks.invalidateQueries }) }));
vi.mock('@/components/Toast', () => ({ useToast: () => mocks.toast }));
import { useQuickCapture } from './model';
describe('quick capture result', () => {
  beforeEach(() => vi.resetAllMocks());
  it('confirms successful capture only after saving and refreshing notes', async () => {
    mocks.createNote.mockResolvedValue({ id: 'note' });
    expect(await useQuickCapture()('  Pendiente  ', 'hacer')).toBe(true);
    expect(mocks.createNote).toHaveBeenCalledWith({ type: 'hacer', body: 'Pendiente' });
    expect(mocks.invalidateQueries).toHaveBeenCalled();
  });
  it('returns failure so the form preserves the draft when saving fails', async () => {
    mocks.createNote.mockRejectedValue(new Error('Sin conexión'));
    expect(await useQuickCapture()('Mi borrador', 'nota')).toBe(false);
    expect(mocks.toast).toHaveBeenCalledWith(expect.stringContaining('Sin conexión'), 'error');
    expect(mocks.invalidateQueries).not.toHaveBeenCalled();
  });
  it('does not create an empty note', async () => {
    expect(await useQuickCapture()('   ')).toBe(false);
    expect(mocks.createNote).not.toHaveBeenCalled();
  });
});
