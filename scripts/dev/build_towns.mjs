// Builds extension/lib/towns.txt: US and Canadian towns and cities (2,500+ people) for the area scan, from GeoNames'
// cities1000.txt (CC BY 4.0, https://www.geonames.org). Download and unzip https://download.geonames.org/export/dump/cities1000.zip, then:
//   node scripts/dev/build_towns.mjs path/to/cities1000.txt
// One town per line: name|state or province code|lat|lng|population.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const CA = { "01": "AB", "02": "BC", "03": "MB", "04": "NB", "05": "NL", "07": "NS", "08": "ON", "09": "PE", "10": "QC", "11": "SK", "12": "YT", "13": "NT", "14": "NU" };
const rows = readFileSync(process.argv[2], "utf8").split("\n").map((l) => l.split("\t")).filter((c) => c.length > 14);
const out = rows.filter((c) => (c[8] === "US" || c[8] === "CA") && /^PPL(A\d?|C)?$/.test(c[7]) && +c[14] >= 2500)
  .map((c) => [c[1].replace(/\|/g, " "), c[8] === "CA" ? CA[c[10]] || c[10] : c[10], (+c[4]).toFixed(4), (+c[5]).toFixed(4), c[14]].join("|"));
writeFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "extension", "lib", "towns.txt"), "# Towns and cities from GeoNames (CC BY 4.0, geonames.org): name|state|lat|lng|population\n" + out.join("\n") + "\n");
console.log(out.length, "towns");
