#!/bin/bash
export $(xargs <.env)

# Notify healthchecks.io that the job is starting
curl -fsS --retry 3 "${HEALTHCHECKS_URL}/start"

# Start the Docker container in detached mode and get its ID
CONTAINER_ID=$(docker run -d actual-helper)

# Execute the command inside the container
docker exec $CONTAINER_ID node kbb.js
docker exec $CONTAINER_ID node zestimate.js
docker exec $CONTAINER_ID node sync-banks.js



# Stop and remove the container after execution
docker rm -f $CONTAINER_ID


# Notify healthchecks.io that the job has completed
curl -fsS --retry 3 "${HEALTHCHECKS_URL}"
