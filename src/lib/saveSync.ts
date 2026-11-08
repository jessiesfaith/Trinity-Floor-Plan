// Keep tabs (and anything else that writes the saved plan) from saving over each other.
//
// Each tab remembers a fingerprint of the saved plan it last loaded or wrote. Before it writes, it
// checks that the stored plan is still that one; if something else saved in between, it does not
// overwrite it. When the stored plan changed and this tab has nothing unsaved, it just loads the
// newer plan; otherwise the user chooses which version to keep.

/** Fast fingerprint of a saved plan (FNV-1a over the JSON text, plus its length). */
export function savedFingerprint(raw: string | undefined | null): string {
  if (!raw) return '';
  let h = 0x811c9dc5;
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${raw.length}:${(h >>> 0).toString(16)}`;
}

export type WriteResult = 'saved' | 'conflict';

export interface SaveSync {
  /** The stored plan this tab is in step with. */
  known(): string;
  /** This tab has loaded (or deliberately written) this stored JSON. */
  accept(raw: string | undefined | null): void;
  /** Write unless the stored plan changed since this tab last loaded or wrote it. */
  write(json: string, opts?: { force?: boolean }): Promise<WriteResult>;
  /** The stored plan, when it differs from the one this tab is in step with; else null. */
  changedElsewhere(): Promise<string | null>;
}

export function createSaveSync(read: () => Promise<string | undefined>, store: (json: string) => Promise<void>, onSaved?: () => void): SaveSync {
  let known = '';
  return {
    known: () => known,
    accept(raw) {
      known = savedFingerprint(raw);
    },
    async write(json, opts = {}) {
      if (!opts.force) {
        const stored = await read();
        if (stored && savedFingerprint(stored) !== known) return 'conflict';
      }
      await store(json);
      known = savedFingerprint(json);
      onSaved?.();
      return 'saved';
    },
    async changedElsewhere() {
      const stored = await read();
      if (!stored || savedFingerprint(stored) === known) return null;
      return stored;
    },
  };
}
