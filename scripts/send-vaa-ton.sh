#!/usr/bin/env bash
# This script submits a VAA to TON devnet
set -e

vaaInput=${1}
tonContract=${2:-"kQBWynzOaXFc4Hzpv-zoo6JQegzz5GRrolfl8rt59wfXqidk"}

echo "Submitting VAA to TON devnet..."
echo "VAA: ${vaaInput}"
echo "Contract: ${tonContract}"

worm submit "${vaaInput}" --chain Ton --network devnet --contract-address "${tonContract}"

echo "Done executing VAA on TON."

