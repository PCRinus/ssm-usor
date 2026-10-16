export type ContextParts<Context> = { [Name in keyof Context]-?: () => Context[Name] };

export function gapRules<Facts, Code extends string, Context extends object>({
  missing,
  printedAs,
  parts,
}: {
  missing: (facts: Facts, typeKey?: string) => Code[];
  printedAs: Record<Code, readonly (keyof Context)[]>;
  parts: (facts: Facts) => ContextParts<Context>;
}) {
  const contextWithout = (facts: Facts, gaps: readonly Code[]): Partial<Context> => {
    const leftOut = new Set<PropertyKey>(gaps.flatMap((code) => printedAs[code]));
    return Object.fromEntries(
      Object.entries<() => unknown>(parts(facts)).flatMap(([name, part]) => {
        if (leftOut.has(name)) return [];
        const value = part();
        return value === undefined ? [] : [[name, value]];
      })
    ) as Partial<Context>;
  };
  const printedNamesOf: Partial<Record<string, readonly (keyof Context)[]>> = printedAs;
  return {
    missing,
    // A code the set does not know is taken to concern every document.
    concerns: (code: string, printedNames: readonly string[]) =>
      printedNamesOf[code]?.some((name) => printedNames.includes(name as string)) ?? true,
    build: (facts: Facts): Context => {
      const gaps = missing(facts);
      if (gaps.length > 0) throw new Error(`Missing document data: ${gaps.join(', ')}`);
      return contextWithout(facts, []) as Context;
    },
    buildPartial: (facts: Facts, typeKey?: string) =>
      contextWithout(facts, missing(facts, typeKey)),
  };
}
