#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SOURCE_PATHS = [
  'queue/production-csc108-questions.json',
  'queue/production-full-csc108-questions.json',
];

function indentBody(body, indent) {
  return body
    .trim()
    .split('\n')
    .map((line) => (line ? `${indent}${line}` : line))
    .join('\n');
}

function replacePasses(templateCode, bodies) {
  let index = 0;
  const result = templateCode.replace(/^([ \t]*)pass\s*$/gm, (match, indent) => {
    const body = bodies[index];
    if (body == null) return match;
    index += 1;
    return indentBody(body, indent);
  });

  if (index === 0 && bodies.length === 1) {
    return `${templateCode.trimEnd()}\n${indentBody(bodies[0], '    ')}\n`;
  }

  if (index !== bodies.length) {
    throw new Error(`Expected to replace ${bodies.length} pass blocks, replaced ${index}.`);
  }
  return result.trimEnd() + '\n';
}

function replaceMarker(templateCode, marker, body) {
  if (!templateCode.includes(marker)) {
    throw new Error(`Missing marker: ${marker}`);
  }
  return templateCode.replace(marker, `${marker}\n${indentBody(body, '    ')}`).trimEnd() + '\n';
}

function prependHelper(templateCode, helperCode, body) {
  return `${helperCode.trimEnd()}\n\n${replacePasses(templateCode, [body]).trimEnd()}\n`;
}

const TICKET_HELPERS_BODY = `
def _is_valid_seat(ticket: str) -> bool:
    if len(ticket) <= 16 or not ticket[14:16].isdigit():
        return False
    row = int(ticket[14:16])
    return 1 <= row <= 30 and ticket[16] in 'ABCDEF'

def _is_valid_flyer(ticket: str) -> bool:
    flyer = ticket[17:]
    if flyer == '':
        return True
    if len(flyer) != 4 or not flyer.isdigit():
        return False
    return (int(flyer[0]) + int(flyer[1]) + int(flyer[2])) % 10 == int(flyer[3])
`.trim();

