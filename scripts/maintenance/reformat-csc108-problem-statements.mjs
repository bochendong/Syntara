#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const ROOT = process.cwd();
const DEFAULT_COURSE_ID = 'cmpnueg4p001d8o017jee1mjq';
const DEFAULT_SOURCE_PATH = 'queue/production-csc108-questions.json';
const SOURCE_FILE_NAME = 'production-csc108-questions.json';
const STATEMENT_FORMAT = 'title-description-examples-constraints-v2';

const TITLE_OVERRIDES = new Map(
  Object.entries({
    calculate_area: 'Calculate Rectangle Area',
    is_even: 'Check Even Number',
    convert_temperature: 'Convert Celsius to Fahrenheit',
    is_in_range: 'Check Inclusive Range',
    calculate_discount: 'Apply Percentage Discount',
    swap_values: 'Swap Two Values',
    get_absolute_difference: 'Absolute Difference',
    words_frequency: 'Word Frequency Map',
    count_values: 'Count Dictionary Values',
    get_max_value_key: 'Key With Maximum Value',
    sum_nested_values: 'Sum Nested Dictionary Values',
    group_by_first_letter: 'Group Words by First Letter',
    sales_by_month: 'Sales by Product and Month',
    grade_distribution: 'Grade Distribution',
    inventory_by_store: 'Inventory by Store',
    workouts_by_exercise: 'Workouts by Exercise',
    complete_person_to_friends: 'Complete Bidirectional Friendships',
    get_inv_doc_freq: 'Inverse Document Frequency',
    encode_message: 'Encode Message',
    update_frequency: 'Update Frequency Counts',
    is_anagrams: 'Check Anagrams',
    isomorphic: 'Isomorphic Strings',
    spending_by_category: 'Spending by Category',
    merge_dictionaries: 'Merge Dictionaries',
    invert_dictionary: 'Invert Dictionary',
    filter_by_value: 'Filter Dictionary by Value',
    reverse_list: 'Reverse List',
    find_max: 'Find Maximum Value',
    find_max_index: 'Index of Maximum Value',
    filter_positive: 'Filter Positive Numbers',
    sum_list: 'Sum List',
    count_even: 'Count Even Numbers',
    remove_duplicates: 'Remove Duplicates',
    swap_rows_and_columns: 'Transpose Square Grid In Place',
    valid_teams: 'Valid Teams',
    sum_string: 'Alternating Digit Sum',
    substring_with_largest_sum: 'Substring With Largest Alternating Sum',
    longest_chain: 'Longest Starting Chain of Ones',
    create_pattern_string: 'Repeating Pattern String',
    get_all_substrings: 'All Substrings',
    time_on_task: 'Maximum Chores in Time',
    TicTacToe: 'Tic-Tac-Toe Game',
    Room: 'Hotel Room',
    BankAccount: 'Bank Account',
    Student: 'Student Gradebook',
    Book: 'Library Book',
    find_email: 'Find Email Address',
    find_temperature: 'Find Temperature',
    find_canadian_postal_codes: 'Find Canadian Postal Codes',
    find_hex_colors_6: 'Find Hex Color Codes',
    extract_dates: 'Extract Dates',
    is_triangle_string: 'Triangle String',
    my_find: 'Implement Find',
    my_split: 'Implement Split',
    get_flyer_info: 'Extract Flyer Number',
    visits_airport: 'Check Ticket Airport Visit',
    get_seat_type: 'Seat Type',
    is_valid_seat: 'Valid Seat',
    is_valid_flyer: 'Valid Flyer Number',
    is_valid_ticket: 'Valid Ticket',
    days_until: 'Days Until Flight',
    word_pattern: 'Word Pattern',
    is_palindrome: 'Palindrome String',
    is_triple_string: 'Triple String',
    count_vowels: 'Count Vowels',
    is_postal_code: 'Canadian Postal Code',
    has_3_consecutive_letters: 'Three Consecutive Letters',
    find_first_uppercase: 'First Uppercase Letter',
    letters_first_digits_last: 'Letters Before Digits',
    find_palindrome_words: 'Count Palindrome Words',
  }),
);

