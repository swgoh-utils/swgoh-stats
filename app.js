const port = process.env.PORT || 3223;
const expressServer = require('./src/expressServer');
let updateListenerRegistered = false;

const { version } = require('./package.json');

const init = async () => {
  try {
    await expressServer.initCalc();
  } catch(error) {
    console.log(`Encountered an issue initializing the swgoh-stats: ${error.message}`);
    try {
      updateListenerRegistered = true;
      await expressServer.listenForUpdates();
    } catch(e) {
      console.error(`Unable to initialize swgoh-stats: ${e.message}`);
      throw(error);
    }
  }

  // listen for requests :)
  const listener = expressServer.listen(port, () => {
    console.log(`swgoh-stats:${version} is listening on port ${listener.address().port} for swgoh stat requests.`);
  });

  if (!updateListenerRegistered) {
    try {
      await expressServer.listenForUpdates();
    } catch(error) {
      console.warn(`Unable to check for updates for swgoh-stats on startup: ${error.message}`);
    }
  }
};
init().catch((error) => {
  console.error(`Error initializing swgoh-stats:`);
  console.error(error);
  process.exit(1);
});