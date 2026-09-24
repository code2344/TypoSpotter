import type { TypoRule } from "../types";

// These are intentionally straightforward misspellings. Context-sensitive word
// pairs (their/there, affect/effect, regional variants, and names) do not belong
// in the starter catalog.
export const RULES: TypoRule[] = [
  { id: "recieve", find: "recieve", replace: "receive", note: "Common letter transposition" },
  { id: "seperate", find: "seperate", replace: "separate", note: "Common misspelling" },
  { id: "definately", find: "definately", replace: "definitely", note: "Common misspelling" },
  { id: "occured", find: "occured", replace: "occurred", note: "Missing doubled consonant" },
  { id: "untill", find: "untill", replace: "until", note: "Extra final consonant" },
  { id: "accomodate", find: "accomodate", replace: "accommodate", note: "Missing doubled consonant" },
  { id: "begining", find: "begining", replace: "beginning", note: "Missing doubled consonant" },
  { id: "existance", find: "existance", replace: "existence", note: "Common misspelling" },
  { id: "goverment", find: "goverment", replace: "government", note: "Missing letter" },
  { id: "independant", find: "independant", replace: "independent", note: "Common misspelling" },
  { id: "maintainance", find: "maintainance", replace: "maintenance", note: "Common misspelling" },
  { id: "neccessary", find: "neccessary", replace: "necessary", note: "Incorrect doubled consonant" },
  { id: "posession", find: "posession", replace: "possession", note: "Missing doubled consonant" },
  { id: "prefered", find: "prefered", replace: "preferred", note: "Missing doubled consonant" },
  { id: "publically", find: "publically", replace: "publicly", note: "Common misspelling" },
  { id: "refering", find: "refering", replace: "referring", note: "Missing doubled consonant" },
  { id: "succesful", find: "succesful", replace: "successful", note: "Missing doubled consonant" },
  { id: "tommorow", find: "tommorow", replace: "tomorrow", note: "Common misspelling" },
  { id: "wierd", find: "wierd", replace: "weird", note: "Common letter transposition" },
  { id: "withold", find: "withold", replace: "withhold", note: "Missing letter" }
];