const CONSTRAINT_OVERRIDES = new Map(
  Object.entries({
    calculate_area: ['0 <= length <= 10^9', '0 <= width <= 10^9'],
    is_even: ['-10^9 <= n <= 10^9'],
    convert_temperature: ['-10^9 <= celsius <= 10^9'],
    is_in_range: ['-10^9 <= low <= n <= high <= 10^9'],
    calculate_discount: ['0 <= price <= 10^9', '0 <= discount_percent <= 100'],
    swap_values: ['-10^9 <= a <= 10^9', '-10^9 <= b <= 10^9'],
    get_absolute_difference: ['-10^9 <= a <= 10^9', '-10^9 <= b <= 10^9'],
    find_max: ['1 <= len(lst) <= 10^4', '-10^9 <= lst[i] <= 10^9'],
    find_max_index: ['1 <= len(lst) <= 10^4', '-10^9 <= lst[i] <= 10^9'],
    filter_positive: ['0 <= len(lst) <= 10^4', '-10^9 <= lst[i] <= 10^9'],
    sum_list: ['0 <= len(lst) <= 10^4', '-10^9 <= lst[i] <= 10^9'],
    count_even: ['0 <= len(lst) <= 10^4', '-10^9 <= lst[i] <= 10^9'],
    swap_rows_and_columns: [
      '2 <= len(grid) <= 10^3',
      'len(grid[i]) == len(grid)',
      '-10^9 <= grid[i][j] <= 10^9',
      'Modify grid in place.',
    ],
    sum_string: ['0 <= len(string) <= 10^4', 'string contains only digits 0-9'],
    substring_with_largest_sum: [
      '0 <= len(string) <= 10^3',
      'string contains only digits 0-9',
      'Use sum_string() as a helper.',
    ],
    longest_chain: ['0 <= len(lst) <= 10^4', 'lst[i] is either 0 or 1', 'Use a while loop.'],
    create_pattern_string: ['1 <= len(base) <= 10^4', '0 <= length <= 10^4'],
    get_all_substrings: ['0 <= len(s) <= 10^3'],
    time_on_task: ['0 <= total <= 10^9', '0 <= len(chores) <= 10^4', '1 <= chores[i] <= 10^9'],
    get_inv_doc_freq: [
      '2 <= len(L) <= 10^4',
      'word appears in at least one dictionary in L',
      'Each item in L is a term-frequency dictionary.',
    ],
    grade_distribution: ['0 <= score <= 100', "Grade levels are 'A', 'B', 'C', 'D', and 'F'."],
    workouts_by_exercise: [
      '0 <= len(schedule) <= 10^4',
      '1 <= len(inner_list)',
      'Do not mutate schedule.',
    ],
    spending_by_category: ['0 <= len(d) <= 10^4', '1 <= len(inner_list)', 'Do not mutate d.'],
    reverse_list: ['0 <= len(lst) <= 10^4', 'Do not mutate lst.'],
    valid_teams: [
      '0 <= len(teams) <= 10^4',
      '0 <= len(teams[i]) <= 10^4',
      '0 <= len(students) <= 10^4',
      'Return teams with exactly two members in students.',
    ],
    find_email: [
      '0 <= len(s) <= 10^4',
      's contains at most one email address.',
      '1 <= len(name) <= 12',
      'domain contains only digits and is divisible by 5',
      "email ends with '.com' or '.ca'",
      'Do not use loops; use the re library.',
    ],
    find_temperature: [
      '0 <= len(s) <= 10^4',
      "A valid temperature has the form '<integer>C'.",
      'Use re.search to find the first match.',
    ],
    find_canadian_postal_codes: [
      '0 <= len(s) <= 10^4',
      "Postal code format is 'A1A 1A1' or 'A1A1A1'.",
      'Letters are case-insensitive A-Z.',
      'Digits are 0-9.',
      'Use re.findall to return all matches.',
    ],
    find_hex_colors_6: [
      '0 <= len(s) <= 10^4',
      "A valid color starts with '#'.",
      'Exactly 6 hexadecimal characters follow #.',
      'Hex characters are 0-9, A-F, or a-f.',
      'Use re.findall to return all matches.',
    ],
    extract_dates: [
      '0 <= len(s) <= 10^4',
      'Date format is YYYY-MM-DD.',
      '01 <= month <= 12',
      '01 <= day <= 31',
      'Return (year, month, day) tuples.',
    ],
    is_triangle_string: [
      '1 <= len(string) <= 10^4',
      'string contains exactly three different characters.',
      'Exactly two adjacent positions contain different characters.',
      'Use exists_triangle() as a helper.',
    ],
    is_postal_code: [
      'len(s) == 7',
      "Format is 'A1A 1A1'.",
      'Letters are A-Z or a-z.',
      'Digits are 0-9.',
    ],
    has_3_consecutive_letters: [
      '0 <= len(s) <= 10^4',
      'Consecutive letters are checked alphabetically.',
    ],
    find_first_uppercase: ['0 <= len(s) <= 10^4'],
    letters_first_digits_last: [
      '0 <= len(s) <= 10^4',
      'Ignore characters that are neither letters nor digits.',
    ],
    find_palindrome_words: ['0 <= len(s) <= 10^4', 'Words are separated by spaces.'],
    word_pattern: [
      '1 <= len(pattern) <= 10^4',
      'len(words) == len(pattern)',
      'pattern contains lowercase letters.',
      'Each pattern character maps to exactly one word.',
    ],
    get_flyer_info: [
      'len(ticket) is 17 or 21',
      'Ticket format is YYYYMMDDFFFTTTSSFNNNN.',
      'Flyer number NNNN is optional and starts at index 17.',
    ],
    visits_airport: [
      'len(ticket) is 17 or 21',
      'len(airport) == 3',
      'Airport matching is case-sensitive.',
    ],
    get_seat_type: [
      'len(ticket) is 17 or 21',
      'Seat letter is ticket[16].',
      "Valid seat letters are 'A' through 'F'.",
    ],
    is_valid_seat: [
      'len(ticket) >= 17',
      '1 <= row <= 30',
      "seat letter is one of 'A', 'B', 'C', 'D', 'E', 'F'",
    ],
    is_valid_flyer: [
      'len(ticket) is 17 or 21',
      'Flyer number is empty or exactly 4 digits.',
      '(digit1 + digit2 + digit3) % 10 == digit4',
    ],
    is_valid_ticket: [
      'len(ticket) is 17 or 21',
      'Seat must be valid.',
      'Flyer number must be valid.',
      'From and To airports must be different.',
    ],
    days_until: [
      'len(ticket) is 17 or 21',
      'len(current_date) == 8',
      'Dates use YYYYMMDD.',
      'Each year has 365 days and each month has 30 days.',
      'Days greater than 30 are treated as day 30.',
    ],
    TicTacToe: [
      'len(board) == 9',
      "board[i] is 'X', 'O', or ' '",
      'move_count >= 0',
      "next_player is 'X' or 'O'",
    ],
    Room: [
      'room_number is an integer',
      'guest_name is a string',
      "guest_name == '' means the room is available.",
    ],
    BankAccount: [
      'account_number is a string',
      'initial_balance >= 0',
      'deposit amount > 0',
      'withdraw amount > 0',
    ],
    Student: ['name is a string', '0 <= grade <= 100', 'grades starts empty.'],
    Book: ['title, author, and isbn are strings', 'is_borrowed starts as False.'],
  }),
);

