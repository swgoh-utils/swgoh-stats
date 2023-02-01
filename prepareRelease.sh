#!/bin/bash

[ $# -eq 0 ] && { echo "Usage: $0 release_version"; exit 1; }

# BUILDING DOCKER IMAGES
echo "Building docker image: $CI_REGISTRY_IMAGE:$1..."
docker buildx build --platform linux/amd64,linux/arm64 \
  -t $CI_REGISTRY_IMAGE:$1 \
  -t $CI_REGISTRY_IMAGE:latest \
  .