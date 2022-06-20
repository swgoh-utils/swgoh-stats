#!/bin/bash

[ $# -eq 0 ] && { echo "Usage: $0 release_version"; exit 1; }

echo "Publishing: $CI_REGISTRY_IMAGE:$1..."

docker push $CI_REGISTRY_IMAGE:$1
docker push $CI_REGISTRY_IMAGE:latest