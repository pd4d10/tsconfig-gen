import { cac } from "cac";
import { tsconfigGen } from "./index.js";

const cli = cac();

cli.command("").action(async () => {
  await tsconfigGen();
});

cli.help();
cli.parse();
