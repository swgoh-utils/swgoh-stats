const express = require('express');
// init express Router
const router = express.Router();
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const DataBuilder = require('./dataBuilder');

const dataPath = process.env.DATA_PATH || 'statCalcData';

const dataBuilder = new DataBuilder({
  dataPath: dataPath,
  updateInterval: process.env.UPDATE_INTERVAL,
  url: process.env.CLIENT_URL,
  accessKey: process.env.ACCESS_KEY,
  secretKey: process.env.SECRET_KEY,
  zipGameData: process.env.ZIP_GAME_DATA,
  useSegments: process.env.USE_SEGMENTS,
  useUnzip: process.env.USE_UNZIP
});

const statCalculator = require('swgoh-stat-calc');
const helmet = require('helmet');
const compression = require('compression');
const app = express();

app.use(compression());
app.use(function(req, res, next) {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

app.use('/', express.static(path.join(__dirname, 'public')));
app.use(helmet());

const MAX_LEVEL = process.env.MAX_LEVEL || 85;
const MAX_GEAR_LEVEL = process.env.MAX_GEAR_LEVEL || 13;
const MAX_MOD_PIPS = process.env.MAX_MOD_PIPS || 6;
const MAX_RARITY = process.env.MAX_RARITY || 7;
const MAX_RELIC = process.env.MAX_RELIC || 11;
const MAX_MOD_LEVEL = process.env.MAX_MOD_LEVEL || 15;

let gameData;
const MAX_VALUES = {
  char: {
    rarity: MAX_RARITY,
    level: MAX_LEVEL,
    gear: MAX_GEAR_LEVEL,
    equipped: "all",
    relic: MAX_RELIC
  },
  ship: {
    rarity: MAX_RARITY,
    level: MAX_LEVEL,
    skills: "max"
  },
  crew: {
    rarity: MAX_RARITY,
    level: MAX_LEVEL,
    gear: MAX_GEAR_LEVEL,
    equipped: "all",
    skills: "max",
    modRarity: MAX_MOD_PIPS,
    modLevel: MAX_MOD_LEVEL,
    relic: MAX_RELIC
  }
};

app.use('/', express.static(dataPath));

// ******************************
// ***** All Express Routes *****
// ******************************

// ensure proper support for CORS
router.options("/api/*", function(req, res, next){
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.sendStatus(204);
});

// add incoming timestamp
router.use((req,res,next) => {req.timestamp = new Date(); next();});

// parse query into 'options' object
router.use(['/api','/api/characters','/api/characters/:baseID','/api/ships','/api/ships/:baseID'], async (req,res,next) => {
  // flags for data control
  let flags = req.query.flags ? req.query.flags.split(',') : [];
  req.options = {};
  flags.forEach(flag => req.options[flag] = true);

  // useValues definition
  if (req.query.useValues) {
    function addJSONtoObj(text, obj) {
      let propPattern = /(\w+)"?:"?(?:(\d+?)|(\w+?)|(\[.*\]))"?[,}]/g,
          match;
      while ( ( match = propPattern.exec(text) ) !== null) {
        obj[ match[1] ] = +match[2] || match[3] || JSON.parse( match[4] ); // Only array option should be an array of ints, which doesn't use quotes
      }
    }

    let groupPattern = /(char|ship|crew)"?:({.*?})/g;
    let match;
    req.options.useValues = {};
    while ( ( match = groupPattern.exec(req.query.useValues) ) !== null) {
      addJSONtoObj(match[2], req.options.useValues[ match[1] ] = {});
    }

    if (!Object.keys(req.options.useValues).length) { // no sub-objects defined -- just overall parameters
      let obj = {};
      addJSONtoObj(req.query.useValues, obj);
      req.options.useValues = {
        char: {
          rarity: obj.rarity,
          level: obj.level,
          gear: obj.gear,
          equipped: obj.equipped
        },
        ship: {
          rarity: obj.rarity,
          level: obj.level,
          skills: obj.skills
        },
        crew: {
          rarity: obj.rarity,
          level: obj.level,
          gear: obj.gear,
          equipped: obj.equipped,
          skills: obj.skills,
          modRarity: obj.modRarity,
          modLevel: obj.modLevel
        }
      };
    }
  }

  // useMax flag creates (and overwrites) a useValues object in options
  if (req.options.useMax)
    req.options.useValues = Object.assign({}, MAX_VALUES);

  // set language
  if (!req.options.statIDs) { // 'statIDs' flag will leave stats without a language
    let file = "eng_us.json";
    if (req.options.enums) {
      file = "statEnum.json";
    } else {
      let lang = (req.query.language || "eng_us").toLowerCase();
      const languages = dataBuilder.getLanguages();
      // don't allow arbitrary file access - must match a valid language
      if (languages.includes(lang)) {
        file = `${lang}.json`;
      }
    }
    req.options.language = JSON.parse(await fs.promises.readFile(`${dataPath}/${file}`));
  }

  next();
});

// ******************************
// ******* POST Endpoints *******
// ******************************

// rosterType enum object
const rosterType = {
  PLAYER: '/player',          // .help's /player endpoint's full player profile (array of players)
  P_ROSTER: '/player.roster', // .help's /player endpoint's 'roster' property (array of units)
};

// parse out POST body, determine roster type, and define stat options
//   -req.rosterType = rosterType enum for the POST body
//   -req.options = options object for statCalculator
router.post(['/api','/api/characters','/api/ships'], bodyParser.json({limit:'100mb'}), async (req, res, next) => {
  if (req.body.constructor === Array) {
    const body = req.body[0];
    if (body.roster || body.rosterUnit) { // first object in array is a player profile
      req.rosterType = rosterType.PLAYER;
    } else if (body.defId || body.definitionId) { // first object in array is a unit
      req.rosterType = rosterType.P_ROSTER;
    }
  }
  req.calcTime = new Date();
  next();
});

// return stats for all units in roster
router.post('/api', (req, res, next) => {
  try {
    switch (req.rosterType) {
      case rosterType.P_ROSTER:
        res.count = statCalculator.calcRosterStats(req.body, req.options);
        break;
      case rosterType.PLAYER:
        res.count = statCalculator.calcPlayerStats(req.body, req.options);
        break;
      default:
        res.status(400);
        throw new Error('Unsupported object type');
    }
    res.roster = req.body;
    next();
  } catch (e) {
    throw new Error(`Error calculating stats:\n${e.message}`);
  }
});

// return stats for all characters in roster
router.post('/api/characters', async (req, res, next) => {
  let promises = [];
  try {
    switch (req.rosterType) {
      case rosterType.P_ROSTER:
        addRosterCalcPromises(promises, req.body, req.options);
        break;
      case rosterType.PLAYER:
        req.body.forEach( player => addRosterCalcPromises(promises, player.roster, req.options) );
        break;
      default:
        res.status(400);
        return next( new Error('Unsupported object type') );
    }
    for (let i = promises.length-1; i >= 0; i--) {
      await promises[i];
    }
    res.roster = req.body;
    res.count = promises.length;
    next();
  } catch (e) {
    next( new Error(`Error parsing stats:\n${e.message}`) );
  }

  function addRosterCalcPromises(promiseArray, roster, options) {
    roster.forEach( unit => {
      if (gameData.unitData[unit.defId].combatType == 1) {
        promiseArray.push(new Promise( (resolve, reject) => {
          unit.stats = statCalculator.calcCharStats(unit, options);
          resolve(unit);
        }) );
      }
    });
  }
});

// return stats for all ships in roster
router.post('/api/ships', async (req, res, next) => {
  let promises = [];
  try {
    switch (req.rosterType) {
      case rosterType.P_ROSTER:
        addRosterCalcPromises(promises, req.body, req.options);
        break;
      case rosterType.PLAYER:
        req.body.forEach( player => addRosterCalcPromises(promises, player.roster, req.options) );
        break;
      default:
        res.status(400);
        return next( new Error('Unsupported object format') );
    }
    for (let i = promises.length-1; i >= 0; i--) {
      await promises[i];
    }
    res.roster = req.body;
    res.count = promises.length;
    next();
  } catch (e) {
    return next( new Error(`Error parsing stats:\n${e.message}`) );
  }

  function addRosterCalcPromises(promiseArray, roster, options) {
    let crew = {};
    roster.forEach( unit => crew[ unit.defId ] = unit );
    roster.forEach( unit => {
      if (gameData.unitData[unit.defId].combatType == 2) {
        promiseArray.push(new Promise( (resolve, reject) => {
          unit.stats = statCalculator.calcShipStats(unit, gameData.unitData[unit.defId].crew.map(id => crew[id]), options);
          resolve(unit);
        }) );
      }
    });
  }
});

// Send response and report log of request
//   -res.roster = processed object to send
//   -res.count = count of processed units in res.roster
//   -res.error = object with error data if request errored -- expected format like { code: errorCode, err: error object}
router.post(['/api','/api/characters','/api/ships'], async (req, res, next) => {
  res.json(res.roster);
  res.timestamp = new Date();
  let calcTime = res.timestamp - req.calcTime;
  req.log = `${decodeURI(req.originalUrl)} processed ${res.count} unit${res.count == 1 ? '':'s'} in ${req.rosterType} format.\n\t${res.timestamp - req.timestamp} - ${calcTime} - ${calcTime / res.count}`;
  next();
});


// *****************************
// ******* GET Endpoints *******
// *****************************

// Confirm that requested 'baseID' is a valid unit ID, throw error if not.
router.param('baseID', (req, res, next) => {
  if (!gameData.unitData[ req.params.baseID ]) {
    res.status(403);
    throw new Error(`${req.params.baseID} is not a valid/known unit ID`);
  }
  next();
});

/*************** Generic GET Endpoints ***************/

// ensure 'options.useValues' is fully defined
router.get(['/api','/api/characters','/api/characters/:baseID','/api/ships','/api/ships/:baseID'], (req, res, next) => {
  if (!req.options.useValues) // ensure 'useValues' exists
    req.options.useValues = {};
  Object.keys(MAX_VALUES).forEach( unitType => { // for each unit type (char, ship, crew)
    if (!req.options.useValues[ unitType ]) // ensure 'useValues' sub-object exists
      req.options.useValues[ unitType ] = {};
    Object.keys( MAX_VALUES[ unitType ] ).forEach( param => { // for each parameter
      req.options.useValues[ unitType ][ param ] = req.options.useValues[ unitType ][ param ] || MAX_VALUES[ unitType ][ param ];
    });
  });

  next();
});

router.get('/api', (req, res, next) => {
  req.units = [];
  Promise.all( Object.keys(gameData.unitData).map( baseID => {
    return new Promise( (resolve, reject) => {
      resolve(gameData.unitData[baseID].combatType == 1 ?
              statCalculator.calcCharStats({defId: baseID}, req.options) :
              statCalculator.calcShipStats({defId: baseID}, gameData.unitData[ baseID ].crew.map( charID => { return {defId: charID}; }), req.options)
             );
    }).then( stats => {
      return {defId: baseID, stats: stats};
    }, error => {
      return {defId: baseID, stats: {error: error.message}};
    }).then( unit => {
      req.units.push(unit);
    });
  })).then(vals => {res.count = req.units.length; next()}, next);
});

router.get('/api/characters', (req, res, next) => {
  req.units = [];
  Promise.all( Object.keys(gameData.unitData).map( baseID => {
    return new Promise( (resolve, reject) => {
      resolve( gameData.unitData[baseID].combatType == 1 ? statCalculator.calcCharStats({defId: baseID}, req.options) : undefined );
    }).then( stats => {
      if (stats)
        req.units.push( {defId: baseID, stats: stats} );
    }, error => {
      req.units.push( {defId: baseID, stats: {error: error.message}} );
    });
  })).then(vals => {res.count = req.units.length; next()}, next);
});

router.get('/api/ships', (req, res, next) => {
  req.units = [];
  Promise.all( Object.keys(gameData.unitData).map( baseID => {
    return new Promise( (resolve, reject) => {
      resolve( gameData.unitData[baseID].combatType == 1 ? undefined : statCalculator.calcShipStats({defId: baseID}, gameData.unitData[ baseID ].crew.map( charID => { return {defId: charID}; }), req.options) );
    }).then( stats => {
      if (stats)
        req.units.push( {defId: baseID, stats: stats} );
    }, error => {
      req.units.push( {defId: baseID, stats: {error: error.message}} );
    });
  })).then(vals => {res.count = req.units.length; next()}, next);
});

router.get('/api/characters/:baseID', (req, res, next) => {
  if (gameData.unitData[req.params.baseID].combatType == 1) {
    req.unit = { defId: req.params.baseID, stats: statCalculator.calcCharStats({defId: req.params.baseID}, req.options) };
    res.count = 1;
    next();
  } else {
    res.status(403);
    throw new Error(`${req.params.baseID} is not a valid/known character ID`);
  }
});

router.get('/api/ships/:baseID', (req, res, next) => {
  if (gameData.unitData[req.params.baseID].combatType == 2) {
    console.log(JSON.stringify(req.options.useValues));
    req.unit = { defId: req.params.baseID, stats: statCalculator.calcShipStats({defId: req.params.baseID}, gameData.unitData[ req.params.baseID ].crew.map( charID => { return {defId: charID}; }), req.options ) };
    res.count = 1;
    next();
  } else {
    res.status(403);
    throw new Error(`${req.params.baseID} is not a valid/known ship ID`);
  }
});

// send result (should be in req.units)
router.get(['/api','/api/characters','/api/characters/:baseID','/api/ships','/api/ships/:baseID'], (req, res, next) => {
  res.json( req.units || req.unit );
  res.timestamp = new Date();
  req.log = `${decodeURI(req.originalUrl)} processed ${res.count} unit${res.count == 1 ? '':'s'}.\n  useValues: ${JSON.stringify(req.options.useValues)}\n\t${res.timestamp - req.timestamp} - ${ (res.timestamp - req.timestamp) / res.count}`;
  next()
});

// ******************************
// *** All Routes Logs/Errors ***
// ******************************

// log request
router.use( (req, res, next) => {
  if (req.log) {
    console.log(req.log);
  } else {
    console.error(`Log Entry missing for ${decodeURI(req.originalUrl)}\n\t${(res.timestamp || new Date()) - req.timestamp} ms`);
  }
  next();
});

// handle errors
router.use( (err, req, res, next) => {
  if (res.headersSent) { // error while sending -- fall back on default express error handler
    console.error(`Error after sending response to ${decodeURI(req.originalUrl)}`);
    return next(err)
  } else {
    if (res.statusCode == 200) res.status(500); // general error
    res.send(err.message);
    console.error(`Error code ${res.statusCode}: ${req.method} ${decodeURI(req.originalUrl)}\nmessage: ${err.message}\nstack: ${err.stack}`);
  }
});

app.use('/', router);

module.exports = app;
module.exports.initCalc = async () => {
  try {
    gameData = await dataBuilder.init();
    statCalculator.setGameData(gameData);
  } catch(error) {
    throw(error);
  }
};

module.exports.listenForUpdates = async () => {
  try {
    gameData = await dataBuilder.listenForUpdates((error, newGameData) => {
      if (error) {
        console.log(`Error updating game data: ${error.message}`);
      } else {
        gameData = newGameData;
        statCalculator.setGameData(newGameData);
      }
    });
    statCalculator.setGameData(gameData);
  } catch(error) {
    throw(error);
  }
};