const ComlinkStub = require('@swgoh-utils/comlink');
const mkdirp = require('mkdirp');
const fs = require('fs');
const path = require('path');
const util = require('util');
const JSZip = require('jszip');
const { createInterface } = require('readline');
const { once } = require('events');
const pipeline = util.promisify(require('stream').pipeline);
const statEnumMap = require('./statEnumMap.json');
const statEnum = {};
const localizationMap = {};
const ZIP_FILE = path.join(__dirname, `statCalcData.zip`);
const INCLUDE_PVE_UNITS = false;

for (const [key, value] of Object.entries(statEnumMap)) {
  if (value.tableKey) {
    statEnum[value.tableKey] = key;
  }
  if (value.nameKey) {
    localizationMap[value.nameKey] = key;
  }
}

const processLocalizationLine = (line) => {
  if (line.startsWith('#')) return;
  let [ key, val ] = line.split(/\|/g).map(s => s.trim());
  if (!key || !val) return;

  if (localizationMap[key]) {
    val = val.replace(/^\[[0-9A-F]*?\](.*)\s+\(([A-Z]+)\)\[-\]$/, (m,p1,p2) => p1);
    return [key, val];
  }
}

const processStreamByLine = async (fileStream) => {
  const langMap = {};

  try {
    const rl = createInterface({ input: fileStream });

    rl.on('line', (line) => {
      const result = processLocalizationLine(line);
      if (result) {
        const [key, val] = result;
        langMap[localizationMap[key]] = val;
      }
    });

    await once(rl, 'close');
  } catch (err) {
    console.error(err);
  }

  return langMap;
};

const processFileContentsByLine = (content) => {
  const langMap = {};

  let lines = content.split(/\n/g);
  //Iterate each line and build language index
  for (let i = 0; i < lines.length; i++) {
    const result = processLocalizationLine(lines[i]);
    if (result) {
      const [key, val] = result;
      langMap[localizationMap[key]] = val;
    }
  }

  return langMap;
}

