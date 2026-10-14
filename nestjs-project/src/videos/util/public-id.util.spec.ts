import {
  generatePublicId,
  generateUniquePublicId,
  PublicIdCollisionException,
  PUBLIC_ID_LENGTH,
} from './public-id.util';

describe('generatePublicId', () => {
  it('should produce an 11-char base62 id by default', () => {
    const id = generatePublicId();

    expect(id).toHaveLength(PUBLIC_ID_LENGTH);
    expect(id).toMatch(/^[0-9A-Za-z]+$/);
  });

  it('should honor a custom length', () => {
    expect(generatePublicId(20)).toHaveLength(20);
  });

  it('should not produce duplicates across 10,000 generations', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 10_000; i++) ids.add(generatePublicId());

    expect(ids.size).toBe(10_000);
  });
});

describe('generateUniquePublicId', () => {
  it('should retry until the repository reports a free id', async () => {
    const candidates = ['taken000001', 'taken000002', 'free0000001'];
    const generate = jest.fn(() => candidates.shift()!);
    const isTaken = jest.fn((id: string) =>
      Promise.resolve(id.startsWith('taken')),
    );

    const id = await generateUniquePublicId(isTaken, 5, generate);

    expect(id).toBe('free0000001');
    expect(isTaken).toHaveBeenCalledTimes(3);
  });

  it('should throw PublicIdCollisionException after exhausting attempts', async () => {
    const isTaken = jest.fn(() => Promise.resolve(true));

    await expect(generateUniquePublicId(isTaken, 3)).rejects.toBeInstanceOf(
      PublicIdCollisionException,
    );
    expect(isTaken).toHaveBeenCalledTimes(3);
  });
});
