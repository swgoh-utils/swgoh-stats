module.exports = {
  branches: ['main'],
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
        "prepareCmd": "./prepareRelease.sh ${nextRelease.version}",
        "publishCmd": "./publishRelease.sh ${nextRelease.version}",
      }
    ],
    "@semantic-release/github",
    "@semantic-release/git",
  ],
};