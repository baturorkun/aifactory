// A checkbox list in the terminal: up/down (or k/j) to move, space to tick,
// enter to accept. Locked items stay ticked. It needs an interactive terminal;
// callers check `canPrompt()` and fall back to their defaults otherwise.

export interface CheckboxItem {
  value: string;
  label: string;
  checked: boolean;
  locked?: boolean;
}

export function canPrompt(input: NodeJS.ReadStream = process.stdin, output: NodeJS.WriteStream = process.stdout): boolean {
  return Boolean(input.isTTY && output.isTTY);
}

// The lines of the list as it is drawn; kept apart from the terminal so it can be tested.
export function renderCheckboxes(items: readonly CheckboxItem[], cursor: number): string[] {
  return items.map((item, index) => {
    const pointer = index === cursor ? '›' : ' ';
    const box = item.checked ? '[x]' : '[ ]';
    return `${pointer} ${box} ${item.label}${item.locked ? '  (always)' : ''}`;
  });
}

// One key applied to the list: the new cursor and items, and whether the
// answer is final or the prompt was cancelled.
export function applyKey(
  items: readonly CheckboxItem[],
  cursor: number,
  key: string,
): { items: CheckboxItem[]; cursor: number; done?: boolean; cancelled?: boolean } {
  const next = items.map((item) => ({ ...item }));
  switch (key) {
    case '\u001b[A': case 'k':
      return { items: next, cursor: (cursor - 1 + next.length) % next.length };
    case '\u001b[B': case 'j':
      return { items: next, cursor: (cursor + 1) % next.length };
    case ' ':
      if (!next[cursor].locked) next[cursor].checked = !next[cursor].checked;
      return { items: next, cursor };
    case '\r': case '\n':
      return { items: next, cursor, done: true };
    case '\u0003': case '\u001b':
      return { items: next, cursor, cancelled: true };
    default:
      return { items: next, cursor };
  }
}

export function promptCheckboxes(
  question: string,
  items: readonly CheckboxItem[],
  input: NodeJS.ReadStream = process.stdin,
  output: NodeJS.WriteStream = process.stdout,
): Promise<string[]> {
  return new Promise((resolve, reject) => {
    let state = { items: items.map((item) => ({ ...item })), cursor: 0 };
    let drawn = 0;
    const draw = () => {
      if (drawn > 0) output.write(`\u001b[${drawn}A\u001b[J`);
      const lines = renderCheckboxes(state.items, state.cursor);
      output.write(lines.join('\n') + '\n');
      drawn = lines.length;
    };
    const finish = () => {
      input.setRawMode?.(false);
      input.pause();
      input.removeListener('data', onData);
    };
    const onData = (chunk: Buffer) => {
      const result = applyKey(state.items, state.cursor, chunk.toString('utf8'));
      state = { items: result.items, cursor: result.cursor };
      if (result.cancelled) {
        finish();
        reject(new Error('Cancelled.'));
        return;
      }
      draw();
      if (result.done) {
        finish();
        resolve(state.items.filter((item) => item.checked).map((item) => item.value));
      }
    };
    output.write(`${question}  (↑/↓ move, space tick, enter accept)\n`);
    draw();
    input.setRawMode?.(true);
    input.resume();
    input.on('data', onData);
  });
}
