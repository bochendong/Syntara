#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

const ROOT = process.cwd();
const DEFAULT_COURSE_ID = 'cmpnueg4p001d8o017jee1mjq';

const SOLUTIONS = {
  'CSC108H5_Midterm_2025_V1.pdf::Q31': `
def alt_case(s: str) -> str:
    result = ''
    for i in range(len(s)):
        if i % 2 == 0:
            result = result + s[i].upper()
        else:
            result = result + s[i].lower()
    return result
`.trim(),

  'CSC108H5_Midterm_2025_V1.pdf::Q32': `
def average_temperature(temps: list[float]) -> int:
    if temps == []:
        return 0

    total = 0.0
    for temp in temps:
        total = total + temp
    return round(total / len(temps))


def second_hottest(temps: list[float]) -> int:
    hottest = None
    second = None

    for temp in temps:
        if hottest is None or temp > hottest:
            if hottest is not None and temp != hottest:
                second = hottest
            hottest = temp
        elif temp != hottest and (second is None or temp > second):
            second = temp

    if second is None:
        return 0
    return round(second)
`.trim(),

  'CSC108H5_Midterm_2025_V1.pdf::Q33': `
def mark_boundaries(items: list[str]) -> list[str]:
    if items == []:
        return []

    result = [items[0]]
    for i in range(1, len(items)):
        if items[i] != items[i - 1]:
            result.append('---')
        result.append(items[i])
    return result
`.trim(),

  '06_MidReview.pdf::MR-052': `
def has_uppercase(s: str) -> bool:
    for char in s:
        if char.isupper():
            return True
    return False
`.trim(),

  '06_MidReview.pdf::MR-053': `
def lower_count(s: str) -> int:
    acc = 0
    for char in s:
        if char.islower():
            acc += 1
    return acc
`.trim(),

  '06_MidReview.pdf::MR-054': `
def upper_count(s: str) -> int:
    acc = 0
    for c in s:
        if c.isupper():
            acc += 1
    return acc
`.trim(),

  '06_MidReview.pdf::MR-055': `
def in_order(i: int, j: int, k: int) -> bool:
    return (i <= j <= k) or (i >= j >= k)
`.trim(),

  '06_MidReview.pdf::MR-056': `
def mystery_fun(s: str) -> str:
    return s + s[::-1]
`.trim(),

  '06_MidReview.pdf::MR-057': `
def findmax(lst: list[int]) -> int:
    max_val = lst[0]
    for i in range(1, len(lst)):
        if lst[i] > max_val:
            max_val = lst[i]
    return max_val
`.trim(),

  '06_MidReview.pdf::MR-058': `
def reverselist(lst: list[int]) -> list[int]:
    for i in range(len(lst) // 2):
        opposite = len(lst) - 1 - i
        lst[i], lst[opposite] = lst[opposite], lst[i]
    return lst
`.trim(),

  '06_MidReview.pdf::MR-073': `
def count_vowels(s: str) -> int:
    count = 0
    for char in s:
        if char.lower() in 'aeiou':
            count += 1
    return count
`.trim(),

  '06_MidReview.pdf::MR-074': `
def is_postal_code(s: str) -> bool:
    if len(s) != 7:
        return False
    return (
        s[0].isalpha()
        and s[1].isdigit()
        and s[2].isalpha()
        and s[3] == ' '
        and s[4].isdigit()
        and s[5].isalpha()
        and s[6].isdigit()
    )
`.trim(),

  '06_MidReview.pdf::MR-075': `
def has_3_consecutive_letters(s: str) -> bool:
    run = 0
    for char in s:
        if char.isalpha():
            run += 1
            if run >= 3:
                return True
        else:
            run = 0
    return False
`.trim(),

  '06_MidReview.pdf::MR-076': `
def find_first_uppercase(s: str) -> int:
    for i in range(len(s)):
        if s[i].isupper():
            return i
    return -1
`.trim(),

  '06_MidReview.pdf::MR-077': `
def letters_first_digits_last(s: str) -> str:
    letters = ''
    digits = ''
    for char in s:
        if char.isalpha():
            letters = letters + char
        elif char.isdigit():
            digits = digits + char
    return letters + digits
`.trim(),

  '06_MidReview.pdf::MR-078': `
def find_palindrome_words(s: str) -> int:
    count = 0
    for word in s.split():
        if word == word[::-1]:
            count += 1
    return count
`.trim(),

  '06_MidReview.pdf::MR-079': `
def create_pattern_string(base: str, length: int) -> str:
    if length <= 0 or base == '':
        return ''
    if len(base) <= 2:
        pattern = base
    else:
        pattern = base + base[-2:0:-1]

    result = ''
    while len(result) < length:
        result = result + pattern
    return result[:length]
`.trim(),

  '06_MidReview.pdf::MR-080': `
def my_find(s: str, substring: str) -> int:
    if substring == '':
        return 0

    for i in range(len(s) - len(substring) + 1):
        if s[i:i + len(substring)] == substring:
            return i
    return -1
`.trim(),

  '06_MidReview.pdf::MR-081': `
def my_split(s: str, delimiter: str) -> list[str]:
    if delimiter == '':
        return [s]

    result = []
    start = 0

    while True:
        split_at = -1
        for i in range(start, len(s) - len(delimiter) + 1):
            if s[i:i + len(delimiter)] == delimiter:
                split_at = i
                break

        if split_at == -1:
            break

        result.append(s[start:split_at])
        start = split_at + len(delimiter)

    result.append(s[start:])
    return result
`.trim(),

  '06_MidReview.pdf::MR-082': `
def get_all_substrings(s: str) -> list:
    result = []
    for start in range(len(s)):
        for end in range(start + 1, len(s) + 1):
            result.append(s[start:end])
    return result
`.trim(),

  '06_MidReview.pdf::MR-083': `
def time_on_task(total: int, chores: list[int]) -> int:
    elapsed = 0
    count = 0
    for chore in sorted(chores):
        if elapsed + chore <= total:
            elapsed += chore
            count += 1
    return count
`.trim(),

  '06_MidReview.pdf::MR-084': `
def rovarspraket(word: str) -> str:
    vowels = 'aeiou'
    alphabet = 'abcdefghijklmnopqrstuvwxyz'
    result = ''

    for char in word:
        if char in vowels:
            result = result + char
        else:
            closest = vowels[0]
            for vowel in vowels:
                if abs(alphabet.index(vowel) - alphabet.index(char)) < abs(
                    alphabet.index(closest) - alphabet.index(char)
                ):
                    closest = vowel

            if char == 'z':
                next_consonant = 'z'
            else:
                next_index = alphabet.index(char) + 1
                while alphabet[next_index] in vowels:
                    next_index += 1
                next_consonant = alphabet[next_index]

            result = result + char + closest + next_consonant

    return result
`.trim(),

  '06_MidReview.pdf::MR-085': `
def flip_grid(flips: str) -> str:
    grid = [[1, 2], [3, 4]]

    for flip in flips:
        if flip == 'H':
            grid = [grid[1], grid[0]]
        elif flip == 'V':
            grid = [[row[1], row[0]] for row in grid]

    return f'{grid[0][0]} {grid[0][1]}\\n{grid[1][0]} {grid[1][1]}'
`.trim(),

  '06_MidReview.pdf::MR-086': `
def arrival_time(departure: str) -> str:
    hour = int(departure[:2])
    minute = int(departure[3:])
    current = hour * 60 + minute
    remaining = 240

    while remaining > 0:
        time_of_day = current % (24 * 60)
        in_rush_hour = (7 * 60 <= time_of_day < 10 * 60) or (
            15 * 60 <= time_of_day < 19 * 60
        )
        if in_rush_hour:
            remaining -= 1
        else:
            remaining -= 2
        current += 1

    current = current % (24 * 60)
    return f'{current // 60:02d}:{current % 60:02d}'
`.trim(),

  '06_MidReview.pdf::MR-087': `
def restore_sunflowers(grid: list[list[int]]) -> list[list[int]]:
    def is_restored(table: list[list[int]]) -> bool:
        for row in table:
            if row != sorted(row):
                return False
        for col in range(len(table[0])):
            values = []
            for row in range(len(table)):
                values.append(table[row][col])
            if values != sorted(values):
                return False
        return True

    def rotate_clockwise(table: list[list[int]]) -> list[list[int]]:
        rotated = []
        for col in range(len(table[0])):
            row = []
            for old_row in range(len(table) - 1, -1, -1):
                row.append(table[old_row][col])
            rotated.append(row)
        return rotated

    for _ in range(4):
        if is_restored(grid):
            return grid
        grid = rotate_clockwise(grid)
    return grid
`.trim(),

  'CSC108H5F_FinalExam_2025_Questions.pdf::Q24': `
def test_double_positives_mutates() -> None:
    original = [1, -2, 3]
    same_list = original

    result = double_positives(original)

    assert original is same_list
    assert result is None
    assert original == [2, -2, 6]
`.trim(),

  'CSC108H5F_FinalExam_2025_Questions.pdf::Q25': `
def test_copy_matrix_deep_copy() -> None:
    original = [[1, 2], [3, 4]]
    copied = copy_matrix(original)

    assert copied == original
    assert copied is not original
    for i in range(len(original)):
        assert copied[i] is not original[i]
`.trim(),

  'CSC108H5F_FinalExam_2025_Questions.pdf::Q26': `
def test_remove_negatives_no_mutation() -> None:
    original = [1, -2, 3, -4]
    result = remove_negatives(original)

    assert result == [1, 3]
    assert original == [1, -2, 3, -4]
    assert result is not original
`.trim(),

  'CSC108H5F_FinalExam_2025_Questions.pdf::Q27': `
def write_tree(filename: str, height: int) -> None:
    """Write a tree pattern to <filename> with <height> rows."""
    with open(filename, 'w') as file:
        for row in range(height):
            spaces = height - row - 1
            stars = row * 2 + 1
            file.write(' ' * spaces + '*' * stars + ' ' * spaces + '\\n')
`.trim(),

  'CSC108H5F_FinalExam_2025_Questions.pdf::Q28': String.raw`
pattern = r'([a-z0-9]+)\.uoft([A-Z]{3})'
`.trim(),

  'CSC108H5F_FinalExam_2025_Questions.pdf::Q31': `
def get_ev_brands(filename: str) -> list[str]:
    """Return brands of all fully electric vehicles in <filename>."""
    brands = []
    with open(filename) as file:
        for line in file:
            fields = line.strip().split(',')
            for i in range(len(fields)):
                fields[i] = fields[i].strip()
            if len(fields) >= 4 and fields[3] == 'EV':
                brands.append(fields[0])
    return brands
`.trim(),

  'CSC108H5F_FinalExam_2025_Questions.pdf::Q32a': `
class Person:
    """A person with a name and friends."""

    def __init__(self, name: str):
        self.name = name
        self.friends = []

    def __str__(self):
        return f'{self.name} ({len(self.friends)} friends)'

    def add_friend(self, other):
        if other not in self.friends:
            self.friends.append(other)
`.trim(),

  'CSC108H5F_FinalExam_2025_Questions.pdf::Q32b': `
class Network:
    """A social network mapping names to Person objects."""

    def __init__(self):
        self.members = {}

    def add_person(self, name: str) -> None:
        if name not in self.members:
            self.members[name] = Person(name)

    def get_person(self, name: str) -> Person:
        return self.members[name]
`.trim(),

  'CSC108H5F_FinalExam_2025_Questions.pdf::Q32c': `
class Network:
    """A social network mapping names to Person objects."""

    def __init__(self):
        self.members = {}

    def add_person(self, name: str) -> None:
        if name not in self.members:
            self.members[name] = Person(name)

    def get_person(self, name: str) -> Person:
        return self.members[name]

    def get_most_popular(self) -> list[str]:
        if self.members == {}:
            return []

        counts = {}
        for name in self.members:
            counts[name] = 0

        for person in self.members.values():
            for friend in person.friends:
                counts[friend.name] += 1

        highest = None
        for count in counts.values():
            if highest is None or count > highest:
                highest = count

        result = []
        for name in counts:
            if counts[name] == highest:
                result.append(name)
        return sorted(result)
`.trim(),
};

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

