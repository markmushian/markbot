#!/usr/bin/env python3
"""Publish a Mark Bot release to this repository.

One command turns a locally built installer into a GitHub release users can
download:  python scripts/publish-release.py

It reads the version from package.json, creates (or reuses) the vX.Y.Z tag and
release, and uploads the Windows installer under a STABLE file name
(MarkBot-setup.exe) so the README's `releases/latest/download/...` links keep
working across versions.

Authentication comes from the same git credential the repo already pushes with
(Git Credential Manager on Windows, a keychain or ssh-agent elsewhere); the
token is never written to disk. If no credential is available, run `git push`
once first so the credential helper stores one.

What it does NOT do: build. Run `pnpm package:win` (or the full
`electron-builder --win`) first and point --installer at the result.
"""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

API = "https://api.github.com"
REPO_OWNER = "markmushian"
REPO_NAME = "markbot"
# The stable asset name the README and docs link to. Never version this name.
STABLE_WINDOWS_NAME = "MarkBot-setup.exe"


def git_credential_token() -> str:
    """The token git already uses for this remote; read, used, discarded."""
    result = subprocess.run(
        ["git", "credential", "fill"],
        input="protocol=https\nhost=github.com\n\n",
        capture_output=True, text=True, timeout=60,
    )
    fields = dict(
        line.split("=", 1) for line in result.stdout.splitlines() if "=" in line
    )
    token = fields.get("password", "")
    if not token:
        sys.exit("No git credential for github.com. Run `git push` once, then retry.")
    return token


class GitHub:
    def __init__(self, token: str) -> None:
        self.token = token

    def _request(self, path: str, data=None, method=None, ctype="application/json"):
        body = json.dumps(data).encode() if isinstance(data, dict) else data
        request = urllib.request.Request(
            f"{API}{path}",
            data=body,
            method=method or ("POST" if body else "GET"),
            headers={
                "Authorization": f"Bearer {self.token}",
                "Accept": "application/vnd.github+json",
                "X-GitHub-Api-Version": "2022-11-28",
                "Content-Type": ctype,
            },
        )
        with urllib.request.urlopen(request, timeout=1800) as response:
            return json.loads(response.read()) if response.status != 204 else {}

    def release_for_tag(self, tag: str) -> dict | None:
        try:
            return self._request(f"/repos/{REPO_OWNER}/{REPO_NAME}/releases/tags/{tag}")
        except urllib.error.HTTPError as error:
            if error.code == 404:
                return None
            raise

    def create_release(self, tag: str, name: str, notes: str) -> dict:
        return self._request(
            f"/repos/{REPO_OWNER}/{REPO_NAME}/releases",
            {
                "tag_name": tag,
                "name": name,
                "body": notes,
                "draft": False,
                "prerelease": False,
            },
        )

    def replace_asset(self, release: dict, path: str, name: str) -> str:
        """Upload `path` as `name`, replacing an existing asset of that name."""
        for asset in release.get("assets", []):
            if asset["name"] == name:
                self._request(
                    f"/repos/{REPO_OWNER}/{REPO_NAME}/releases/assets/{asset['id']}",
                    method="DELETE",
                )
                print(f"  removed old {name}")
        upload_url = release["upload_url"].split("{")[0]
        size = os.path.getsize(path)
        request = urllib.request.Request(
            f"{upload_url}?name={urllib.parse.quote(name)}",
            data=open(path, "rb"),
            method="POST",
            headers={
                "Authorization": f"Bearer {self.token}",
                "Content-Type": "application/octet-stream",
                "X-GitHub-Api-Version": "2022-11-28",
                "Content-Length": str(size),
            },
        )
        started = time.time()
        with urllib.request.urlopen(request, timeout=1800) as response:
            uploaded = json.loads(response.read())
        print(f"  uploaded {name} ({size / 1e6:.1f} MB) in {time.time() - started:.0f}s")
        return uploaded["browser_download_url"]


def package_version() -> str:
    with open("package.json", encoding="utf-8") as handle:
        return json.load(handle)["version"]


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--installer", help="path to the built installer (default: newest release/*.exe)")
    parser.add_argument("--notes", help="release notes (default: a short bilingual summary)")
    args = parser.parse_args()

    installer = args.installer
    if not installer:
        candidates = [
            os.path.join("release", name)
            for name in (os.listdir("release") if os.path.isdir("release") else [])
            if name.endswith(".exe") and not name.endswith(".blockmap")
        ]
        if not candidates:
            sys.exit("No installer in release/. Build one first: pnpm package:win")
        installer = max(candidates, key=os.path.getmtime)
    if not os.path.isfile(installer):
        sys.exit(f"Installer not found: {installer}")

    version = package_version()
    tag = f"v{version}"
    print(f"Release {tag} <- {installer} ({os.path.getsize(installer) / 1e6:.1f} MB)")

    github = GitHub(git_credential_token())
    release = github.release_for_tag(tag)
    if release is None:
        notes = args.notes or (
            f"## Mark Bot {version}\n\n"
            "Windows: run `MarkBot-setup.exe` — one click, per-user, no admin rights. "
            "If SmartScreen shows \"unknown publisher\", choose **More info → Run anyway**.\n\n"
            "Install, open, and the first-run guide connects an AI: sign in with an account "
            "you already have, or start on the free model.\n"
        )
        release = github.create_release(tag, f"Mark Bot {version}", notes)
        print(f"  created {release['html_url']}")
    else:
        print(f"  reusing {release['html_url']}")

    url = github.replace_asset(release, installer, STABLE_WINDOWS_NAME)
    print("Published:", url)


if __name__ == "__main__":
    main()
