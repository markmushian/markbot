# Mark Bot OSS

Based on OpenMausBot, upstream commit 18d549510. The original Apache-2.0
LICENSE, NOTICE, third_party notices and upstream authorship remain intact.

Mark Bot changes the product name, the interface language policy, local data
paths, avatar art and selection, hover/focus feedback, and desktop distribution
settings. The interface follows the system language: Chinese systems open in
Chinese, which is the product's first language, and every other system opens in
English instead of being handed a Chinese UI. The three Mark robot images were
generated using the built-in image generation tool for this project. They are
not the OpenMausBot mascot.

The rename is complete rather than side by side: deep links are `markbot://` only,
the desktop app registers no other scheme, and connector settings are `MARKBOT_*`
only. Nothing is carried over from any earlier build, and there are no installs
of an earlier build to carry from.

The production bundle excludes the separately licensed enterprise layer.
Mark Bot does not enable paid enterprise entitlements or replace hosted sign-in
authority. Its updater reads this repository's own releases; it never downloads
upstream OpenMausBot binaries.

Data: `~/.markbot-oss` and `%APPDATA%/Mark Bot OSS`. It never reads or adopts an
OpenMausBot install's conversations or keys, so the two products can sit on one
computer without mixing.

This fork is being validated. An upstream feature existing in source does not
mean its vendor integration has been tested on this computer.
