// FY definitions: key = shorthand, start/end in 'YYYY-MM' format (end is exclusive).
const FY_DEFINITIONS = {
  FY24: { start: '2024-04', end: '2025-04', label: 'FY 2024-2025 (Apr 2024 - Mar 2025)' },
  FY25: { start: '2025-04', end: '2026-04', label: 'FY 2025-2026 (Apr 2025 - Mar 2026)' },
  FY26: { start: '2026-04', end: '2027-04', label: 'FY 2026-2027 (Apr 2026 - Mar 2027)' },
};

// Ordered list of months in FY sequence (April → March).
const MONTHS = [
  { name: 'April',     value: '04' },
  { name: 'May',       value: '05' },
  { name: 'June',      value: '06' },
  { name: 'July',      value: '07' },
  { name: 'August',    value: '08' },
  { name: 'September', value: '09' },
  { name: 'October',   value: '10' },
  { name: 'November',  value: '11' },
  { name: 'December',  value: '12' },
  { name: 'January',   value: '01' },
  { name: 'February',  value: '02' },
  { name: 'March',     value: '03' },
];

// Used to sort folder names like 'apr-2025' chronologically.
const MONTH_ORDER = {
  jan: 1, feb: 2,  mar: 3,  apr: 4,
  may: 5, jun: 6,  jul: 7,  aug: 8,
  sep: 9, oct: 10, nov: 11, dec: 12,
};

// Return a 3-letter lowercase month name for a zero-padded month number.
// e.g. '04' → 'apr'
function getMonthName(monthNum) {
  const names = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  return names[parseInt(monthNum) - 1];
}

// Calculate the Slack API date range for a given month.
// Returns { fetchStart, monthEnd } where fetchStart is one day before the 1st
// (Slack's `after:` is exclusive) and monthEnd is the 1st of the next month.
// Uses UTC methods to avoid timezone-shift bugs.
function getMonthDates(year, month) {
  let nextMonth = parseInt(month) + 1;
  let nextYear = parseInt(year);
  if (nextMonth > 12) { nextMonth = 1; nextYear++; }

  const monthEnd = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;

  const startDate = new Date(`${year}-${month}-01T00:00:00Z`);
  startDate.setUTCDate(startDate.getUTCDate() - 1);
  const fetchStart = startDate.toISOString().split('T')[0];

  return { fetchStart, monthEnd };
}

// Generate the list of selectable months for a FY, capped at today (no future months).
// previouslySelected is an array of 'YYYY-MM' strings to pre-check.
function getMonthChoices(fyKey, previouslySelected = []) {
  const fy = FY_DEFINITIONS[fyKey];
  const [startYear, startMonth] = fy.start.split('-').map(Number);
  const [endYear, endMonth] = fy.end.split('-').map(Number);

  const today = new Date();
  const todayYear = today.getFullYear();
  const todayMonth = today.getMonth() + 1;

  const choices = [];
  let currentYear = startYear;
  let currentMonth = startMonth;

  while (true) {
    if (currentYear > endYear) break;
    if (currentYear === endYear && currentMonth >= endMonth) break;
    if (currentYear > todayYear) break;
    if (currentYear === todayYear && currentMonth > todayMonth) break;

    const monthPadded = String(currentMonth).padStart(2, '0');
    const value = `${currentYear}-${monthPadded}`;
    const monthName = MONTHS.find(m => m.value === monthPadded).name;

    choices.push({
      name: `${monthName} ${currentYear}`,
      value,
      checked: previouslySelected.includes(value),
    });

    currentMonth++;
    if (currentMonth > 12) { currentMonth = 1; currentYear++; }
  }

  return choices;
}

module.exports = { FY_DEFINITIONS, MONTHS, MONTH_ORDER, getMonthName, getMonthDates, getMonthChoices };
