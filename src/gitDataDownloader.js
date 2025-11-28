const ComlinkStub = require('@swgoh-utils/comlink');
const mkdirp = require('mkdirp');
const fs = require('fs');
const path = require('path');
const util = require('util');
const JSZip = require('jszip');
const pipeline = util.promisify(require('stream').pipeline);
const statEnumMap = require('./statEnumMap.json');
const statEnum = {};
const localizationMap = {};
const ZIP_FILE = path.join(__dirname, `statCalcData.zip`);

for (const [key, value] of Object.entries(statEnumMap)) {
  if (value.tableKey) {
    statEnum[value.tableKey] = key;
  }
  if (value.nameKey) {
    localizationMap[value.nameKey] = key;
  }
}

module.exports = class DataBuilder {
  constructor(options = {}) {
    this.dataPath = options.dataPath;
    this.gameData = {};
    this.zipGameData = (options.zipGameData && options.zipGameData === "true") ? true : false;
    this.git_url = 'https://raw.githubusercontent.com/swgoh-utils/gamedata/refs/heads/main'
    this.updateInterval = options.updateInterval || 5; // in minutes

    this._version = {};
  }

  getLanguages() {
    return this._version.languages;
  }

  async _readGameData() {
    try {
      // attempt to read the game data
      this.gameData = await this.readFile('gameData');
      this._version = await this.readFile('dataVersion');
    } catch(error) {
      throw(error);
    }
  }

  async _unzipGameData() {
    const skipFiles = [
      'gameData.json',
      'dataVersion.json'
    ];
    try {
      console.log(`Falling back to zipped game data included with the stat calc image...`);

      // try to build the game data
      const staticDataFile = await fs.readFileSync(ZIP_FILE);
      const zip = await JSZip.loadAsync(staticDataFile);

      this.gameData = JSON.parse(await (zip.files['gameData.json'].async('text')));
      await this.writeFile('gameData', this.gameData);
      this._version = JSON.parse(await (zip.files['dataVersion.json'].async('text')));
      await this.writeFile('dataVersion', this._version);

      for (const [relativePath, zipEntry] of Object.entries(zip.files)) {
        if (skipFiles.includes(relativePath)) continue;
        let zipContent = JSON.parse(await zipEntry.async('text'));
        // strip off the json file extension
        let fileName = relativePath.replace(/\.[^/.]+$/, "");
        await this.writeFile(fileName, zipContent);
      }
    } catch(error) {
      // if no game data on hand and can't build the game data, fail out
      throw error;
    }
  }

  async _zipGameData() {
    // only create the zip if enabled (not relevant in production)
    if (this.zipGameData) {
      const zip = new JSZip();

      const addFile = (fileName) => {
        zip.file(`${fileName}.json`, fs.createReadStream(path.join(this.dataPath, `${fileName}.json`)));
      };

      try {
        addFile('gameData');
        addFile('dataVersion');
        addFile('statEnum');

        for (const language of this._version.languages) {
          addFile(language);
        }

        console.log(`Writing zip file...`);
        await pipeline(
          zip.generateNodeStream({
            type:'nodebuffer',
            streamFiles:true,
            compression: "DEFLATE",
            compressionOptions: {
                level: 9
            }
          }),
          fs.createWriteStream(ZIP_FILE)
        );
        console.log(`Zip complete!`);
      } catch(error) {
        throw error;
      }
    }
  }

  async init() {
    try {
      // create the data directory if it doesn't exist
      await mkdirp(this.dataPath);
    } catch(error) {
      // if the data directory doesn't exist or can't be created, we have bigger issues
      throw(error);
    }

    try {
      await this._readGameData();
    } catch(error) {
      console.log(`Encountered an error reading the game data: ${error.message}`);

      try {
        // attempt to read base zipped data included with the calculator
        await this._unzipGameData();
      } catch(e) {
        // if the zipped data fails, let it proceed to try to update to new data anyways
        console.log(`Unable to extract the game data from the included zip file: ${e.message}`);
        throw(error);
      }
    }

    return this.gameData;
  }

  async _updateHook(callback) {
    let version;

    try {
      version = await this.gitFetch('allVersions');
      this._enablePolling(callback, version);
    } catch(error) {
      throw(error);
    }

    return {
      gameVersion: version.gameVersion,
      localeVersion: version.localeVersion
    };
  }

  _versionCheck(oldVersion, newVersion) {
    let updated = false;

    if (!isStringEqual(oldVersion.gameVersion, newVersion.gameVersion)) {
      updated = true;
      oldVersion.gameVersion = newVersion.gameVersion;
    }

    if (!isStringEqual(oldVersion.localeVersion, newVersion.localeVersion)) {
      updated = true;
      oldVersion.localeVersion = newVersion.localeVersion;
    }

    return updated;
  };

  _handleVersionNotification(version, newVersion, callback) {
    const updated = this._versionCheck(version, newVersion);
    const versionString = `Game: ${version.gameVersion}, Localization: ${version.localeVersion}`;
    if (updated) {
      console.log(`Received new version from update service: ${versionString}`);
      callback(version);
    } else {
      console.debug(`Received existing version from update service: ${versionString}`);
    }
  }

  _enablePolling(callback, { gameVersion, localeVersion }) {
    const self = this;
    let version = { gameVersion, localeVersion };
    this._updaterInterval = setInterval(async () => {
      try {
        const newVersion = await this.gitFetch('allVersions');

        self._handleVersionNotification(version, newVersion, callback);
      } catch(error) {
        console.error(`Unable to fetch metadata: ${error.message}`);
      }
    }, self.updateInterval * 60 * 1000);
    //                 min  sec   msec
  }

  async listenForUpdates(callback) {
    let updated = false;

    try {
      let version = await this._updateHook(async (receivedVersion) => {
        try {
          updated = await this.updateCheck(receivedVersion.gameVersion, receivedVersion.localeVersion);
        } catch(error) {
          console.error(`Received an updated game data version, but failed to update game data: ${error.message}`);
          callback(error);
          return;
        }

        if (updated) {
          callback(null, this.gameData);
        } else {
          console.log(`Received a version update, but didn't need to updated game data: ${receivedVersion}`);
        }
      });

      await this.updateCheck(version.gameVersion, version.localeVersion);
    } catch(error) {
      throw error;
    }

    return this.gameData;
  }

  gameDataNeedsUpdate(versionString, force = false) {
    return force || !isStringEqual(this._version.game, versionString);
  }

  localizationNeedsUpdate(versionString, force = false) {
    return force || !isStringEqual(this._version.language, versionString);
  }

  async updateGameData(versionString) {
    try {
      console.log(`Updating game data to version ${versionString}...`);
      let gameData = await this.getGitFileData('gameData', versionString)
      if(gameData) console.log(`Fetched gameData for version ${versionString} from git repo successfully...`)
      this._version.game = versionString;
      await this.writeFile('gameData', this.gameData);
    } catch(error) {
      throw(error);
    }
  }

  async updateLocalizationBundle(versionString) {
    try {
      console.log(`Updating localization to version ${versionString}...`);
      let localizationBundle = await this.gitFetch('allVersions');
      if(!localizationBundle) throw(`Error getting allVersions.json from github...`)


      this._version.languages = [];

      // write out name keys for enums
      let statEnums = {};
      for (const [key, value] of Object.entries(localizationMap)) {
        statEnums[value] = key;
      }
      await this.writeFile('statEnum', statEnums);

      for(let i in localizationBundle){
        if(i == 'localeVersion') continue
        if(localizationBundle[i] !== versionString) continue

        let langMap = await this.getGitFileData(i?.replace('.json', ''), versionString)
        if(!langMap) throw(`Error getting ${i} from github...`)

        const lang = i.replace(/(Loc_)|(.txt)|(.json)/gi,'');
        const langName = `${lang.toLocaleLowerCase()}`;
        await this.writeFile(langName, langMap);
        this._version.languages.push(langName);
      }
      this._version.language = versionString;
    } catch(error) {
      throw(error);
    }
  }
  async gitFetch(file) {
    try{
      let res = await fetch(`${this.git_url}/${file}.json`)
      if(res?.status > 400) throw(`fetch error: ${res.status} ${res.statusText}`)
      if(res?.ok) return await res?.json()
      //return await res?.json()
    }catch(e){
      throw(e)
    }
  }
  async getGitFileData(file, version) {
    try{
      let res = await this.gitFetch(file)
      if(res?.data && res?.version == version) return res?.data
    }catch(e){
      throw(e)
    }
  }
  async updateCheck(gameVersion, localizationVersion, force = false) {
    try {
      let updated = false;
      let metaData;
      let enums;
      if (!gameVersion || !localizationVersion) {
        metaData = await this.gitFetch('allVersions');
        gameVersion = metaData?.gameVersion;
        localizationVersion = metaData?.localeVersion;
      }
      const shouldUpdateGameData = this.gameDataNeedsUpdate(gameVersion, force);
      const shouldUpdateLocalization = this.localizationNeedsUpdate(localizationVersion, force);

      if (!metaData && (shouldUpdateGameData || shouldUpdateLocalization)) {
        metaData = await this.getGitFileData('meta', gameVersion);
        enums = await this.getGitFileData('enums', gameVersion);
        const formattedData = buildMetaData(metaData);
      }

      if (shouldUpdateGameData) {
        await this.updateGameData(gameVersion);
        updated = true;
      }

      if (shouldUpdateLocalization) {
        await this.updateLocalizationBundle(localizationVersion);
        updated = true;
      }

      if (updated) {
        await this.writeFile('dataVersion', this._version);
        await this._zipGameData();
      }

      console.log(`Data updates complete! Using ${JSON.stringify(this._version)}`);

      return updated;
    } catch(error) {
      throw(error);
    }
  }

  async writeFile(fileName, jsonContents) {
    try {
      return await fs.promises.writeFile(path.join(this.dataPath, `${fileName}.json`), JSON.stringify(jsonContents), {encoding: "utf8"});
    } catch(error) {
      throw(error);
    }
  }

  async readFile(fileName) {
    try {
      return JSON.parse(await fs.promises.readFile(path.join(this.dataPath, `${fileName}.json`), {encoding: "utf8"}));
    } catch(error) {
      throw(error);
    }
  }
}
function buildMetaData(metaData) {
  let i = metaData.config.length;
  const configMap = {};
  while (i--) {
    const config = metaData.config[i];
    configMap[config.key] = config.value;
  }
}
function isStringEqual(a, b) {
  return (a && b && (a.localeCompare(b) == 0));
}
