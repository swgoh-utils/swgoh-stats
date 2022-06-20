FROM node:16-alpine AS builder

COPY package*.json ./
# don't install dev dependencies for the docker image
RUN npm install --omit=dev

FROM node:16-alpine AS app
WORKDIR /usr/src/app

COPY --from=builder node_modules .
# copy the rest after
COPY . .

USER node
CMD [ "node", "app.js" ]