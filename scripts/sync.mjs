
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pkgPath = path.resolve(__dirname, "../package.json");
const tauriConfPath = path.resolve(__dirname, "../src-tauri/tauri.conf.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
const version = pkg.version;

const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, "utf-8"));

if (tauriConf.version !== version) {
  console.log(
    `Updating tauri.conf.json version: ${tauriConf.version} → ${version}`
  );

  tauriConf.version = version;

  fs.writeFileSync(
    tauriConfPath,
    JSON.stringify(tauriConf, null, 2) + "\n"
  );

  console.log("tauri.conf.json updated.");
}