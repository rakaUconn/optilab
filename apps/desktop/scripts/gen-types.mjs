// Generate TypeScript types from the Pydantic-exported JSON Schema (single source of truth).
import { compile } from "json-schema-to-typescript";
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = resolve(here, "../../../schema/optilab.schema.json");
const out = resolve(here, "../src/types/api.ts");
const schema = JSON.parse(readFileSync(schemaPath, "utf8"));
// json-schema-to-typescript predates draft 2020-12 tuples: rewrite prefixItems -> items[]
const fixTuples = (n) => {
  if (Array.isArray(n)) return n.forEach(fixTuples);
  if (n && typeof n === "object") {
    if (n.prefixItems) { n.items = n.prefixItems; delete n.prefixItems; }
    Object.values(n).forEach(fixTuples);
  }
};
fixTuples(schema);
const ts = await compile(schema, "ApiSchema", {
  bannerComment: "/* GENERATED from schema/optilab.schema.json by `npm run gen:types`. DO NOT EDIT. */",
  additionalProperties: false,
  unreachableDefinitions: true,
  style: { singleQuote: false, semi: true },
});
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, ts);
console.log("wrote", out);
