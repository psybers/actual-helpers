# Use an official Node.js runtime as a parent image
FROM node:22.16.0-alpine3.21

RUN apk add --no-cache \
        alsa-lib \
        at-spi2-atk \
        gtk+3.0 \
        nss \
        xdg-utils \
        wget \
        unzip \
        chromium \
        chromium-chromedriver

# Set the working directory in the container
WORKDIR /usr/src/app

# Create the cache directory and set ownership (as root)
RUN mkdir -p ./cache && chown -R node:node ./cache

# Don't run as root
USER node

# Define environment variables
ENV NODE_ENV=production

ENV ACTUAL_SERVER_URL=""
ENV ACTUAL_SERVER_PASSWORD=""
ENV ACTUAL_SYNC_ID=""
# allow self-signed SSL certs
ENV NODE_TLS_REJECT_UNAUTHORIZED=0

# needed for Selenium+chromedriver
ENV CHROMEDRIVER_SKIP_DOWNLOAD=true

# optional, for encrypted files
ENV ACTUAL_FILE_PASSWORD=""

# optional, if you want to use a different cache directory
ENV ACTUAL_CACHE_DIR="./cache"

# optional, name of the payee for added interest transactions
ENV INTEREST_PAYEE_NAME="Loan Interest"

# optional, name of the payee for added interest transactions
ENV INVESTMENT_PAYEE_NAME="Investment"
# optional, name of the cateogry group for added investment tracking transactions
ENV INVESTMENT_CATEGORY_GROUP_NAME="Income"
# optional, name of the category for added investment tracking transactions
ENV INVESTMENT_CATEGORY_NAME="Investment"

# optional, for logging into SimpleFIN
ENV SIMPLEFIN_CREDENTIALS=""

# optional, for retrieving Bitcoin Price (these default to Kraken USD)
ENV BITCOIN_PRICE_URL="https://api.kraken.com/0/public/Ticker?pair=xbtusd"
ENV BITCOIN_PRICE_JSON_PATH="result.XXBTZUSD.c[0]"
ENV BITCOIN_PAYEE_NAME="Bitcoin Price Change"

VOLUME ./cache

# Copy the current directory contents into the container at /usr/src/app
# This should happen after WORKDIR is set and USER is node
COPY --chown=node:node . .

# Install any needed packages specified in package.json
# This should run as the node user
RUN npm install && npm update

# Run the app when the container launches
ENTRYPOINT ["tail", "-f", "/dev/null"]