module.exports = class DataBuilder {
  constructor(options = {}) {
    this.dataPath = options.dataPath;
    this.gameData = {};
    this.zipGameData = (options.zipGameData && options.zipGameData === "true") ? true : false;
    this.useSegments = (options.useSegments && options.useSegments === "true") ? true : false;
    this.useUnzip = (options.useUnzip && options.useUnzip === "true") ? true : false;

    this.clientStub = new ComlinkStub({
      url: options.url || 'http://localhost:3000',
      accessKey: options.accessKey || '',
      secretKey: options.secretKey || ''
    });

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
      version = await this.clientStub.getMetaData();
      this._enablePolling(callback, version);
    } catch(error) {
      throw(error);
    }

    return {
      latestGamedataVersion: version.latestGamedataVersion,
      latestLocalizationBundleVersion: version.latestLocalizationBundleVersion
    };
  }

  _versionCheck(oldVersion, newVersion) {
    let updated = false;

    if (!isStringEqual(oldVersion.latestGamedataVersion, newVersion.latestGamedataVersion)) {
      updated = true;
      oldVersion.latestGamedataVersion = newVersion.latestGamedataVersion;
    }

    if (!isStringEqual(oldVersion.latestLocalizationBundleVersion, newVersion.latestLocalizationBundleVersion)) {
      updated = true;
      oldVersion.latestLocalizationBundleVersion = newVersion.latestLocalizationBundleVersion;
    }

    return updated;
  };

  _handleVersionNotification(version, newVersion, callback) {
    const updated = this._versionCheck(version, newVersion);
    const versionString = `Game: ${version.latestGamedataVersion}, Localization: ${version.latestLocalizationBundleVersion}`;
    if (updated) {
      console.log(`Received new version from update service: ${versionString}`);
      callback(version);
    } else {
      console.debug(`Received existing version from update service: ${versionString}`);
    }
  }

  _enablePolling(callback, { latestGamedataVersion, latestLocalizationBundleVersion }) {
    const self = this;
    let version = { latestGamedataVersion, latestLocalizationBundleVersion };
    this._updaterInterval = setInterval(async () => {
      try {
        const newVersion = await self.clientStub.getMetaData();

        self._handleVersionNotification(version, newVersion, callback);
      } catch(error) {
        self.logger.error(`Unable to fetch metadata: ${error.message}`);
      }
    }, self.updateInterval * 60 * 1000);
    //                 min  sec   msec
  }

  async listenForUpdates(callback) {
    let updated = false;

    try {
      let version = await this._updateHook(async (receivedVersion) => {
        try {
          updated = await this.updateCheck(receivedVersion.latestGamedataVersion, receivedVersion.latestLocalizationBundleVersion);
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

      await this.updateCheck(version.latestGamedataVersion, version.latestLocalizationBundleVersion);
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

      let gameData;
      if (this.useSegments) {
        const { GameDataSegment } = await this.clientStub.getEnums();

        const collections = [
          'equipment',
          'relicTierDefinition',
          'skill',
          'statModSet',
          'statProgression',
          'table',
          'units',
          'xpTable'
        ];

        gameData = {};

        const segments = Object.entries(GameDataSegment);
        let found = 0;
        for (let i = 0; i < segments.length - 1; i++) {
          const [key, val] = segments[i];

          if (!val) continue;
          const data = await this.clientStub.getGameData(versionString, INCLUDE_PVE_UNITS, val);

          for (const collection of collections) {
            if (!gameData[collection] && data[collection] && data[collection].length > 0) {
              console.log(`Found ${collection} in segment ${val}`);
              gameData[collection] = data[collection];
              found++;
            }
          }

          if (found === collections.length) {
            console.log(`Found all data collections by segment ${val}, no need to continue`);
          }
        }
      } else {
        console.log(`Fetching game data without using segments parameter`);
        gameData = await this.clientStub.getGameData(versionString, INCLUDE_PVE_UNITS);
      }

      this._version.game = versionString;

      this.gameData = buildData(gameData);
      await this.writeFile('gameData', this.gameData);
    } catch(error) {
      throw(error);
    }
  }

  async updateLocalizationBundle(versionString) {
    try {
      console.log(`Updating localization to version ${versionString}...`);
      const unzip = this.useUnzip;
      let localizationBundle = await this.clientStub.getLocalizationBundle(versionString, unzip);
      this._version.language = versionString;
      this._version.languages = [];

      // write out name keys for enums
      let statEnums = {};
      for (const [key, value] of Object.entries(localizationMap)) {
        statEnums[value] = key;
      }
      await this.writeFile('statEnum', statEnums);

      if (!unzip) {
        const zipped = await (new JSZip())
          .loadAsync(Buffer.from(localizationBundle.localizationBundle, 'base64'), { base64:true });
        localizationBundle = Object.entries(zipped.files);
      } else {
        localizationBundle = Object.entries(localizationBundle);
      }

      // iterate languages
      for (let [language, content] of localizationBundle) {
        let langMap;

        if (!unzip) {
          const fileStream = content.nodeStream();
          langMap = await processStreamByLine(fileStream);
        } else {
          langMap = processFileContentsByLine(content);
        }

        if (Object.keys(langMap).length > 0) {
          const lang = language.replace(/(Loc_)|(.txt)/gi,'');
          const langName = `${lang.toLocaleLowerCase()}`;
          await this.writeFile(langName, langMap);
          this._version.languages.push(langName);
        }
      }
    } catch(error) {
      throw(error);
    }
  }

  async updateCheck(gameVersion, localizationVersion, force = false) {
    try {
      let updated = false;
      let metaData;
      let enums;
      if (!gameVersion || !localizationVersion) {
        metaData = await this.clientStub.getMetaData();
        gameVersion = metaData.latestGamedataVersion;
        localizationVersion = metaData.latestLocalizationBundleVersion;
      }
      const shouldUpdateGameData = this.gameDataNeedsUpdate(gameVersion, force);
      const shouldUpdateLocalization = this.localizationNeedsUpdate(localizationVersion, force);

      if (!metaData && (shouldUpdateGameData || shouldUpdateLocalization)) {
        metaData = await this.clientStub.getMetaData();
        enums = await this.clientStub.getEnums();
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

function getMasteryMultiplierName(primaryStatID, tags) {
  let primaryStats = {
    2: "strength",
    3: "agility",
    4: "intelligence"
  };
  let [role] = tags.filter( tag => /^role_(?!leader)[^_]+/.test(tag)); // select 'role' tag that isn't role_leader
  return `${primaryStats[ primaryStatID ]}_${role}_mastery`;
}


// Build gameData object through swapi.  Returns true if successful.
function buildData(data) {
  console.log("Building new gameData...");

  const gameData = {};
  const statTables = buildStatProgressionList(data.statProgression);

  gameData.modSetData = buildModSetData(data.statModSet);
  const {crTables, gpTables } = buildTableData(data.table, data.xpTable);
  gameData.crTables = crTables;
  gameData.gpTables = gpTables;

  gameData.gearData = buildGearData(data.equipment);
  gameData.relicData = buildRelicData(data.relicTierDefinition, statTables);
  gameData.unitData = buildUnitData(data.units, data.skill, statTables);

  return gameData;
}

function buildGearData(equipmentList) {
  const data = {};

  equipmentList.forEach( gear => {
    const statList = gear.equipmentStat.stat;
    if (statList.length > 0) {
      data[ gear.id ] = { stats: {} };
      statList.forEach( stat => {
        data[ gear.id ].stats[ stat.unitStatId ] = +stat.unscaledDecimalValue;
      });
    }
  });

  return data;
}

function buildModSetData(statModSetList) {
  const data = {};

  statModSetList.forEach( set => {
    data[ set.id ] = {
      id: set.completeBonus.stat.unitStatId,
      count: set.setCount,
      value: +set.completeBonus.stat.unscaledDecimalValue
    };
  });

  return data;
}

function buildTableData(tableList, xpTableList) {
  const data = {cr: {}, gp: {}};

  parseTableList(tableList, data);
  parseXPTableList(xpTableList, data);

  return {
    crTables: data.cr,
    gpTables: data.gp
  };
}

function parseTableList(tableList, data) {
  const rarityEnum = {
    "ONE_STAR": 1,
    "TWO_STAR": 2,
    "THREE_STAR": 3,
    "FOUR_STAR": 4,
    "FIVE_STAR": 5,
    "SIX_STAR": 6,
    "SEVEN_STAR": 7
  };

  tableList.forEach( table => {
    let c, g;
    switch( table.id ) {
      case "galactic_power_modifier_per_ship_crew_size_table":
        data.gp.crewSizeFactor = {}
        table.row.forEach( row => {
          data.gp.crewSizeFactor[ row.key ] = +row.value;
        });
        break;
      case "crew_rating_per_unit_rarity":
        data.cr.crewRarityCR = {};
        table.row.forEach( row => {
          data.cr.crewRarityCR[ rarityEnum[row.key] ] = +row.value;
        });
        data.gp.unitRarityGP = data.cr.crewRarityCR; // used for both CR and GP
        break;
      case "crew_rating_per_gear_piece_at_tier":
        data.cr.gearPieceCR = {};
        table.row.forEach( row => {
          data.cr.gearPieceCR[ row.key.match(/TIER_0?(\d+)/)[1] ] = +row.value;
        });
        break;
      case "galactic_power_per_complete_gear_tier_table":
        data.gp.gearLevelGP = { 1: 0 }; // initialize with value of 0 for unit's at gear 1 (which have none 'complete')
        table.row.forEach( row => {
          // 'complete gear tier' is one less than current gear level, so increment key by one
          data.gp.gearLevelGP[ ++(row.key.match(/TIER_0?(\d+)/)[1]) ] = +row.value;
        });
        data.cr.gearLevelCR = data.gp.gearLevelGP; // used for both GP and CR
        break;
      case "galactic_power_per_tier_slot_table":
        g = data.gp.gearPieceGP = {};
        table.row.forEach( row => {
          let [ tier, slot ] = row.key.split(":");
          g[ tier ] = g[ tier ] || {}; // ensure table exists for this gear level
          g[ tier ][ --slot ] = +row.value; // decrement slot by 1 as .help uses 0-based indexing for slot (game table is 1-based)
        });
        break;
      case "crew_contribution_multiplier_per_rarity":
        data.cr.shipRarityFactor = {};
        table.row.forEach( row => {
          data.cr.shipRarityFactor[ rarityEnum[row.key] ] = +row.value;
        });
        data.gp.shipRarityFactor = data.cr.shipRarityFactor; // used for both CR and GP
        break;
      case "galactic_power_per_tagged_ability_level_table":
        g = data.gp.abilitySpecialGP = {};
        table.row.forEach( row => {
          g[ row.key ] = +row.value;
          // if ( row.key == "zeta" ) g[ row.key ] = +row.value;
          // else {
            // let [ , type, level] = row.key.match(/^(\w+)_\w+?(\d)?$/);
            // switch (type) {
              // case "contract":
                // g[ type ] = g[ type ] || {}; // ensure 'contract' table exists
                // g[ type ][ ++level || 1 ] = +row.value;
                // break;
              // case "reinforcement":
                // g[ "hardware" ] = g[ "hardware" ] || {1: 0}; // ensure 'hardware' table exists (and counts 0 xp for tier 1)
                // g[ "hardware" ][ ++level ] = +row.value;
                // break;
              // default:
                // console.error(`Unknown ability type '${row.key}' found.`);
            // }
          // }
        });
        break;
      case "crew_rating_per_mod_rarity_level_tier":
        c = data.cr.modRarityLevelCR = {};
        g = data.gp.modRarityLevelTierGP = {};
        table.row.forEach( row => {
          if ( row.key.slice(-1) == "0") { // only 'select' set 0, as set doesn't affect CR or GP
            let [ pips, level, tier, set ] = row.key.split(":");
            if ( +tier == 1) { // tier doesn't affect CR, so only save for tier 1
              c[ pips ] = c[ pips ] || {}; // ensure table exists for that rarity
              c[ pips ][ level ] = +row.value;
            }
            g[ pips ] = g[ pips ] || {}; // ensure rarity table exists
            g[ pips ][ level ] = g[ pips ][ level ] || {}; // ensure level table exists
            g[ pips ][ level ][ tier ] = +row.value;
          }
        });
        break;
      case "crew_rating_modifier_per_relic_tier":
        data.cr.relicTierLevelFactor = {};
        table.row.forEach( row => {
          data.cr.relicTierLevelFactor[ +row.key + 2 ] = +row.value; // relic tier enum is relic level + 2
        });
        break;
      case "crew_rating_per_relic_tier":
        data.cr.relicTierCR = {};
        table.row.forEach( row => {
          data.cr.relicTierCR[ +row.key + 2 ] = +row.value;
        });
        break;
      case "galactic_power_modifier_per_relic_tier":
        data.gp.relicTierLevelFactor = {};
        table.row.forEach( row => {
          data.gp.relicTierLevelFactor[ +row.key + 2 ] = +row.value; // relic tier enum is relic level + 2
        });
        break;
      case "galactic_power_per_relic_tier":
        data.gp.relicTierGP = {};
        table.row.forEach( row => {
          data.gp.relicTierGP[ +row.key + 2 ] = +row.value;
        });
        break;
      case "crew_rating_modifier_per_ability_crewless_ships":
        data.cr.crewlessAbilityFactor = {};
        table.row.forEach( row => {
          data.cr.crewlessAbilityFactor[ row.key ] = +row.value;
        });
        break;
      case "galactic_power_modifier_per_ability_crewless_ships":
        data.gp.crewlessAbilityFactor = {};
        table.row.forEach( row => {
          data.gp.crewlessAbilityFactor[ row.key ] = +row.value;
        });
        break;
      case (table.id.match(/_mastery/) || {}).input: // id matches itself only if it ends in _mastery
        // These are not actually CR or GP tables, but were placed in the 'crTables' section of gameData when first implemented.
        // Still placed there for backwards compatibility
        data.cr[ table.id ] = {};
        table.row.forEach( row => {
          data.cr[ table.id ][ statEnum[row.key] ] = +row.value;
        });
        break;
      default:
        return;
    }
  });
};

function parseXPTableList(xpTableList, data) {
  xpTableList.forEach( table => {
    let tempTable = {};
    if ( /^crew_rating/.test(table.id) || /^galactic_power/.test(table.id) ) {
      table.row.forEach( row => {
        tempTable[ ++row.index ] = row.xp;
      });
      switch ( table.id ) {
        // 'CR' tables appear to be for both CR and GP on characters
        // 'GP' tables specify ships, but are currently idendical to the 'CR' tables.
        case "crew_rating_per_unit_level":
          data.cr.unitLevelCR = tempTable;
          data.gp.unitLevelGP = tempTable;
          break;
        case "crew_rating_per_ability_level":
          data.cr.abilityLevelCR = tempTable;
          data.gp.abilityLevelGP = tempTable;
          break;
        case "galactic_power_per_ship_level_table":
          data.gp.shipLevelGP = tempTable;
          break;
        case "galactic_power_per_ship_ability_level_table":
          data.gp.shipAbilityLevelGP = tempTable;
          break;
        default:
          return;
      }
    }
  });
}

function parseSkills(skillList) {
  const skills = {};
  skillList.forEach( skill => {
    let s = {
      id: skill.id,
      maxTier: skill.tier.length + 1,
      powerOverrideTags: {},
      isZeta: skill.tier.slice(-1)[0].powerOverrideTag == "zeta"
    };
    skill.tier.forEach( (tier, i) => {
      if (tier.powerOverrideTag) {
        s.powerOverrideTags[ i+2 ] = tier.powerOverrideTag;
      }
    });
    skills[ skill.id ] = s;
  });

  return skills;
}

function buildUnitData(unitsList, skillList, statTables) {
  const skills = parseSkills(skillList);
  const baseList = [];
  const unitGMTables = {};

  let i = unitsList.length;
  while (i--) {
    const unit = unitsList[i];

    if (unit.obtainable && unit.obtainableTime === '0') {
      unitGMTables[ unit.baseId ] = unitGMTables[ unit.baseId ] || {}; // ensure unit's table exists
      unitGMTables[ unit.baseId ][ unit.rarity ] = statTables[ unit.statProgressionId ];

      if (unit.rarity === 1) {
        baseList.push(unit);
      }
    }
  }

  const data = {};

  baseList.forEach( unit => {
    if ( unit.combatType == 1 ) { // character
      const tierData = {};
      const relicData = {};
      unit.unitTier.forEach( gearTier => {
        tierData[ gearTier.tier ] = { gear: gearTier.equipmentSet, stats: {}}
        gearTier.baseStat.stat.forEach( stat => {
          tierData[ gearTier.tier ].stats[ stat.unitStatId ] = +stat.unscaledDecimalValue;
        });
      });
      unit.relicDefinition.relicTierDefinitionId.forEach( tier => {
        relicData[ +tier.slice(-2) + 2 ] = tier;
      });
      data[unit.baseId] = {
        combatType: 1,
        primaryStat: unit.primaryUnitStat,
        gearLvl: tierData,
        growthModifiers: unitGMTables[ unit.baseId ],
        skills: unit.skillReference.map( skill => skills[ skill.skillId ] ),
        relic: relicData,
        masteryModifierID: getMasteryMultiplierName(unit.primaryUnitStat, unit.categoryId)
      };
    } else { // ship
      const stats = {}
      unit.baseStat.stat.forEach( stat => {
        stats[ stat.unitStatId ] = +stat.unscaledDecimalValue;
      });
      let ship = {
        combatType: 2,
        primaryStat: unit.primaryUnitStat,
        stats: stats,
        growthModifiers: unitGMTables[ unit.baseId ],
        skills: unit.skillReference.map( skill => skills[ skill.skillId ] ),
        crewStats: statTables[ unit.crewContributionTableId ],
        crew: []
      };
      unit.crew.forEach( crew => {
        ship.crew.push( crew.unitId );
        crew.skillReference.forEach( s => ship.skills.push( skills[ s.skillId ] ) );
      });
      data[unit.baseId] = ship;
    }
  });

  return data;
}

function buildRelicData(relicList, statTables) {
  const data = {};
  relicList.forEach( relic => {
    data[ relic.id ] = { stats: {}, gms: statTables[ relic.relicStatTable ] };
    relic.stat.stat.forEach( stat => {
      data[ relic.id ].stats[ stat.unitStatId ] = +stat.unscaledDecimalValue;
    });
  });

  return data;
}

function buildStatProgressionList(statProgressionList) {
  const statTables = {};
  statProgressionList.forEach( table => {
    if ( /^stattable_/.test(table.id) ) {
      const tableData = {};
      table.stat.stat.forEach(stat => {
        tableData[ stat.unitStatId ] = +stat.unscaledDecimalValue;
      });
      statTables[ table.id ] = tableData;
    }
  });
  return statTables;
}

function isStringEqual(a, b) {
  return (a && b && (a.localeCompare(b) == 0));
}