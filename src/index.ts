import fg from "fast-glob";
import fs from "node:fs";
import path from "node:path";
import jsonc, { CommentJSONValue } from "comment-json";

const modifyTsconfig = async (
  dir: string,
  modify: (json: CommentJSONValue) => void
) => {
  const filePath = path.resolve(dir, "tsconfig.json");
  const json = jsonc.parse(await fs.promises.readFile(filePath, "utf-8"));
  modify(json);

  await fs.promises.writeFile(filePath, jsonc.stringify(json, null, 2)); // set space to keep comments
};

export async function tsconfigGen() {
  const files = await fg.glob("**/*/package.json", {
    ignore: ["**/node_modules/**"],
  });

  const dirs = files
    .map((p) => path.dirname(p))
    .sort() // ensure every run result is the same, since fast-glob does not
    .filter((p) => fs.existsSync(path.resolve(p, "tsconfig.json"))); // exclude non-ts projects

  const map: Record<string, { dir: string; packageJson: any; deps: string[] }> =
    {};
  for (const p of dirs) {
    const packageJson = JSON.parse(
      await fs.promises.readFile(path.resolve(p, "package.json"), "utf-8")
    );

    map[packageJson.name] = {
      dir: p,
      packageJson,
      deps: Object.keys({
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
        ...packageJson.peerDependencies,
      }),
    };
  }

  // console.log(map);

  // root
  await modifyTsconfig(process.cwd(), (json) => {
    jsonc.assign(json, {
      references: Object.values(map).map(({ dir }) => {
        return { path: path.relative(process.cwd(), dir) };
      }),
    });
  });

  // sub projects
  for (const p of Object.values(map)) {
    const references = p.deps.flatMap((dep) => {
      const v = map[dep];
      return v && p.packageJson.name !== v.packageJson.name // exclude self to avoid circular
        ? [{ path: path.relative(p.dir, v.dir) }]
        : [];
    });
    await modifyTsconfig(p.dir, (json) => {
      if (references.length) {
        jsonc.assign(json, { references });
      }
    });
  }
}
