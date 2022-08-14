# swgoh-stats

A microservice version of Crinolo's stat calc which works directly with the swgoh-comlink service, and accepts data in the raw format in addition to .help's format.

# Environment Variables

- PORT - the port that the service will listen to
- ACCESS_KEY - the access key to use for signing messages to the swgoh-comlink service. Defaults to "" which disables HMAC signing.
- SECRET_KEY - the secret key to use for signing messages to the swgoh-comlink service. Defaults to "" which disables HMAC signing.
- CLIENT_URL - the url of the swgoh-comlink service to use for building the game data
- DATA_PATH - used to set the directory where game data assets are stored. When run as a docker container, this should be defined as a volume with an absolute path on the local host, such as `-v $(pwd)/statCalcData:/app/statCalcData`.  The default value is the `statCalcData` directory in the current working directory, which in docker is `/app`.
- UPDATE_INTERVAL - how often to check for game data updates, in minutes.  Defaults to 5 minutes.
- MAX_LEVEL - defaults to 85
- MAX_GEAR_LEVEL - defaults to 13
- MAX_MOD_PIPS - defaults to 6
- MAX_RARITY - defaults 7
- MAX_RELIC - defaults to 11 (relic 8)
- MAX_MOD_LEVEL - defaults to 15
- USE_SEGMENTS - Fetches the game data using segments parameter. Fetching in segments may be less memory intensive, but may take longer.  Defaults to false.
- USE_UNZIP - Fetches the localization bundle game data as either a base64 string that needs to be unzipped, or a JSON object that has already been unzipped and processed.  Fetching as JSON is more memory intensive for the client.  Defaults to false (client does not request bundle as unzipped files in a json object).
- ZIP_GAME_DATA - creates/updates a zip of the game data during game data updtes.  Used when bundling a zip of the game data with the docker container which is used to speed up startup when no data exists.  This is not necessary to enable if not building a container to publish.  Defaults to false.

# building with docker
docker build -t swgoh-stats .

# running with docker

docker run --rm -it -p 3223:3223 --env-file .env swgoh-stats

# sample .env file

```
NODE_ENV=production
PORT=3223
CLIENT_URL=http://swgoh-comlink:3000
```

# example script for updating from gitlab docker repository

This script assumes that you set up a docker network ahead of time for swgoh-stats and swgoh-comlink to communicate on, with a command like `docker network create swgoh-comlink`.  If you do not create a network for the containers to talk to each other, you will likely need to use the public IP of your docker host (the IP reported for eth0 in `ifconfig`) and ensure that any OS level firewall like `ufw` will permit the traffic.

```sh
docker pull registry.gitlab.com/swgoh-tools/swgoh-stats:latest
docker stop swgoh-stats
docker rm swgoh-stats
docker run --name=swgoh-stats \
  -d \
  --restart always \
  --network swgoh-comlink \
  --env-file .env-swgoh-stats \
  -p 3223:3223 \
  -u $(id -u):$(id -g) \
  -v $(pwd)/statCalcData:/app/statCalcData \
  registry.gitlab.com/swgoh-tools/swgoh-stats:latest
```