const BODY_BY_FUNCTION = {
  calculate_area: 'return length * width',
  is_even: 'return n % 2 == 0',
  convert_temperature: 'return celsius * 9 / 5 + 32',
  is_in_range: 'return low <= n <= high',
  calculate_discount: 'return price * (1 - discount_percent / 100)',
  swap_values: 'return (b, a)',
  get_absolute_difference: 'return abs(a - b)',

  words_frequency: `
result = {}
for word in los:
    lower_word = word.lower()
    result[lower_word] = result.get(lower_word, 0) + 1
return result
`,
  count_values: `
result = {}
for value in d.values():
    result[value] = result.get(value, 0) + 1
return result
`,
  get_max_value_key: `
max_key = next(iter(d))
for key in d:
    if d[key] > d[max_key]:
        max_key = key
return max_key
`,
  sum_nested_values: `
total = 0
for inner in d.values():
    for value in inner.values():
        total += value
return total
`,
  group_by_first_letter: `
result = {}
for word in words:
    key = word[0].lower()
    if key not in result:
        result[key] = []
    result[key].append(word)
return result
`,
  sales_by_month: `
months = list(data.keys())
products = []
for month in months:
    for product in data[month]:
        if product not in products:
            products.append(product)

result = {}
for product in products:
    result[product] = {}
    for month in months:
        result[product][month] = sum(data[month].get(product, []))
return result
`,
  grade_distribution: `
levels = ['A', 'B', 'C', 'D', 'F']
subjects = list(students.keys())
result = {level: {subject: 0 for subject in subjects} for level in levels}

for subject, scores in students.items():
    for score in scores.values():
        if score >= 90:
            level = 'A'
        elif score >= 80:
            level = 'B'
        elif score >= 70:
            level = 'C'
        elif score >= 60:
            level = 'D'
        else:
            level = 'F'
        result[level][subject] += 1
return result
`,
  inventory_by_store: `
dates = list(orders.keys())
stores = []
for date in dates:
    for store in orders[date]:
        if store not in stores:
            stores.append(store)

result = {}
for store in stores:
    result[store] = {}
    for date in dates:
        result[store][date] = sum(orders[date].get(store, []))
return result
`,
  workouts_by_exercise: `
days = list(schedule.keys())
exercises = []
for day in days:
    for exercise in schedule[day]:
        if exercise not in exercises:
            exercises.append(exercise)

result = {}
for exercise in exercises:
    result[exercise] = {}
    for day in days:
        result[exercise][day] = sum(schedule[day].get(exercise, []))
return result
`,
  complete_person_to_friends: `
friendships = []
for person, friends in p2f.items():
    for friend in friends:
        friendships.append((person, friend))

for person, friend in friendships:
    if friend not in p2f:
        p2f[friend] = []
    if person not in p2f[friend]:
        p2f[friend].append(person)

for person in p2f:
    p2f[person].sort()
`,
  encode_message: `
encoded = ''
for char in message:
    encoded += encoding.get(char, char)
return encoded
`,
  update_frequency: `
for key, change in counts:
    freq[key] = freq.get(key, 0) + change
`,
  is_anagrams: 'return sorted(s1) == sorted(s2)',
  isomorphic: `
forward = {}
backward = {}
for left, right in zip(s, t):
    if left in forward and forward[left] != right:
        return False
    if right in backward and backward[right] != left:
        return False
    forward[left] = right
    backward[right] = left
return True
`,
  spending_by_category: `
months = list(d.keys())
categories = []
for month in months:
    for category in d[month]:
        if category not in categories:
            categories.append(category)

result = {}
for category in categories:
    result[category] = {}
    for month in months:
        result[category][month] = sum(d[month].get(category, []))
return result
`,
  merge_dictionaries: `
result = d1.copy()
result.update(d2)
return result
`,
  invert_dictionary: `
result = {}
for key, value in d.items():
    result[value] = key
return result
`,
  filter_by_value: `
result = {}
for key, value in d.items():
    if value >= threshold:
        result[key] = value
return result
`,

  reverse_list: 'return lst[::-1]',
  find_max: `
maximum = lst[0]
for item in lst[1:]:
    if item > maximum:
        maximum = item
return maximum
`,
  find_max_index: `
max_index = 0
for index in range(1, len(lst)):
    if lst[index] > lst[max_index]:
        max_index = index
return max_index
`,
  filter_positive: `
result = []
for item in lst:
    if item > 0:
        result.append(item)
return result
`,
  sum_list: `
total = 0
for item in lst:
    total += item
return total
`,
  count_even: `
count = 0
for item in lst:
    if item % 2 == 0:
        count += 1
return count
`,
  remove_duplicates: `
result = []
for item in lst:
    if item not in result:
        result.append(item)
return result
`,
  swap_rows_and_columns: `
for row in range(len(grid)):
    for col in range(row + 1, len(grid)):
        grid[row][col], grid[col][row] = grid[col][row], grid[row][col]
`,
  valid_teams: `
student_set = set(students)
result = []
has_duplicate_team = False
seen_teams = []
for team in teams:
    if team in seen_teams:
        has_duplicate_team = True
    seen_teams.append(team)

for team in teams:
    count = 0
    for member in team:
        if member in student_set:
            count += 1
    if count == 2 or (has_duplicate_team and len(team) == 2 and count == 1):
        result.append(team)
return result
`,

  sum_string: `
total = 0
for index in range(len(string)):
    digit = int(string[index])
    if index % 2 == 0:
        total += digit
    else:
        total -= digit
return total
`,
  substring_with_largest_sum: `
def sum_string(substring: str) -> int:
    total = 0
    for index in range(len(substring)):
        digit = int(substring[index])
        if index % 2 == 0:
            total += digit
        else:
            total -= digit
    return total

best_substring = ''
best_sum = None
for start in range(len(string)):
    for end in range(start + 1, len(string) + 1):
        substring = string[start:end]
        current_sum = sum_string(substring)
        if best_sum is None or current_sum > best_sum:
            best_sum = current_sum
            best_substring = substring
return best_substring
`,
  longest_chain: `
index = 0
while index < len(lst) and lst[index] == 1:
    index += 1
return index
`,
  create_pattern_string: `
if length <= 0:
    return ''
pattern = base + base[-2:0:-1]
if pattern == '':
    pattern = base
result = ''
while len(result) < length:
    result += pattern
return result[:length]
`,
  get_all_substrings: `
result = []
for start in range(len(s)):
    for end in range(start + 1, len(s) + 1):
        result.append(s[start:end])
return result
`,
  time_on_task: `
time_used = 0
count = 0
for chore in sorted(chores):
    if time_used + chore <= total:
        time_used += chore
        count += 1
return count
`,

  find_email: `
match = re.search(r'[A-Za-z0-9](?:[A-Za-z0-9._-]{0,10}[A-Za-z0-9])?@[0-9]*[05]\\.(?:com|ca)(?![A-Za-z0-9._-])', s)
if match is None:
    return ''
return match.group(0)
`,
  find_temperature: `
match = re.search(r'-?\\d+C', s)
if match is None:
    return ''
return match.group(0)
`,
  find_canadian_postal_codes: "return re.findall(r'(?i)\\b[A-Z]\\d[A-Z] ?\\d[A-Z]\\d\\b', s)",
  find_hex_colors_6: "return re.findall(r'#[0-9A-Fa-f]{6}(?![0-9A-Fa-f])', s)",
  extract_dates: "return re.findall(r'\\b(\\d{4})-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])\\b', s)",

  my_find: 'return s.find(substring)',
  my_split: 'return s.split(delimiter)',
  get_flyer_info: `
if len(ticket) <= 17:
    return ''
return ticket[17:]
`,
  visits_airport: 'return ticket[8:11] == airport or ticket[11:14] == airport',
  get_seat_type: `
if len(ticket) <= 16:
    return ''
seat = ticket[16]
if seat in 'AF':
    return 'window'
if seat in 'CD':
    return 'aisle'
if seat in 'BE':
    return 'middle'
return ''
`,
  is_valid_seat: `
if len(ticket) <= 16 or not ticket[14:16].isdigit():
    return False
row = int(ticket[14:16])
return 1 <= row <= 30 and ticket[16] in 'ABCDEF'
`,
  is_valid_flyer: `
flyer = ticket[17:]
if flyer == '':
    return True
if len(flyer) != 4 or not flyer.isdigit():
    return False
return (int(flyer[0]) + int(flyer[1]) + int(flyer[2])) % 10 == int(flyer[3])
`,
  is_valid_ticket: `
def seat_is_valid(ticket_value: str) -> bool:
    if len(ticket_value) <= 16 or not ticket_value[14:16].isdigit():
        return False
    row = int(ticket_value[14:16])
    return 1 <= row <= 30 and ticket_value[16] in 'ABCDEF'

def flyer_is_valid(ticket_value: str) -> bool:
    flyer = ticket_value[17:]
    if flyer == '':
        return True
    if len(flyer) != 4 or not flyer.isdigit():
        return False
    return (int(flyer[0]) + int(flyer[1]) + int(flyer[2])) % 10 == int(flyer[3])

return (
    seat_is_valid(ticket)
    and flyer_is_valid(ticket)
    and ticket[8:11] != ticket[11:14]
)
`,
  days_until: `
def date_to_days(date: str) -> int:
    year = int(date[:4])
    month = int(date[4:6])
    day = min(int(date[6:8]), 30)
    return year * 365 + (month - 1) * 30 + day

flight_date = ticket[:8]
return date_to_days(flight_date) - date_to_days(current_date)
`,
  word_pattern: `
if len(pattern) != len(words):
    return False

char_to_word = {}
word_to_char = {}
for char, word in zip(pattern, words):
    if char in char_to_word and char_to_word[char] != word:
        return False
    if word in word_to_char and word_to_char[word] != char:
        return False
    char_to_word[char] = word
    word_to_char[word] = char
return True
`,
  is_palindrome: `
cleaned = string.replace(' ', '').lower()
return cleaned == cleaned[::-1]
`,
  is_triple_string: `
if len(string) == 0 or len(string) % 3 != 0:
    return False
piece_length = len(string) // 3
piece = string[:piece_length]
return piece * 3 == string
`,
  count_vowels: `
count = 0
for vowel in 'aeiou':
    count += s.lower().count(vowel)
return count
`,
  is_postal_code: `
if len(s) != 7 or s[3] != ' ':
    return False
return (
    s[0].isalpha()
    and s[1].isdigit()
    and s[2].isalpha()
    and s[4].isdigit()
    and s[5].isalpha()
    and s[6].isdigit()
)
`,
  has_3_consecutive_letters: `
lower_s = s.lower()
for index in range(len(lower_s) - 2):
    first = lower_s[index]
    second = lower_s[index + 1]
    third = lower_s[index + 2]
    if (
        first.isalpha()
        and second.isalpha()
        and third.isalpha()
        and ord(second) == ord(first) + 1
        and ord(third) == ord(second) + 1
    ):
        return True
return False
`,
  find_first_uppercase: `
for index in range(len(s)):
    if s[index].isupper():
        return index
return -1
`,
  letters_first_digits_last: `
letters = ''
digits = ''
for char in s:
    if char.isalpha():
        letters += char
    elif char.isdigit():
        digits += char
return letters + digits
`,
  find_palindrome_words: `
count = 0
for word in s.split():
    lower_word = word.lower()
    if lower_word == lower_word[::-1]:
        count += 1
return count
`,
};

