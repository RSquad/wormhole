#!/bin/bash

#
# This script deploys the CommentIntegrator contract.
# Usage: RPC_URL= MNEMONIC= EVM_CHAIN_ID= WORMHOLE_ADDRESS= ./sh/deployCommentIntegrator.sh
#  tilt: ./sh/deployCommentIntegrator.sh
#  anvil: EVM_CHAIN_ID=31337 MNEMONIC=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 WORMHOLE_ADDRESS=0x... ./sh/deployCommentIntegrator.sh

if [ "${RPC_URL}X" == "X" ]; then
  RPC_URL=http://localhost:8545
fi

if [ "${MNEMONIC}X" == "X" ]; then
  MNEMONIC=0x4f3edf983ac636a65a842ce7c78d9aa706d3b113bce9c46f30d7d21715b23b1d
fi

if [ "${EVM_CHAIN_ID}X" == "X" ]; then
  EVM_CHAIN_ID=1337
fi

# Get Wormhole address from environment or use devnet default
if [ "${WORMHOLE_ADDRESS}X" == "X" ]; then
  WORMHOLE_ADDRESS=0xC89Ce4735882C9F0f0FE26686c53074E09B0D550
fi

# Get Executor address from environment (required)
if [ "${EXECUTOR_ADDRESS}X" == "X" ]; then
  echo "Error: EXECUTOR_ADDRESS not set"
  exit 1
fi

WORMHOLE_ADDRESS="$WORMHOLE_ADDRESS" EXECUTOR_ADDRESS="$EXECUTOR_ADDRESS" forge script ./forge-scripts/DeployCommentIntegrator.s.sol:DeployCommentIntegrator \
	--sig "run()" \
	--rpc-url "$RPC_URL" \
	--private-key "$MNEMONIC" \
	--broadcast ${FORGE_ARGS}

returnInfo=$(cat ./broadcast/DeployCommentIntegrator.s.sol/$EVM_CHAIN_ID/run-latest.json)

COMMENT_INTEGRATOR_ADDRESS=$(jq -r '.returns.deployedAddress.value' <<< "$returnInfo")

echo "Deployed CommentIntegrator to address: $COMMENT_INTEGRATOR_ADDRESS"
echo "Wormhole address: $WORMHOLE_ADDRESS"
echo "Executor address: $EXECUTOR_ADDRESS"

