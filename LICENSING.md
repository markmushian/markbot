# Licensing

Mark Bot OSS is distributed under the [Apache License 2.0](LICENSE). It is a
derivative of OpenMausBot and keeps that project's NOTICE, third-party
attributions and upstream authorship intact; see [NOTICE](NOTICE) and
[MARKBOT-NOTICE.md](MARKBOT-NOTICE.md) for what changed and what did not.

The enterprise carve-out described below belongs to upstream and is **not part
of this distribution**: the `enterprise/` directory and its separate licence are
excluded from the shipped bundle, and Mark Bot enables no paid enterprise
entitlements. The section stays here because the upstream licence file is kept
verbatim for anyone reading the source.

---

OpenMausBot is open source under the [Apache License 2.0](LICENSE), with one
carve-out and a few notes.

## The carve-out: `enterprise/`

Everything under `enterprise/` is source-available under the
[OpenMausBot Enterprise License](enterprise/LICENSE), not Apache 2.0. You may
read, build, and evaluate it, and run it freely in development and test.
Running its features in production needs a license key issued for your
organisation. Hosting it for third parties or white-labelling the product needs
a partner agreement.

Delete the folder and what remains is the open-source edition: the server
reports `{"edition":"oss"}` and ordinary standalone operation is unchanged.
A workspace explicitly configured for hosted sign-in refuses remote access
without that optional adapter; removing the enterprise layer must not bypass
its configured sign-in authority. The `open-source edition builds without
enterprise/` CI job proves the OSS build, boot response and absent adapter
factory; it does not exercise every hosted HTTP route. The isolated hosted
workspace tests verify those sign-in and revocation paths separately. The list
of entitlement ids the server understands is in [`enterprise/FEATURES`](enterprise/FEATURES).

The routing rule for new work: could any open-source user want it? Then it goes
in core, as a public pull request. Organisation-, admin- or tier-flavoured?
Then it lives in `enterprise/` behind an entitlement. Customer-specific brand,
skills, packages or connectors belong in that customer's own repository as
data and configuration, never as a fork.

## Contributions

- Outside `enterprise/`: contribute under Apache 2.0. No DCO sign-off or CLA is
  required. Submit only code you wrote or have the right to contribute.
- Inside `enterprise/`: sign the [Contributor License Agreement](CLA.md) once, by
  commenting on your pull request. It lets the project keep that folder under
  its own license while still accepting your work.
- The open-core boundary, the cloud seam and this file are covered by
  [`CODEOWNERS`](.github/CODEOWNERS): a maintainer reviews changes there.

## Third-party components and trademarks

Bundled third-party software keeps its own licenses; notices, license texts,
source locations and the SBOM are listed in [NOTICE](NOTICE) and
[`third_party/`](third_party/). The OpenMausBot and MausBot names and the
mascot are trademarks of Supamaus Software Private Limited; the Apache License
does not grant trademark rights (section 6),
so a product built on OpenMausBot needs its own name unless a partner agreement
says otherwise.
