FROM node:16-alpine AS builder
WORKDIR /usr/src/app

# dependencies change infrequently, copy them first and run install since it's expensive
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