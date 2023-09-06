import { cac } from "cac";
import { glob } from "glob";
import fs from "node:fs";
import path from "node:path";

const cli = cac();

const modifyTsconfig = async <T = any>(dir: string, modify: (json: T) => T) => {
  const filePath = path.resolve(dir, "tsconfig.json");
  let json = JSON.parse(await fs.promises.readFile(filePath, "utf-8"));

  json = modify(json);
  await fs.promises.writeFile(filePath, JSON.stringify(json));
};

cli.command("").action(async () => {
  const files = await glob("**/*/package.json", {
    ignore: "**/node_modules/**",
  });

  let dirs = files.map((p) => path.dirname(p));
  // exclude nested paths
  dirs = dirs.filter((p) => !dirs.some((p0) => p !== p0 && p.includes(p0)));

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
    const references = p.deps
      .filter((dep) => map[dep])
      .map((dep) => {
        return { path: path.relative(p.dir, map[dep].dir) };
      });
    await modifyTsconfig(p.dir, (json) => {
      return {
        ...json,
        references: references.length ? references : undefined,
      };
    });
  }
});

cli.help();
cli.parse();
