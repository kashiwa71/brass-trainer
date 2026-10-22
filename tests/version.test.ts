import { describe, it, expect } from "vitest";
import pkgJson from "../package.json?raw";
import { BUILD, formatBuiltAt, versionLabel } from "../src/core/version";

describe("versionLabel", () => {
  it("版番号・コミット・ビルド日時を並べる", () => {
    expect(versionLabel({ version: "0.1.0", commit: "8d2ff08", builtAt: "2026-10-22T14:24:22Z" }, "Asia/Tokyo")).toBe(
      "バージョン 0.1.0 ・ 8d2ff08 ・ 2026/10/22 23:24 ビルド",
    );
  });
  it("コミットや日時が取れなかったときは省く", () => {
    expect(versionLabel({ version: "0.1.0", commit: "", builtAt: "" }, "Asia/Tokyo")).toBe("バージョン 0.1.0");
    expect(formatBuiltAt("not a date")).toBe("");
  });
  it("ビルド時に package.json の版と日時が埋め込まれる", () => {
    expect(BUILD.version).toBe((JSON.parse(pkgJson) as { version: string }).version);
    expect(Number.isNaN(new Date(BUILD.builtAt).getTime())).toBe(false);
  });
});