function objectValue(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function solutionKey(row) {
  const sourceMeta = objectValue(row.sourceMeta);
  const fileName = sourceMeta.sourceFileName;
  const sourceQuestionId = sourceMeta.sourceQuestionId;
  if (typeof fileName !== 'string' || typeof sourceQuestionId !== 'string') return null;
  return `${fileName}::${sourceQuestionId}`;
}

async function main() {
  loadEnvLocal();
  const write = hasFlag('write');
  const courseId = argValue('course-id') || DEFAULT_COURSE_ID;

  const prisma = new PrismaClient();
  try {
    const rows = await prisma.notebookProblem.findMany({
      where: {
        type: 'code',
        OR: [{ courseId }, { notebook: { courseId } }],
      },
      select: {
        id: true,
        title: true,
        gradingJson: true,
        sourceMeta: true,
      },
      orderBy: [{ problemNumber: 'asc' }, { createdAt: 'asc' }],
    });

    const updates = [];
    const matched = [];
    const unmatchedSolutionKeys = new Set(Object.keys(SOLUTIONS));

    for (const row of rows) {
      const key = solutionKey(row);
      if (!key || !(key in SOLUTIONS)) continue;

      unmatchedSolutionKeys.delete(key);
      matched.push({ id: row.id, title: row.title, key });

      const solutionCode = SOLUTIONS[key].trim();
      const currentGrading = objectValue(row.gradingJson);
      if (
        currentGrading.referenceAnswer === solutionCode &&
        currentGrading.solutionCode === solutionCode
      ) {
        continue;
      }

      updates.push({
        id: row.id,
        title: row.title,
        key,
        gradingJson: {
          ...currentGrading,
          type: 'code',
          referenceAnswer: solutionCode,
          solutionCode,
        },
      });
    }

    console.log(
      JSON.stringify(
        {
          mode: write ? 'write' : 'dry-run',
          courseId,
          solutionCount: Object.keys(SOLUTIONS).length,
          matchedProblemCount: matched.length,
          updateCount: updates.length,
          unmatchedSolutionKeys: [...unmatchedSolutionKeys].sort(),
          updates: updates.map(({ id, title, key }) => ({ id, title, key })),
        },
        null,
        2,
      ),
    );

    if (!write || updates.length === 0) return;

    await prisma.$transaction(
      updates.map((update) =>
        prisma.notebookProblem.update({
          where: { id: update.id },
          data: { gradingJson: update.gradingJson },
        }),
      ),
      { timeout: 60_000 },
    );

    console.log(JSON.stringify({ updated: updates.length }, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
