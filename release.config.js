module.exports = {
  branches: ['master'],
  debug: 'semantic-release:*',
  plugins: [
    [
      '@semantic-release/commit-analyzer',
      {
        preset: "conventionalcommits",
      },
    ],
    '@semantic-release/release-notes-generator',
    '@semantic-release/changelog',
    [
      "@semantic-release/npm",
      {
        // update package.json but do not publish to npm
        "npmPublish": false,
      }
    ],
    [
      '@semantic-release/exec',
      {
        "verifyConditionsCmd": 'docker login -u "$CI_REGISTRY_USER" -p "$CI_REGISTRY_PASSWORD" $CI_REGISTRY',
        "prepareCmd": "./prepareRelease.sh ${nextRelease.version}",
        "publishCmd": "./publishRelease.sh ${nextRelease.version}",
      }
    ],
    "@semantic-release/github",
    "@semantic-release/git",
  ],
};