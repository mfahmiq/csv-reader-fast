// Fast drop-in for csv-reader 1.0.0: run(input) returns exactly what csv-reader's
// readCsv returns for {text, header} — {columns, rows, errors} — but reads the text
// in bulk instead of one character at a time. Two native regexes find the next
// special character (comma / line break / quote) and each field's content is
// sliced out in one go, so the work per field is a handful of native calls
// instead of a JS loop over every character.
//
// Semantics (csv-reader 1.0.0, make.fun's own policy):
//   - a U+FEFF at the very start is dropped;
//   - a record ends at LF or CRLF; a line left with no characters is no record;
//   - outside quotes a CR not followed by LF is dropped (stray_cr);
//   - a field opening with a quote runs to the next non-doubled quote, "" inside
//     is one quote, CRLF / lone CR inside quotes each read as LF; what follows
//     the closing quote up to the next comma or line break is appended as it
//     stands (quote_junk, when the field ends); a quote that never closes is a
//     literal character and the text after it is read again as unquoted
//     (unterminated_quote);
//   - a quote inside an unquoted field is a literal character; fields stay
//     strings, never trimmed or converted;
//   - columns is the first record when header is true, else null; rows holds
//     the records after it, each padded with "" (short_row) or cut (long_row)
//     to the first record's width;
//   - each error is {code, line, row} in the order met, line the 1-based line
//     its record starts on, row its record's index in rows (null for header).

// Next delimiter for an unquoted field: comma, CR or LF.
const UQ = /[,\r\n]/g;
// Next special inside a quoted field: quote, CR or LF.
const Q = /["\r\n]/g;

/** csv-reader 1.0.0's answer for one case's input. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;
  const len = text.length;

  let pos = 0;
  let line = 1;
  if (text[0] === '\uFEFF') pos = 1;

  let recordLine = 1;
  let recordRow = null;

  function error(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  // Reads unquoted characters onto `value` up to the next comma or line break.
  // A CR not followed by LF is dropped (stray_cr). Returns the field and how
  // it ended; `added` counts the characters kept.
  function readUnquoted(value) {
    let added = 0;
    for (;;) {
      UQ.lastIndex = pos;
      const m = UQ.exec(text);
      if (m === null) {
        if (pos < len) {
          value += text.slice(pos);
          added += len - pos;
        }
        pos = len;
        return { value, ended: 'end', added };
      }
      const i = m.index;
      const code = text.charCodeAt(i);
      if (code === 44) { // ','
        value += text.slice(pos, i);
        added += i - pos;
        pos = i + 1;
        return { value, ended: 'comma', added };
      }
      if (code === 10) { // '\n'
        value += text.slice(pos, i);
        added += i - pos;
        pos = i + 1;
        line += 1;
        return { value, ended: 'line break', added };
      }
      // code === 13 ('\r')
      value += text.slice(pos, i);
      added += i - pos;
      if (text[i + 1] === '\n') {
        pos = i + 2;
        line += 1;
        return { value, ended: 'line break', added };
      }
      error('stray_cr');
      pos = i + 1;
    }
  }

  // Reads a quoted field whose opening quote is at pos.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    let value = '';
    pos += 1;
    let closed = false;
    for (;;) {
      Q.lastIndex = pos;
      const m = Q.exec(text);
      if (m === null) {
        value += text.slice(pos);
        pos = len;
        break;
      }
      const i = m.index;
      const code = text.charCodeAt(i);
      if (code === 34) { // '"'
        if (text[i + 1] === '"') {
          value += text.slice(pos, i);
          value += '"';
          pos = i + 2;
          continue;
        }
        value += text.slice(pos, i);
        pos = i + 1;
        closed = true;
        break;
      }
      if (code === 13) { // '\r'
        value += text.slice(pos, i);
        value += '\n';
        line += 1;
        pos = i + (text[i + 1] === '\n' ? 2 : 1);
        continue;
      }
      // code === 10 ('\n')
      value += text.slice(pos, i);
      value += '\n';
      line += 1;
      pos = i + 1;
    }
    if (!closed) {
      // The quote never closes: it is a literal character, and the text after
      // it is read again as unquoted.
      pos = open + 1;
      line = openLine;
      error('unterminated_quote');
      return readUnquoted('"');
    }
    if (pos >= len) return { value, ended: 'end' };
    const c = text[pos];
    if (c === ',') {
      pos += 1;
      return { value, ended: 'comma' };
    }
    if (c === '\n') {
      pos += 1;
      line += 1;
      return { value, ended: 'line break' };
    }
    if (c === '\r' && text[pos + 1] === '\n') {
      pos += 2;
      line += 1;
      return { value, ended: 'line break' };
    }
    // What follows the closing quote is appended as it stands, up to the next
    // comma or line break.
    const junk = readUnquoted(value);
    if (junk.added > 0) error('quote_junk');
    return junk;
  }

  for (;;) {
    // Lines with no characters are no records.
    while (pos < len) {
      if (text[pos] === '\n') {
        pos += 1;
        line += 1;
      } else if (text[pos] === '\r' && text[pos + 1] === '\n') {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= len) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let field;
    let quoted;
    do {
      quoted = text[pos] === '"';
      field = quoted ? readQuoted() : readUnquoted('');
      fields.push(field.value);
    } while (field.ended === 'comma');

    // A line that held only stray CRs is left with no characters: no record
    // (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
