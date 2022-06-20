#!/bin/bash

[ $# -eq 0 ] && { echo "Usage: $0 release_version"; exit 1; }

echo "Building docker image: $CI_REGISTRY_IMAGE:$1..."
docker build --pull -t $CI_REGISTRY_IMAGE:$1 .
# tag latest for local repository
docker tag $CI_REGISTRY_IMAGE:$1 $CI_REGISTRY_IMAGE:latest