function loadEnvLocal() {
  const envPath = path.join(ROOT, '.env.local');
  if (!fs.existsSync(envPath)) return;

  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
    if (!match || line.trim().startsWith('#')) continue;

    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] ??= value;
  }
}

function argValue(name) {
  const prefix = `--${name}=`;
  const matched = process.argv.find((arg) => arg.startsWith(prefix));
  return matched ? matched.slice(prefix.length).trim() : null;
}

function hasFlag(name) {
  return process.argv.includes(`--${name}`);
}

function extractFunctionSignature(templateCode) {
  const lines = String(templateCode ?? '')
    .split(/\r?\n/)
    .map((item) => item.trimEnd());
  const startIndex = lines.findIndex((item) => /^(def|class)\s+/.test(item.trimStart()));
  if (startIndex === -1) return '';

  const signatureLines = [];
  let parenDepth = 0;
  for (let index = startIndex; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (!line) break;
    signatureLines.push(line);
    for (const char of line) {
      if (char === '(') parenDepth += 1;
      if (char === ')') parenDepth -= 1;
    }
    if (parenDepth <= 0 && /:\s*$/.test(line)) break;
  }

  return signatureLines.join(' ').replace(/\s+/g, ' ').replace(/\s+:/g, ':').trim();
}

function buildProblemTitle(question) {
  const key = String(question.functionName || question.title || '').trim();
  if (TITLE_OVERRIDES.has(key)) return TITLE_OVERRIDES.get(key);

  const words = key
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return words
    ? words.replace(/\b\w/g, (char) => char.toUpperCase())
    : String(question.title || `CSC108 Question ${question.id}`).trim();
}

