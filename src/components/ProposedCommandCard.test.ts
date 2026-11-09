// Pure-contract tests for a command proposal. The rendered card is covered by
// the desktop's component suite; this file stays in the default node
// environment so it runs on every Node version this repo supports.
import { describe, expect, it } from "vitest";

import { commandPreview, NO_AUTO_EXECUTE, type CommandProposal } from "./ProposedCommandCard";

const COMMAND = "npm install -g @scope/cli --token=sk-abcdefghijklmnopqrstuvwxyz";
const proposal: CommandProposal = {
  id: "p1",
  command: COMMAND,
  reason: "安装后才能在终端里用这个引擎。",
  cwd: "C:\\work\\bot",
  proposedBy: "安装助手",
};

describe("commandPreview", () => {
  it("masks a credential so a proposal can be shown safely", () => {
    expect(commandPreview(COMMAND)).not.toContain("sk-abcdefghijklmnopqrstuvwxyz");
    expect(commandPreview("  echo   one\n  echo two ")).toBe("echo one echo two");
    expect(commandPreview("x".repeat(300))).toHaveLength(241);
    expect(commandPreview("")).toBe("");
  });
});

describe("a command proposal", () => {
  it("promises copying only, never pressing Enter", () => {
    expect(NO_AUTO_EXECUTE).toContain("不会自动执行");
    expect(NO_AUTO_EXECUTE).toContain("不会替你按回车");
  });

  it("keeps the command, reason, cwd and author as separate, display-only fields", () => {
    expect(proposal.command).toBe(COMMAND);
    expect(proposal.reason).toBeTruthy();
    expect(proposal.cwd).toBe("C:\\work\\bot");
    expect(proposal.proposedBy).toBe("安装助手");
    expect(proposal.id).toBe("p1");
  });
});
