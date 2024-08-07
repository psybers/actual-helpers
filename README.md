# Actual Budget Helper Scripts

This is a collection of useful scripts to help you manage your Actual Budget.

- [Requirements](#requirements)
- [Configuration](#configuration)
- [Installation](#installation)
- Scripts:
    - [Sync Remote Banks](#sync-remote-banks)
    - [Loan Interest Calculator](#loan-interest-calculator)
    - [Tracking Home Prices (Zillow's Zestimate)](#tracking-home-prices-zillows-zestimate)
    - [Tracking Car Prices (Kelley Blue Book)](#tracking-car-prices-kelley-blue-book)
    - [Tracking Investment Accounts](#tracking-investment-accounts)

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

Note that most of the scripts utilize account notes to set configuration on
each account.  The scripts will find all accounts that are configured and
update them all in a single call.

### Sync Remote Banks

This script will sync all remote banks that are configured in Actual Budget.
This can be used in place of clicking the "Sync" button in the Actual Budget
app and will ensure your accounts are always up-to-date with
GoCardless/SimpleFIN.

To run:

```console
$ node sync-banks.js
```

It is recommended to run this script once per day or week.

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

### Tracking Home Prices (Zillow's Zestimate)

This script tracks the Zillow Zestimate for a home.  It adds new transactions
to keep the account balance equal to the latest Zestimate.

To use this script, you need to create a new account in Actual Budget and set
the account note to `zestimate:<Zillow URL>`.  You can find the Zillow URL by
searching for the home on Zillow and copying the URL from the address bar.

For example, if you want to track the Zestimate for a home with the URL
`https://www.zillow.com/homes/123-Example-St-Anytown-CA-12345/12345678_zpid/`,
set the account note to
`zestimate:https://www.zillow.com/homes/123-Example-St-Anytown-CA-12345/12345678_zpid/`.

Optionally, you can also specify if you only own a portion of the home by
adding an `ownership:0.0X` tag to the account note.  For example, if you own
10% of the home, add `ownership:0.10` to the account note.  The script will
then use that percentage to track the home's value.

You can optionally change the payee used for the transactions by setting
`IMPORTER_ZESTIMATE_PAYEE_NAME` in the `.env` file.

To run:

```console
$ node zestimate.js
```

It is recommended to run this script once per month.

### Tracking Car Prices (Kelley Blue Book)

This script tracks the Kelley Blue Book value for a car.  It adds new
transactions to keep the account balance equal to the latest KBB value.

To use this script, first you need to use the KBB website to find the value
of your car.  Be sure to select "Private Party" for the value.  It should show
something like this:

![KBB price of a car](images/kbb-price.png)

Then right click on the price and select "Inspect" to view the page HTML.
From there, grab the URL for the image:

![HTML](images/kbb-html.png)

Then for your Actual account, set the following tags in the account note based
on the values in the URL.

- `kbbURL:https://upa.syndication.kbb.com/usedcar/privateparty/sell/?apikey=XX-XX-XX-XX-XX`
- `kbbZipcode:XXXXX`
- `kbbCondition:good` (or whatever condition you want to use)
- `kbbMileage:XXXXX` (miles on the car, no commas)
- `kbbDailyMileage:XXXXX` (if given, will auto-update the mileage based on this daily average)
- `kbbVehicleid:XXXXXX`
- `kbbOptions:XXX,XXX,XXX,...`

You can optionally change the payee used for the transactions by setting
`IMPORTER_KBB_PAYEE_NAME` in the `.env` file.

To run:

```console
$ node kbb.js
```

It is recommended to run this script once per month.  Note that you will have
to periodically update the mileage in the account note.

### Tracking Investment Accounts

**NOTE: This script only works with SimpleFIN accounts.**

This script tracks the value of an investment account.  It adds new
transactions to keep the account balance equal to the latest value.  This
requires connecting to SimpleFIN to grab the reported account balance, so
that the script can update the transactions to reflect that balance.

Note that I have some rules set up on the accounts that the script assumes.
First, all payees are set to the same name "Investment".  Second, any money I
add to the account to fund it I set the category to something different.  In
my case, since I am funding these with my paycheck I categorize them as
"Paycheck" but the key is to set a category different from the ones the script
will utilize.  Then all other transactions are categorized as "Investment".

There are three tags you can set in the account notes:

- `calcInvestment` - this is the tag that tells the script to track the
  balance.  You will want this on each account, and then optionally one of the
  following.
- `zeroSmall` - this is a helper tag that will zero out any small transactions
  (less than $10). This is useful for accounts that have a lot of small
  transactions that you don't want to track.  For example, one of my accounts
  shows dividends as separate transactions, so I use this tag to ignore
  those as my account balance does not actually change when those occur (they
  are reinvested).
- `dropPayments` - this is a helper tag that will zero out anything in the
  payment column.  One of my accounts lists stock purchases as separate
  transactions, so I ignore those as my account balance does not actually
  change when those occur.  But these are typically larger payments and I want
  to keep small payments (interest accrued) so I use this tag on that account
  instead of `zeroSmall`.

Note that the code has a function named `shouldDrop` that might need to be
modified.  This function lists transactions whose note contains certain
strings that are targeted when using `zeroSmall` and `dropPayments`.  You may
need to update this to add additional notes to look for.

To run:

```console
$ node track-investments.js
```

It is recommended to run this script once per month.