function splitTopLevelItems(text) {
  const items = [];
  let depth = 0;
  let quote = null;
  let escaped = false;
  let start = 0;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if ('([{'.includes(char)) {
      depth += 1;
      continue;
    }
    if (')]}'.includes(char)) {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (char === ',' && depth === 0) {
      items.push(text.slice(start, index).trim());
      start = index + 1;
    }
  }

  const tail = text.slice(start).trim();
  if (tail) items.push(tail);
  return items;
}

function parseParameters(signature) {
  const match = signature.match(/^def\s+[A-Za-z_][A-Za-z0-9_]*\s*\(([\s\S]*)\)\s*(?:->[\s\S]*)?:$/);
  if (!match) return [];

  return splitTopLevelItems(match[1])
    .map((item) => item.trim())
    .filter((item) => item && item !== 'self')
    .map((item) => {
      const withoutDefault = splitTopLevelItems(item.replace(/=/g, ',='))[0] || item;
      const colonIndex = withoutDefault.indexOf(':');
      if (colonIndex === -1) {
        return { name: withoutDefault.trim(), type: '' };
      }
      return {
        name: withoutDefault.slice(0, colonIndex).trim(),
        type: withoutDefault.slice(colonIndex + 1).trim(),
      };
    })
    .filter((param) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(param.name));
}

function trimBlankEdges(lines) {
  const next = [...lines];
  while (next.length > 0 && !next[0].trim()) next.shift();
  while (next.length > 0 && !next[next.length - 1].trim()) next.pop();
  return next;
}

function normalizeDocText(text) {
  const lines = trimBlankEdges(
    String(text ?? '')
      .replace(/\r\n?/g, '\n')
      .split('\n')
      .map((line) => line.trimEnd()),
  );
  const indentedLines = lines.slice(1).filter((line) => line.trim());
  const commonIndent =
    indentedLines.length > 0
      ? Math.min(...indentedLines.map((line) => line.match(/^ */)?.[0].length ?? 0))
      : 0;

  return trimBlankEdges(
    lines.map((line, index) =>
      index > 0 && commonIndent > 0 && line.startsWith(' '.repeat(commonIndent))
        ? line.slice(commonIndent)
        : line,
    ),
  ).join('\n');
}

