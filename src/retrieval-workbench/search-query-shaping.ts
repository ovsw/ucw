const SEARCH_STOP_WORDS = new Set([
  "a",
  "about",
  "an",
  "and",
  "another",
  "are",
  "as",
  "at",
  "be",
  "by",
  "camp",
  "camper",
  "campers",
  "can",
  "child",
  "children",
  "could",
  "do",
  "does",
  "during",
  "family",
  "families",
  "few",
  "first",
  "for",
  "from",
  "get",
  "have",
  "has",
  "how",
  "i",
  "if",
  "in",
  "is",
  "it",
  "make",
  "my",
  "of",
  "or",
  "our",
  "parent",
  "parents",
  "right",
  "should",
  "sure",
  "support",
  "that",
  "the",
  "their",
  "them",
  "they",
  "this",
  "time",
  "to",
  "too",
  "up",
  "we",
  "what",
  "when",
  "where",
  "who",
  "will",
  "with",
  "would",
  "worry",
  "worried",
  "you",
  "your",
]);

const INDEX_TERM_ALIASES: Record<string, string> = {
  bullied: "bully",
  bullies: "bully",
  bullying: "bully",
  phones: "phone",
  safely: "safety",
  safe: "safety",
  swimmer: "swim",
  swimming: "swim",
};

const QUERY_TERM_ALIASES: Record<string, string | string[]> = {
  bullied: ["bully", "unsafe", "reporting"],
  bullies: ["bully", "unsafe", "reporting"],
  bullying: ["bully", "unsafe", "reporting"],
  overwhelmed: ["nervous", "homesickness", "social"],
  phone: ["phone", "electronics"],
  phones: ["phone", "electronics"],
  safely: "safety",
  safe: "safety",
  shy: ["shy", "nervous", "social"],
  swimmer: "swim",
  swimming: "swim",
};

const SANITY_QUERY_TERM_ALIASES: Record<string, string | string[]> = {
  ...QUERY_TERM_ALIASES,
  bullied: ["bully", "bullying", "unsafe", "reporting"],
  bullies: ["bully", "bullying", "unsafe", "reporting"],
  bullying: ["bully", "bullying", "unsafe", "reporting"],
  cancel: ["cancel", "cancellation", "refund", "refunds"],
  cancelled: ["cancelled", "cancellation", "refund", "refunds"],
  cancellation: ["cancellation", "refund", "refunds"],
  cost: ["cost", "pricing", "tuition", "payment"],
  costs: ["costs", "pricing", "tuition", "payment"],
  deposit: ["deposit", "deposits", "payment"],
  deposits: ["deposit", "deposits", "payment"],
  due: ["due", "payment", "schedule"],
  lake: ["lake", "waterfront", "water"],
  much: ["much", "pricing", "affordability", "budget"],
  nervous: ["nervous", "homesickness", "readiness"],
  price: ["price", "pricing", "tuition", "payment"],
  prices: ["prices", "pricing", "tuition", "payment"],
  safely: ["safe", "safety"],
  safe: ["safe", "safety"],
  swimmer: ["swim", "swimming", "waterfront", "water"],
  swimming: ["swim", "swimming", "waterfront", "water"],
};

function keepSearchTerm(term: string): boolean {
  return term.length >= 2 && !SEARCH_STOP_WORDS.has(term);
}

function processTermWithAliases(term: string, aliases: Record<string, string | string[]>): string | string[] | null {
  const alias = aliases[term.toLowerCase()] ?? term.toLowerCase();
  const normalized = Array.isArray(alias) ? alias.filter(keepSearchTerm) : alias;

  if (Array.isArray(normalized)) {
    return normalized.length > 0 ? normalized : null;
  }

  if (!keepSearchTerm(normalized)) {
    return null;
  }

  return normalized;
}

export function processIndexedSearchTerm(term: string): string | string[] | null {
  return processTermWithAliases(term, INDEX_TERM_ALIASES);
}

export function processQuerySearchTerm(term: string): string | string[] | null {
  return processTermWithAliases(term, QUERY_TERM_ALIASES);
}

export function processSanityQuerySearchTerm(term: string): string | string[] | null {
  return processTermWithAliases(term, SANITY_QUERY_TERM_ALIASES);
}

function shapeSearchQueryWithProcessor(
  query: string,
  processTerm: (term: string) => string | string[] | null,
): string {
  const shapedTerms: string[] = [];
  const seenTerms = new Set<string>();
  const rawTerms = query.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];

  for (const rawTerm of rawTerms) {
    const processedTerm = processTerm(rawTerm);
    const terms = Array.isArray(processedTerm) ? processedTerm : processedTerm ? [processedTerm] : [];

    for (const term of terms) {
      if (seenTerms.has(term)) {
        continue;
      }

      seenTerms.add(term);
      shapedTerms.push(term);
    }
  }

  return shapedTerms.join(" ");
}

export function shapeSearchQuery(query: string): string {
  return shapeSearchQueryWithProcessor(query, processQuerySearchTerm);
}

export function shapeSanitySearchQuery(query: string): string {
  return shapeSearchQueryWithProcessor(query, processSanityQuerySearchTerm);
}
