/** Suma în litere (română), pentru chitanțe: 1234,50 → „o mie două sute treizeci și patru lei și cincizeci de bani”. */

const UNITS_M = ["", "unu", "doi", "trei", "patru", "cinci", "șase", "șapte", "opt", "nouă"];
const UNITS_F = ["", "una", "două", "trei", "patru", "cinci", "șase", "șapte", "opt", "nouă"];
const TEENS_M = [
  "zece",
  "unsprezece",
  "doisprezece",
  "treisprezece",
  "paisprezece",
  "cincisprezece",
  "șaisprezece",
  "șaptesprezece",
  "optsprezece",
  "nouăsprezece",
];
const TENS = ["", "", "douăzeci", "treizeci", "patruzeci", "cincizeci", "șaizeci", "șaptezeci", "optzeci", "nouăzeci"];

function below100(n: number, fem: boolean): string {
  const units = fem ? UNITS_F : UNITS_M;
  if (n < 10) return units[n];
  if (n < 20) return fem && n === 12 ? "douăsprezece" : TEENS_M[n - 10];
  const t = Math.floor(n / 10);
  const u = n % 10;
  return u ? `${TENS[t]} și ${units[u]}` : TENS[t];
}

function below1000(n: number, fem: boolean): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const hundreds = h === 0 ? "" : h === 1 ? "o sută" : `${UNITS_F[h]} sute`;
  const tail = rest ? below100(rest, fem) : "";
  return [hundreds, tail].filter(Boolean).join(" ");
}

/** „de” se pune înaintea substantivului când ultimele două cifre sunt 00 sau ≥ 20 (și numărul ≥ 20). */
function needsDe(n: number) {
  const r = n % 100;
  return n >= 20 && (r === 0 || r >= 20);
}

function group(n: number, one: string, many: string, fem: boolean): string {
  if (n === 0) return "";
  if (n === 1) return one;
  const w = below1000(n, fem);
  return `${w}${needsDe(n) ? " de" : ""} ${many}`;
}

export function numberToWords(n: number, fem = false): string {
  n = Math.floor(Math.abs(n));
  if (n === 0) return "zero";
  const billions = Math.floor(n / 1e9);
  const millions = Math.floor((n % 1e9) / 1e6);
  const thousands = Math.floor((n % 1e6) / 1e3);
  const rest = n % 1000;
  return [
    group(billions, "un miliard", "miliarde", false),
    group(millions, "un milion", "milioane", false),
    group(thousands, "o mie", "mii", true),
    rest ? below1000(rest, fem) : "",
  ]
    .filter(Boolean)
    .join(" ");
}

const CURRENCY_WORDS: Record<string, { one: string; many: string; subOne: string; subMany: string }> = {
  RON: { one: "un leu", many: "lei", subOne: "un ban", subMany: "bani" },
  EUR: { one: "un euro", many: "euro", subOne: "un eurocent", subMany: "eurocenți" },
  USD: { one: "un dolar", many: "dolari", subOne: "un cent", subMany: "cenți" },
};

export function amountInWords(amount: number, currency = "RON"): string {
  const cw = CURRENCY_WORDS[currency] ?? { one: `1 ${currency}`, many: currency, subOne: "o subunitate", subMany: "subunități" };
  const cents = Math.round(Math.abs(amount) * 100);
  const whole = Math.floor(cents / 100);
  const sub = cents % 100;
  const main = whole === 1 ? cw.one : `${numberToWords(whole)}${needsDe(whole) ? " de" : ""} ${cw.many}`;
  if (!sub) return main;
  const subText = sub === 1 ? cw.subOne : `${numberToWords(sub)}${needsDe(sub) ? " de" : ""} ${cw.subMany}`;
  return `${main} și ${subText}`;
}