function compactStem(text) {
  return trimBlankEdges(
    String(text ?? '')
      .replace(/[ \t]+\n/g, '\n')
      .split('\n'),
  )
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function splitDescriptionAndExamples(description) {
  const lines = normalizeDocText(description).split('\n');
  const stemLines = [];
  const samples = [];

  for (let index = 0; index < lines.length; ) {
    const prompt = lines[index].trim().match(/^>>>\s*(.+)$/);
    if (!prompt) {
      stemLines.push(lines[index]);
      index += 1;
      continue;
    }

    const input = prompt[1].trim();
    const outputLines = [];
    index += 1;

    while (index < lines.length && !lines[index].trim().startsWith('>>>')) {
      outputLines.push(lines[index].trimEnd());
      index += 1;
    }

    samples.push({
      input,
      output: trimBlankEdges(outputLines).join('\n').trim() || '(no output)',
    });
  }

  return {
    stem: compactStem(stemLines.join('\n')),
    samples: samples.slice(0, 12),
  };
}

function extractTestMethods(testCode) {
  const lines = String(testCode ?? '').split(/\r?\n/);
  const methods = [];
  let current = null;

  for (const line of lines) {
    if (/^    def test_/.test(line)) {
      if (current) methods.push(current);
      current = [line];
      continue;
    }
    if (!current) continue;
    if (/^    def /.test(line) || /^if __name__/.test(line)) {
      methods.push(current);
      current = /^    def /.test(line) ? [line] : null;
      continue;
    }
    current.push(line);
  }

  if (current) methods.push(current);
  return methods.map((methodLines) =>
    methodLines
      .slice(1)
      .map((line) => line.replace(/^        /, '').trimEnd())
      .filter((line) => line.trim()),
  );
}

function stripLeadingDocstring(lines) {
  if (!lines[0]?.trim().startsWith('"""')) return lines;
  const [, ...rest] = lines;
  if (lines[0].trim().endsWith('"""') && lines[0].trim() !== '"""') return rest;

  const closingIndex = rest.findIndex((line) => line.trim().endsWith('"""'));
  return closingIndex === -1 ? rest : rest.slice(closingIndex + 1);
}

function splitTopLevelComma(text) {
  let depth = 0;
  let quote = null;
  let escaped = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }
    if ('([{'.includes(char)) {
      depth += 1;
      continue;
    }
    if (')]}'.includes(char)) {
      depth = Math.max(0, depth - 1);
      continue;
    }
    if (char === ',' && depth === 0) {
      return [text.slice(0, index).trim(), text.slice(index + 1).trim()];
    }
  }

  return null;
}

function parseAssertEqual(line) {
  const match = line.trim().match(/^self\.assert(?:Equal|AlmostEqual|True|False)\(([\s\S]+)\)$/);
  if (!match) return null;

  if (line.includes('assertTrue(')) return `${match[1].trim()} is True`;
  if (line.includes('assertFalse(')) return `${match[1].trim()} is False`;

  const args = splitTopLevelComma(match[1]);
  if (!args) return null;
  const [actual, expectedWithOptions] = args;
  const expected = splitTopLevelComma(expectedWithOptions)?.[0] ?? expectedWithOptions;
  return `${actual} == ${expected}`;
}

function buildSamplesFromPublicTests(publicTestCode) {
  const samples = [];

  for (const method of extractTestMethods(publicTestCode)) {
    const body = stripLeadingDocstring(method);
    const result = body.find((line) => /^result\s*=/.test(line))?.replace(/^result\s*=\s*/, '');
    const expected = body
      .find((line) => /^expected\s*=/.test(line))
      ?.replace(/^expected\s*=\s*/, '');
    if (result && expected) {
      samples.push({ input: result, output: expected });
      continue;
    }

    const setupLines = [];
    const outputLines = [];
    for (const line of body) {
      const assertion = parseAssertEqual(line);
      if (assertion) {
        outputLines.push(assertion);
        continue;
      }
      if (/^(result|expected)\s*=/.test(line)) continue;
      setupLines.push(line);
    }

    if (setupLines.length > 0 && outputLines.length > 0) {
      samples.push({
        input: setupLines.join('\n'),
        output: outputLines.join('\n'),
      });
    }
  }

  return samples.slice(0, 3);
}

