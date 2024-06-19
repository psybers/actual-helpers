# Actual Budget Helper Scripts

This is a collection of useful scripts to help you manage your Actual Budget.

- [Requirements](#requirements)
- [Configuration](#configuration)
- [Installation](#installation)
- Scripts:
  - [Loan Interest Calculator](#loan-interest-calculator)

## Requirements

- [Actual Budget](https://actualbudget.org/)
- [Node.js](https://nodejs.org/) (21.6.2+)
    - [@actual-app/api](https://www.npmjs.com/package/@actual-app/api)
    - [dotenv](https://www.npmjs.com/package/dotenv)
    - [jsdom](https://www.npmjs.com/package/jsdom)

## Configuration

Create a `.env` file in the root directory with the following content:

```python
ACTUAL_SERVER_URL="https://<Actual Budget server URL>"
ACTUAL_SERVER_PASSWORD="<Actual Budget server password>"
ACTUAL_SYNC_ID="<Actual Budget sync ID>"

# optional, for encrypted files
ACTUAL_FILE_PASSWORD="<file password>"

# optional, if you want to use a different cache directory
ACTUAL_CACHE_DIR="./cache"

# optional, name of the payee for added interest transactions
IMPORTER_INTEREST_PAYEE_NAME="Loan Interest"
```

## Installation

Run `npm install` to install any required dependencies.

## Scripts

### Loan Interest Calculator

This script calculates the interest for a loan account and adds the interest
transactions to Actual Budget.

For each account that you want to automaitcally calculate interest for, you
need to edit the account notes and add the following tags:

- `interestRate:0.0X` sets the interest rate to X percent (note: be sure to
    enter the rate as a decimal and not a percentage)
- `interestDay:XX` sets the day of the month that the interest is calculated

As an example, if your loan is at 4.5% interest and you want to insert an
interest transaction on the 28th of the month, set the account note to
`interestRate:0.045 interestDay:28`.

You can optionally change the payee used for the interest transactions by
setting `IMPORTER_INTEREST_PAYEE_NAME` in the `.env` file.

To run:

```console
$ node apply-interest.js
```

It is recommended to run this script once per month.
