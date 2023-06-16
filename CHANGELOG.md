## [1.3.1](https://github.com/swgoh-utils/swgoh-stats/compare/v1.3.0...v1.3.1) (2023-06-16)


### Bug Fixes

* ult GP calc and data builder unit error ([#4](https://github.com/swgoh-utils/swgoh-stats/issues/4)) ([efd0cc2](https://github.com/swgoh-utils/swgoh-stats/commit/efd0cc247af363b85f29e80910d9bc478905f183))

# [1.3.0](https://github.com/swgoh-utils/swgoh-stats/compare/v1.2.0...v1.3.0) (2023-02-01)


### Features

* show swgoh-stats version in startup log ([5f28cfa](https://github.com/swgoh-utils/swgoh-stats/commit/5f28cfa95fa3f6adca19682d21a25c706a990bdb))

# [1.2.0](https://github.com/swgoh-utils/swgoh-stats/compare/v1.1.2...v1.2.0) (2023-02-01)


### Bug Fixes

* correct release permissions ([4d6515c](https://github.com/swgoh-utils/swgoh-stats/commit/4d6515cc204dd9f126413861fef8845b62585413))


### Features

* create github action workflows ([9a93b1b](https://github.com/swgoh-utils/swgoh-stats/commit/9a93b1bf425575d2800f51f71edc8626ba7b6f5c))
* update dependencies ([4b51e1a](https://github.com/swgoh-utils/swgoh-stats/commit/4b51e1a49b37cd95e8248f12101d033a7f355fbe))
* update game data ([be25285](https://github.com/swgoh-utils/swgoh-stats/commit/be25285c0b1576a46895090cdb1a41c894d4b42c))

## [1.1.2](https://github.com/swgoh-utils/swgoh-stats/compare/v1.1.1...v1.1.2) (2023-01-10)


### Bug Fixes

* adopt renamed comlink stub package, update bundled data ([f8e8b4f](https://github.com/swgoh-utils/swgoh-stats/commit/f8e8b4f60a21a446cf10945870bfd2f9ee32a7b0))
* adopt scuba's fixes for character and ship cals ([ce19441](https://github.com/swgoh-utils/swgoh-stats/commit/ce194410cb62ebeb4461c726b28ae6f04ffc2886))
* extend calcGP to single unit/ship APIs ([adc47d1](https://github.com/swgoh-utils/swgoh-stats/commit/adc47d11d347fa4c546e903c92e3297e7f722fa4))
* remove reference to body parser, use express directly ([40325d9](https://github.com/swgoh-utils/swgoh-stats/commit/40325d97874927ede29bd6fa35b85c7fabe2a041))
* ship calcs and roster /units style ([b836d7e](https://github.com/swgoh-utils/swgoh-stats/commit/b836d7ece554b19612d2874f017ed2f4a72b2978))

## [1.1.1](https://github.com/swgoh-utils/swgoh-stats/compare/v1.1.0...v1.1.1) (2022-08-17)


### Bug Fixes

* includePveUnits = false, use abs path with VOLUME ([d2f9b35](https://github.com/swgoh-utils/swgoh-stats/commit/d2f9b356e0e31a99863893b6fa1fd0dc20a8902e))

# [1.1.0](https://github.com/swgoh-utils/swgoh-stats/compare/v1.0.1...v1.1.0) (2022-08-14)


### Bug Fixes

* update bundled game data ([41d8d52](https://github.com/swgoh-utils/swgoh-stats/commit/41d8d520383e7512b226ff04806fdc9763131be7))


### Features

* add hmac capability, support building game data with unzip=false ([fee47a8](https://github.com/swgoh-utils/swgoh-stats/commit/fee47a8c155d79e353df5285f2326f31f1d699d9))

## [1.0.1](https://github.com/swgoh-utils/swgoh-stats/compare/v1.0.0...v1.0.1) (2022-06-20)


### Bug Fixes

* add missing version checking function ([391e993](https://github.com/swgoh-utils/swgoh-stats/commit/391e99377f7f44fc51326e537c9f7b01cfc03d33))

# 1.0.0 (2022-06-20)


### Bug Fixes

* add missing comma in release config ([ce5fed2](https://github.com/swgoh-utils/swgoh-stats/commit/ce5fed29b1b37a5521cbb1de518de0d1a389587e))
* add tini to dockerfile ([f63d1f0](https://github.com/swgoh-utils/swgoh-stats/commit/f63d1f0891638c22d09e3b1ab4df1c1a18d3bcd7))
* apply better dockerfile practices ([3ab7ea7](https://github.com/swgoh-utils/swgoh-stats/commit/3ab7ea7ef3f5513969f1f7091a9aa090b44f67b1))
* omit irrelevant files with docker ignore ([621f77c](https://github.com/swgoh-utils/swgoh-stats/commit/621f77cfa5862c584bcbe2c3e83080c254029ce0))
* omit workdir from build phase ([5346270](https://github.com/swgoh-utils/swgoh-stats/commit/5346270ab48ca3b333f96475237f8e2756faffb9))
* use npx to run semantic-release ([7b496fe](https://github.com/swgoh-utils/swgoh-stats/commit/7b496fe3bfa8288042dc7fc40aa5a4d1fe9aa0ea))


### Features

* initial commit of functionality ([51e417c](https://github.com/swgoh-utils/swgoh-stats/commit/51e417c573179126713b6369b7ed86f399279084))
