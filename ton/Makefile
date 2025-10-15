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
	0xfE82e8f24A51E670133f4268cDfc164c49FC3b37 \
	 "relayComment(bytes)" \
	01000000000100f839dc236163f19e04a8829f659684194e617fe95c9e1ec2e8d4491b777a6ccd073d2e07324cf0fc4c0d5977fe4e97cf58a60df3f3204f4d5595e9acb06471010068ef6d2400000007003ea2071751a88c8f8a9863630196c6b302d033e76fb618bfa8512d106cd7c6f7ca00000000000000070f00020f06dd725549dd60a6ca3743ac532db52789cb15af1f943fe96adbb4c1a861555375706572206d6573736167652066726f6d206d65

eth-events:
	cast logs --address $(INTEGRATOR_ETH) --json | jq

encode-comment: check-COMMENT
	cast call $(INTEGRATOR_ETH) "encodeCommentVaa(uint16,bytes32,string)(bytes)" 62 00000000000000000000000090f8bf6a479f320ead074411a4b0e7944ea8c9c1 "$(COMMENT)" --rpc-url $(RPC_URL)