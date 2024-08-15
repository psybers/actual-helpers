# Use an official Node.js runtime as a parent image
FROM node:22

# Don't run as root
USER node

# Set the working directory in the container
WORKDIR /usr/src/app

# Create the cache directory
RUN mkdir -p ./cache && chown node:node ./cache

# Copy the current directory contents into the container at /usr/src/app
COPY --chown=node:node . .

# Install any needed packages specified in package.json
RUN npm install && npm update
# Define environment variable
ENV NODE_ENV=production
# Allow self-signed SSL certs
ENV NODE_TLS_REJECT_UNAUTHORIZED=0

# Run the app when the container launches
ENTRYPOINT ["tail", "-f", "/dev/null"]
