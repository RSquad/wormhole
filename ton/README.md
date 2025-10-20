# contracts-ton

## Project structure

-   `contracts` - source code of all the smart contracts of the project and their dependencies.
-   `wrappers` - wrapper classes (implementing `Contract` from ton-core) for the contracts, including any [de]serialization primitives and compilation functions.
-   `tests` - tests for the contracts.
-   `scripts` - scripts used by the project, mainly the deployment scripts.

## How to use

### Build

`npx blueprint build` or `yarn blueprint build`

### Test

`npx blueprint test` or `yarn blueprint test`

### Deploy or run another script

`npx blueprint run` or `yarn blueprint run`

### Add a new contract

`npx blueprint create ContractName` or `yarn blueprint create ContractName`

## TON local devnet via Tilt

The steps below explain how to enable the TON watcher in the Wormhole local devnet using Tilt, which connects to the public TON testnet and observes a preconfigured contract.

### Prerequisites

- Tilt and a local Kubernetes cluster (e.g. minikube). See the repository's `DEVELOP.md` for environment setup.

### Quick start (enable TON in devnet)

You can enable the TON component either at startup or after Tilt is running:

```bash
# Option A: enable TON at startup
tilt up -- --ton

# Option B: enable TON after Tilt is already running
tilt args -- --ton
```

When `--ton` is enabled, the guardian is started with TON-specific flags from the Tilt configuration, for example:

- `--tonConfigURL https://ton.org/testnet-global.config.json`
- `--tonContract kQAz5rRlycWBC9dCI8aCx-mQBsOhjsMIdoOmIm_q_yyBTUG4`

Note: the devnet does not spin up a local TON node. The watcher connects to the public TON testnet using `tonConfigURL` and listens to the configured contract. This is sufficient for local Wormhole development that includes TON.

### Useful commands

```bash

# tear down devnet and delete namespace
tilt down --delete-namespaces

# delete all minikube profiles and VMs
minikube delete --all

# start minikube with Docker driver and recommended resources
minikube start --driver=docker --cpus=8 --memory=8g --disk-size=50g

# set default namespace to wormhole
kubectl config set-context --current --namespace=wormhole
```

macOS note (if Tilt fails to start or images build for the wrong architecture):

```bash
export DOCKER_DEFAULT_PLATFORM=linux/amd64
# when using minikube with the Docker driver, this will be inherited as well
tilt up -- --ton=true
```

### Send a Wormhole message from TON (example)

```bash
worm ton send-message "hello from TON" \
  --network devnet \
  --contract-address kQCiBxdRqIyPiphjYwGWxrMC0DPnb7YYv6hRLRBs18b3ytZy \
  --to kQCiBxdRqIyPiphjYwGWxrMC0DPnb7YYv6hRLRBs18b3ytZy \
  --chain-id 62
```

### Relay a VAA (example)

```bash
worm submit <VAA_HEX> --chain <Ton/Ethereum> --network devnet --contract-address kQCiBxdRqIyPiphjYwGWxrMC0DPnb7YYv6hRLRBs18b3ytZy
```

### Get a VAA (example)

```bash
worm get-vaa <CHAIN_ID> <EMITTER_ADDR> <SEQNO>
```

### Example .env (development only)

Do not use these values in production. Create `$HOME/.wormhole/.env` (e.g. `~/.wormhole/.env`):

```bash
TON_MNEMONIC="time violin thank faith else ceiling question shrimp narrow trip ready tell anger ivory fiber sad immense gorilla mix defense drink lizard patch model"
TON_API_KEY="ec01c33940842fbf719fe2a2f6dc458c4f433e14e7d5f04dcb2b65a00b115dd2"
TON_WALLET_VERSION="v4r1"
```

### TON wallet contract versions

```ts
export enum WalletVersion {
    V1R1 = "v1r1",
    V1R2 = "v1r2",
    V1R3 = "v1r3",
    V2R1 = "v2r1",
    V2R2 = "v2r2",
    V3R1 = "v3r1",
    V3R2 = "v3r2",
    V4R1 = "v4r1",
    V4R2 = "v4r2",
    V5R1Final = "v5r1_final",
}
```

