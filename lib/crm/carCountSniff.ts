// Is this header row a vehicle list (a car count) rather than a people list?
//
// Lives on its own — no spreadsheet parser, no server imports — so the chat can
// use it in the browser to route a dropped file to the right import. The catch
// it exists for: a Connecteam production export carries VINs too, but every row
// is a person's work and it belongs to the staff / time imports. An auction's
// car count has VINs and no people.

const has = (headers: string[], re: RegExp) => headers.some((h) => re.test(h.trim()));

const VIN = /^vin$|vin\s*#?$|vehicle\s*id|serial/i;
const PERSON = /full\s*name|employee|^name$|^user$|staff|member/i;
const UNIT_DETAIL = /date|work\s*order|^wo\s*#?$|invoice|amount|charge|price|stock/i;

export function looksLikeCarCount(headers: string[]): boolean {
  if (!has(headers, VIN)) return false;
  if (has(headers, PERSON)) return false;
  return has(headers, UNIT_DETAIL);
}
