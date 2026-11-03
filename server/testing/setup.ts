// Every test file gets a throwaway home, so DATA_DIR (~/.markbot) never touches the real one;
// os.homedir() reads HOME / USERPROFILE at call time, and this runs before server/config.ts is imported.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach } from "vitest";

import { removeTempDir } from "./cleanup.ts";

const home = mkdtempSync(join(tmpdir(), "omb-test-home-"));
process.env.HOME = home;
process.env.USERPROFILE = home;
// OMB_DATA_DIR must never escape the throwaway home the suite deletes.
delete process.env.OMB_DATA_DIR;
// Do not let a developer's Hermes global config path leak into per-test homes.
delete process.env.HERMES_HOME;
// Named explicitly although homedir() already covers it: the device tests delete this directory wholesale.
process.env.OMB_COMPANION_DIR = join(home, ".markbot-companion");

// Product code follows navigator.language; pin it so English assertions do not depend on the host locale.
Object.defineProperty(globalThis.navigator, "language", { value: "en", configurable: true });
// i18n starts on its own default pack and only App settles it from the person's choice, so the pinned language has to
// be applied here too: English assertions otherwise compare against the default pack. Files that test other languages
// call setLocale themselves.
const { setLocale } = await import("../../src/lib/i18n");
setLocale("en");

// Windows will not remove a directory holding an open SQLite database: close it before the reset.
// happy-dom files never open that database, and the browser-side bundler cannot resolve node:sqlite at all, so the
// specifier stays non-literal and the module is only loaded where no window exists.
const closeMessageDb: () => void =
  typeof window === "undefined"
    ? (
        (await import(/* @vite-ignore */ new URL("../message-db.ts", import.meta.url).href)) as {
          closeMessageDb: () => void;
        }
      ).closeMessageDb
    : () => {};
afterEach(closeMessageDb);

// Windows holds a live process's cwd, and a just-killed CLI lets go a beat after the kill returns.
afterAll(async () => {
  closeMessageDb();
  await removeTempDir(home);
});
