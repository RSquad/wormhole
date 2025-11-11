CORE_ETH ?= 0xC89Ce4735882C9F0f0FE26686c53074E09B0D550
CORE_TON ?= kQDdZwjsO7dTFbq-Z_luMizPN5IS6ODcUlBftEhMIKXFk4D9
INTEGRATOR_TON ?= kQA0NNh49BshorfkO_UskbYPCNgsIh3rXtuyjCRbUUuXwdXG
INTEGRATOR_ETH ?= 0xfE82e8f24A51E670133f4268cDfc164c49FC3b37
RPC_KEY ?= 4f3edf983ac636a65a842ce7c78d9aa706d3b113bce9c46f30d7d21715b23b1d
RPC_URL ?= http://127.0.0.1:8545

SHELL = /usr/bin/env bash

check-%:
	@: $(if $(value $*),,$(error $* is required, e.g. make encode-comment $*="msg to TON"))

get-vaa:
	worm get-vaa 62 a2071751a88c8f8a9863630196c6b302d033e76fb618bfa8512d106cd7c6f7ca 7

scan-vaa:
	curl https://api.wormholescan.io/api/v1/vaas/2/0000000000000000000000003ee18b2214aff97000d974cf647e7c347e8fa585/573083 | jq

get-parsed-vaa:
	worm parse $(curl http://localhost:7071/v1/signed_vaa/62/a2071751a88c8f8a9863630196c6b302d033e76fb618bfa8512d106cd7c6f7ca/7 | jq .vaaBytes) | jq
get-fee:
	cast call $(CORE_ETH) "messageFee()(uint256)" --rpc-url $(RPC_URL)

get-guardian-set:
	cast call $(CORE_ETH) "guardianSet(uint32)" 0 --rpc-url $(RPC_URL)

deploy-evm-integrator:
	forge create ethereum/contracts/integrator/CommentIntegrator.sol:CommentIntegrator \
	--broadcast --rpc-url $(RPC_URL) --private-key "$(RPC_KEY)" --constructor-args $(CORE_ETH)

send-comment-ton: check-COMMENT
	worm ton send-message "$(COMMENT)" \
	--network devnet --contract-address $(INTEGRATOR_TON) \
	--to 0QAPBt1yVUndYKbKN0OsUy21J4nLFa8flD_patu0wahhVe_P --chain-id 2

send-comment-eth:
	cast send --private-key "$(RPC_KEY)" --rpc-url $(RPC_URL) --value 0 \
	$(CORE_ETH) "publishMessage(uint32,bytes,uint8)" \
	1 003e00000000000000000000000090f8bf6a479f320ead074411a4b0e7944ea8c9c166726f6d2065746820746f20696e7465677261746f7220746f6e 0

deliver-ton: check-VAA
	worm submit "$(VAA)" --chain Ton --network devnet --contract-address $(INTEGRATOR_TON)

deliver-eth: check-VAA
	worm submit "$(VAA)" --chain ethereum --network devnet --contract-address $(INTEGRATOR_ETH)

relay-eth:
	cast send --private-key "4f3edf983ac636a65a842ce7c78d9aa706d3b113bce9c46f30d7d21715b23b1d" --rpc-url http://127.0.0.1:8545/ --value 0 \
	0x6f84742680311CEF5ba42bc10A71a4708b4561d1 \
	 "relayComment(bytes)" \
	01000000000100cd9e968e1f3c006fc2b8157f869fc3e0d87d84f03596b5bc9657981e7594b7657373cb4663b80e07e65d91f38a12d716c921313ac7fb762d93fd141fc6e4a627006912daa900000014003ecbcde4e26756f7b7d2525605d4660af97b90815a103cffbb1cb07b5d0293f2c400000000000000140f000236bfdcbdcfbf870ffa02d05ca0d34dfa76d9e9502f7a6ca2dad09575b8be2ffe66726f6d20746f6e20746f20746f6e

receipt:
	cast receipt  0x65647ea2279d1558f7a4b22bddc697a3d7f92f6e84cc2dad342d199ece507ec3 --rpc-url http://localhost:8545 --async

eth-events:
	cast logs --address $(INTEGRATOR_ETH) --json | jq

encode-comment: check-COMMENT
	cast call $(INTEGRATOR_ETH) "encodeCommentVaa(uint16,bytes32,string)(bytes)" 62 00000000000000000000000090f8bf6a479f320ead074411a4b0e7944ea8c9c1 "$(COMMENT)" --rpc-url $(RPC_URL)