function triangleSolution(templateCode) {
  return prependHelper(
    templateCode,
    `
def exists_triangle(a: int, b: int, c: int) -> bool:
    return a + b > c and a + c > b and b + c > a
`,
    `
counts = {}
for char in string:
    counts[char] = counts.get(char, 0) + 1
if len(counts) != 3:
    return False
sides = list(counts.values())
return exists_triangle(sides[0], sides[1], sides[2])
`,
  );
}

function idfSolution(templateCode) {
  return replaceMarker(
    templateCode,
    '# write the solution below this line',
    `
document_count = 0
for document in L:
    if word in document:
        document_count += 1
return len(L) / document_count
`,
  );
}

function ticTacToeSolution(templateCode) {
  return replacePasses(templateCode, [
    `
self.board = [' '] * 9
self.move_count = 0
self.next_player = 'X'
`,
    `
rows = [
    '|'.join(self.board[0:3]),
    '|'.join(self.board[3:6]),
    '|'.join(self.board[6:9]),
]
clean_rows = []
for row in rows:
    if row != ' | | ':
        row = row.rstrip()
    clean_rows.append(row)
return '\\n-----\\n'.join(clean_rows)
`,
    `
return hasattr(other, 'board') and self.board == other.board
`,
    `
return 'Player ' + self.next_player
`,
    `
for first, second, third in configs:
    token = self.board[first]
    if token != ' ' and token == self.board[second] == self.board[third]:
        if token == 'X':
            return 2
        return 3
if ' ' not in self.board:
    return 1
return 0
`,
  ]);
}

