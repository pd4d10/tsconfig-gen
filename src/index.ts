import { glob } from "glob";
import fs from "node:fs";
import path from "node:path";

const modifyTsconfig = async <T = any>(dir: string, modify: (json: T) => T) => {
  const filePath = path.resolve(dir, "tsconfig.json");
  let json = JSON.parse(await fs.promises.readFile(filePath, "utf-8"));

  json = modify(json);
  await fs.promises.writeFile(filePath, JSON.stringify(json));
};

export async function tsconfigGen() {
  const files = await glob("**/*/package.json", {
    ignore: "**/node_modules/**",
  });

  let dirs = files.map((p) => path.dirname(p));

  dirs = dirs
    // exclude non-ts projects
    .filter((p) => fs.existsSync(path.resolve(p, "tsconfig.json")));

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
    return {
      ...json,
      references: Object.values(map).map(({ dir }) => {
        return { path: path.relative(process.cwd(), dir) };
      }),
    };
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
      return {
        ...json,
        references: references.length ? references : undefined,
      };
    });
  }
}