function replaceFirstDocstring(code, stem) {
  const lines = String(code ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n');
  const startIndex = lines.findIndex((line) => line.trim().startsWith('"""'));
  if (startIndex === -1 || !stem.trim()) return code;

  const startLine = lines[startIndex];
  const indent = startLine.match(/^ */)?.[0] ?? '';
  const singleLineDocstring =
    startLine.trim().length > 3 && startLine.trim().slice(3).includes('"""');
  const endIndex = singleLineDocstring
    ? startIndex
    : lines.findIndex((line, index) => index > startIndex && line.trim().endsWith('"""'));
  if (endIndex === -1) return code;

  const docstring = [
    `${indent}"""`,
    ...stem.split('\n').map((line) => (line.trim() ? `${indent}${line}` : indent)),
    `${indent}"""`,
  ];

  return [...lines.slice(0, startIndex), ...docstring, ...lines.slice(endIndex + 1)].join('\n');
}

function stripDoctestsFromCodeDocstrings(code) {
  const lines = String(code ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n');
  const output = [];
  let inDocstring = false;
  let skippingDoctest = false;

  for (const line of lines) {
    const trimmed = line.trim();
    const hasTripleQuote = trimmed.includes('"""');
    const closesDocstring = inDocstring && hasTripleQuote;

    if (!inDocstring) {
      output.push(line);
      if (hasTripleQuote && !(trimmed.length > 3 && trimmed.slice(3).includes('"""'))) {
        inDocstring = true;
      }
      continue;
    }

    if (closesDocstring) {
      output.push(line);
      inDocstring = false;
      skippingDoctest = false;
      continue;
    }

    if (trimmed.startsWith('>>>')) {
      skippingDoctest = true;
      continue;
    }

    if (skippingDoctest) {
      if (!trimmed) skippingDoctest = false;
      continue;
    }

    output.push(line);
  }

  return output.join('\n').replace(/\n{3,}(\s*""")/g, '\n$1');
}

function collectSourceNotes(stem) {
  const notes = [];
  const lines = stem.split('\n');

  for (let index = 0; index < lines.length; index += 1) {
    const trimmed = lines[index].trim();
    if (!/^(?:Preconditions?|Note):/i.test(trimmed)) continue;

    const block = [trimmed];
    for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
      const next = lines[cursor];
      if (!next.trim()) break;
      if (/^\S/.test(next) && !/^\s*[-*]/.test(next)) break;
      block.push(next.trim());
      index = cursor;
    }
    notes.push(block.join(' ').replace(/\s+/g, ' '));
  }

  return notes;
}

function hasNonEmptyPrecondition(stem, paramName) {
  const pattern = new RegExp(`(?:${paramName}|dictionary|list|grid)[^\\n.]*not empty`, 'i');
  return pattern.test(stem) || /non-empty/i.test(stem);
}

function rangeForNumberParam(name) {
  if (/discount/.test(name)) return `0 <= ${name} <= 100`;
  if (
    /^(price|length|width|total|amount|initial_balance|balance|grade|score|row|move_count)$/.test(
      name,
    )
  ) {
    return `0 <= ${name} <= 10^9`;
  }
  return `-10^9 <= ${name} <= 10^9`;
}

function inferParameterConstraints(signature, stem) {
  const params = parseParameters(signature);
  const constraints = [];

  for (const param of params) {
    const name = param.name;
    const type = param.type;
    const lowerType = type.toLowerCase();

    if (name === 'ticket') {
      constraints.push('len(ticket) is 17 or 21');
      continue;
    }
    if (name === 'current_date') {
      constraints.push('len(current_date) == 8');
      continue;
    }
    if (name === 'airport') {
      constraints.push('len(airport) == 3');
      continue;
    }

    if (
      lowerType.includes('list') ||
      ['lst', 'los', 'words', 'teams', 'students', 'chores', 'L'].includes(name)
    ) {
      const minLength = hasNonEmptyPrecondition(stem, name) ? 1 : 0;
      constraints.push(`${minLength} <= len(${name}) <= 10^4`);
      if (/int|float|number/i.test(type) || ['chores'].includes(name)) {
        constraints.push(`-10^9 <= ${name}[i] <= 10^9`);
      }
      if (/str/i.test(type) || ['words', 'los'].includes(name)) {
        constraints.push(`0 <= len(${name}[i]) <= 100`);
      }
      continue;
    }

    if (
      lowerType.includes('dict') ||
      /^d\d?$|freq|encoding|data|students|orders|schedule|p2f$/.test(name)
    ) {
      const minLength = hasNonEmptyPrecondition(stem, name) ? 1 : 0;
      constraints.push(`${minLength} <= len(${name}) <= 10^4`);
      if (/int|float/i.test(type)) constraints.push(`-10^9 <= ${name}[key] <= 10^9`);
      continue;
    }

    if (
      lowerType.includes('str') ||
      ['s', 'string', 'message', 'substring', 'delimiter', 'word', 'pattern'].includes(name)
    ) {
      const minLength = ['delimiter', 'word', 'pattern'].includes(name) ? 1 : 0;
      constraints.push(`${minLength} <= len(${name}) <= 10^4`);
      continue;
    }

    if (lowerType.includes('int') || lowerType.includes('float') || !type) {
      constraints.push(rangeForNumberParam(name));
    }
  }

  if (
    params.some((param) => param.name === 'low') &&
    params.some((param) => param.name === 'high')
  ) {
    constraints.push('low <= high');
  }
  if (/must not mutate|without modifying|should not mutate|not mutate/i.test(stem)) {
    const firstMutable = params.find((param) => /list|dict/i.test(param.type))?.name || 'input';
    constraints.push(`Do not mutate ${firstMutable}.`);
  }
  if (/order does not matter in dictionaries/i.test(stem)) {
    constraints.push('Dictionary key order does not matter.');
  }

  return constraints;
}

function collectExplicitConstraints(stem) {
  const constraints = [];
  const normalized = stem.replace(/\r\n?/g, '\n');

  for (const line of normalized.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const bullet = trimmed.match(/^[-*]\s+(.+)$/)?.[1];
    if (bullet && !/^Examples? of/i.test(bullet)) {
      constraints.push(bullet.replace(/\.$/, ''));
      continue;
    }
    if (/^Precondition:/i.test(trimmed)) {
      constraints.push(trimmed.replace(/^Precondition:\s*/i, '').replace(/\.$/, ''));
    }
    if (/^Assume /i.test(trimmed)) {
      constraints.push(trimmed.replace(/\.$/, ''));
    }
  }

  if (/Grade ranges:/i.test(normalized)) {
    constraints.push('A: 90-100, B: 80-89, C: 70-79, D: 60-69, F: 0-59');
  }
  if (/Ticket format: YYYYMMDDFFFTTTSSFNNNN/i.test(normalized)) {
    constraints.push('Ticket format is YYYYMMDDFFFTTTSSFNNNN.');
  }
  if (/Current date format: YYYYMMDD/i.test(normalized)) {
    constraints.push('current_date format is YYYYMMDD.');
  }

  return constraints;
}

function uniqueValues(values) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function buildConstraints({ question, signature, stem }) {
  const key = String(question.functionName || question.title || '').trim();
  const override = CONSTRAINT_OVERRIDES.get(key);
  if (override) return uniqueValues(override).slice(0, 16);

  return uniqueValues([
    ...collectExplicitConstraints(stem),
    ...inferParameterConstraints(signature, stem),
  ]).slice(0, 16);
}

function sourceQuestionsById(sourceData) {
  const questions = [];
  for (const templateExport of sourceData.templateExports ?? []) {
    if (Array.isArray(templateExport?.questions)) questions.push(...templateExport.questions);
  }
  return new Map(questions.map((question) => [String(question.id), question]));
}

function buildStructuredContent(question, existingContent) {
  const signature =
    existingContent.functionSignature || extractFunctionSignature(question.templateCode) || '';
  const { stem, samples } = splitDescriptionAndExamples(question.description);
  const publicTestSamples =
    samples.length > 0 ? [] : buildSamplesFromPublicTests(question.publicTestCode);

  return {
    ...existingContent,
    stem: stem || existingContent.stem || String(question.description ?? '').trim(),
    starterCode:
      existingContent.starterCode && stem
        ? stripDoctestsFromCodeDocstrings(replaceFirstDocstring(existingContent.starterCode, stem))
        : existingContent.starterCode,
    functionSignature: signature || existingContent.functionSignature,
    sampleIO:
      samples.length > 0
        ? samples
        : publicTestSamples.length > 0
          ? publicTestSamples
          : (existingContent.sampleIO ?? []),
    constraints: buildConstraints({ question, signature, stem }),
  };
}

async function main() {
  loadEnvLocal();
  const write = hasFlag('write');
  const courseId = argValue('course-id') || DEFAULT_COURSE_ID;
  const sourcePath = argValue('source') || DEFAULT_SOURCE_PATH;
  const absoluteSourcePath = path.resolve(ROOT, sourcePath);
  const sourceData = JSON.parse(fs.readFileSync(absoluteSourcePath, 'utf8'));
  const questionById = sourceQuestionsById(sourceData);

  const prisma = new PrismaClient();
  try {
    const rows = await prisma.notebookProblem.findMany({
      where: {
        OR: [{ courseId }, { notebook: { courseId } }],
        sourceMeta: {
          path: ['sourceFileName'],
          equals: SOURCE_FILE_NAME,
        },
      },
      select: {
        id: true,
        title: true,
        publicContentJson: true,
        sourceMeta: true,
      },
      orderBy: [{ problemNumber: 'asc' }, { createdAt: 'asc' }],
    });

    const updates = [];
    const missingSourceQuestionIds = [];

    for (const row of rows) {
      const sourceMeta =
        row.sourceMeta && typeof row.sourceMeta === 'object' && !Array.isArray(row.sourceMeta)
          ? row.sourceMeta
          : {};
      const sourceQuestionId = String(sourceMeta.sourceQuestionId ?? '');
      const sourceQuestion = questionById.get(sourceQuestionId);
      if (!sourceQuestion) {
        missingSourceQuestionIds.push(sourceQuestionId || row.id);
        continue;
      }

      const existingContent =
        row.publicContentJson &&
        typeof row.publicContentJson === 'object' &&
        !Array.isArray(row.publicContentJson)
          ? row.publicContentJson
          : {};

      if (existingContent.type !== 'code') continue;

      const publicContentJson = buildStructuredContent(sourceQuestion, existingContent);
      updates.push({
        id: row.id,
        title: buildProblemTitle(sourceQuestion),
        previousTitle: row.title,
        sourceQuestionId,
        publicContentJson,
        sourceMeta: {
          ...sourceMeta,
          statementFormat: STATEMENT_FORMAT,
          titleFormat: 'readable-title-v1',
        },
      });
    }

    console.log(
      JSON.stringify(
        {
          mode: write ? 'write' : 'dry-run',
          courseId,
          matchedCsc108Problems: rows.length,
          updateCount: updates.length,
          missingSourceQuestionIds,
          preview: updates.slice(0, 3).map((update) => ({
            previousTitle: update.previousTitle,
            title: update.title,
            stem: update.publicContentJson.stem,
            sampleIO: update.publicContentJson.sampleIO,
            constraints: update.publicContentJson.constraints,
          })),
        },
        null,
        2,
      ),
    );

    if (!write) return;

    await prisma.$transaction(
      updates.map((update) =>
        prisma.notebookProblem.update({
          where: { id: update.id },
          data: {
            title: update.title,
            publicContentJson: update.publicContentJson,
            sourceMeta: update.sourceMeta,
          },
        }),
      ),
    );

    console.log(
      JSON.stringify(
        {
          status: 'updated',
          updatedProblems: updates.length,
          statementFormat: STATEMENT_FORMAT,
        },
        null,
        2,
      ),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