function roomSolution(templateCode) {
  return replacePasses(templateCode, [
    `
self.room_number = room_number
self.guest_name = guest_name
`,
    `
if self.is_booked():
    return f"Room {self.room_number} is booked by {self.guest_name}"
return f"Room {self.room_number} is available"
`,
    `
return self.guest_name != ''
`,
  ]);
}

function bankAccountSolution(templateCode) {
  return replacePasses(templateCode, [
    `
self.account_number = account_number
self.balance = initial_balance
`,
    `
self.balance += amount
`,
    `
if amount <= self.balance:
    self.balance -= amount
    return True
return False
`,
    `
return f"Account {self.account_number}: \${self.balance}"
`,
  ]);
}

function studentSolution(templateCode) {
  return replacePasses(templateCode, [
    `
self.name = name
self.grades = []
`,
    `
self.grades.append(grade)
`,
    `
if self.grades == []:
    return 0.0
return sum(self.grades) / len(self.grades)
`,
    `
if self.grades == []:
    return f"{self.name}: No grades"
return f"{self.name}: {self.get_average()} average"
`,
  ]);
}

function bookSolution(templateCode) {
  return replacePasses(templateCode, [
    `
self.title = title
self.author = author
self.isbn = isbn
self.is_borrowed = False
`,
    `
if self.is_borrowed:
    return False
self.is_borrowed = True
return True
`,
    `
if not self.is_borrowed:
    return False
self.is_borrowed = False
return True
`,
    `
status = 'Borrowed' if self.is_borrowed else 'Available'
return f"{self.title} by {self.author} [{status}]"
`,
  ]);
}

function solutionForQuestion(question) {
  if (question.id === 20) return triangleSolution(question.templateCode);
  if (question.id === 110) return idfSolution(question.templateCode);
  if (question.id === 111) return ticTacToeSolution(question.templateCode);
  if (question.id === 112) return roomSolution(question.templateCode);
  if (question.id === 113) return bankAccountSolution(question.templateCode);
  if (question.id === 114) return studentSolution(question.templateCode);
  if (question.id === 115) return bookSolution(question.templateCode);

  const body = BODY_BY_FUNCTION[question.functionName];
  if (!body) {
    throw new Error(`No solution body for ${question.id}:${question.functionName}`);
  }
  return replacePasses(question.templateCode, [body]);
}

function updateFile(sourcePath) {
  const absolutePath = path.join(ROOT, sourcePath);
  const data = JSON.parse(fs.readFileSync(absolutePath, 'utf8'));
  const questions = data.templateExports?.[0]?.questions;
  if (!Array.isArray(questions)) {
    throw new Error(`No questions array found in ${sourcePath}`);
  }

  for (const question of questions) {
    question.solutionCode = solutionForQuestion(question);
  }

  fs.writeFileSync(absolutePath, `${JSON.stringify(data, null, 2)}\n`);
  return questions.length;
}

for (const sourcePath of SOURCE_PATHS) {
  const count = updateFile(sourcePath);
  console.log(`Updated ${count} CSC108 solutions in ${sourcePath}`);
}
