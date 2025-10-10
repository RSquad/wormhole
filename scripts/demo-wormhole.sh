#!/usr/bin/env bash
# Wormhole Demo: TON ↔ Ethereum комментарии
set -e

# Цвета для вывода
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color
BOLD='\033[1m'

# Адреса контрактов
ETH_INTEGRATOR="0x9fe46736679d2d9a65f0992f2272de9f3c7fa6e0"
TON_INTEGRATOR="kQBWynzOaXFc4Hzpv-zoo6JQegzz5GRrolfl8rt59wfXqidk"
ETH_RPC="http://localhost:8545"

# Функция для красивого вывода
print_header() {
    echo -e "${BOLD}${BLUE}"
    echo "════════════════════════════════════════════════════════════════"
    echo "  $1"
    echo "════════════════════════════════════════════════════════════════"
    echo -e "${NC}"
}

print_step() {
    echo -e "${YELLOW}► $1${NC}"
}

print_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

wait_for_enter() {
    echo ""
    echo -e "${YELLOW}Нажмите Enter для продолжения...${NC}"
    read
}

# Проверка зависимостей
check_dependencies() {
    print_header "Проверка зависимостей"
    
    if ! command -v worm &> /dev/null; then
        echo -e "${RED}❌ worm CLI не найден${NC}"
        exit 1
    fi
    print_success "worm CLI установлен"
    
    if ! command -v cast &> /dev/null; then
        echo -e "${RED}❌ cast (Foundry) не найден${NC}"
        exit 1
    fi
    print_success "cast (Foundry) установлен"
    
    if ! cast block-number --rpc-url $ETH_RPC &> /dev/null; then
        echo -e "${RED}❌ Ethereum devnet не запущен на $ETH_RPC${NC}"
        exit 1
    fi
    print_success "Ethereum devnet запущен"
    
    wait_for_enter
}

# Демо 1: TON → TON
demo_ton_to_ton() {
    print_header "ДЕМО 1: TON → TON (через Wormhole)"
    
    print_step "Шаг 1: Отправляем комментарий из TON"
    echo "Контракт TON Integrator вызывает SendComment()..."
    echo "Payload: CommentVaa { to: <адрес>, comment: 'Hello TON!' }"
    
    wait_for_enter
    
    print_step "Шаг 2: Wormhole Guardians создают VAA"
    echo "VAA подписывается и готов к relay..."
    
    # Симулируем получение VAA
    TON_VAA="AQAAAAABAPa2h0ZAxSFtBs/svhsgnSa89ISMqjvciKqcBgdYGCpheCh6TrUQNVrP+dq2ny/7+qtZeOUKCFiYfopSDKfGZCIBaOLvYgAAAAEAPkzwEB5sEMDFrW8RFyuIhyxElopxYP1GwJh0wwf5cnA6AAAAAAAAAAABMjY3WzgwMDFFMERCQUU0QUE5M0JBQzE0RDk0NkU4NzU4QTY1QjZBNEYxMzk2MkI1RTNGMjg3RkQyRDVCNzY5ODM1MEMyQUFfXSAtPiB7CiAgODhbNzM2NTYzNkY2RTY0MjA3MDZGNzM3NF0KfQ=="
    
    wait_for_enter
    
    print_step "Шаг 3: Парсим VAA"
    cd /Users/marina/GolandProjects/wormhole/clients/js
    npx tsx src/main.ts parse "$TON_VAA" | head -20
    
    wait_for_enter
    
    print_step "Шаг 4: Отправляем VAA на TON через worm submit"
    echo "Команда:"
    echo "  worm submit <VAA> --chain Ton --network devnet --contract-address $TON_INTEGRATOR"
    echo ""
    
    npx tsx src/main.ts submit "$TON_VAA" \
        --chain Ton \
        --network devnet \
        --contract-address "$TON_INTEGRATOR"
    
    print_success "Комментарий доставлен в TON!"
    
    wait_for_enter
}

# Демо 2: TON → Ethereum
demo_ton_to_eth() {
    print_header "ДЕМО 2: TON → Ethereum (кросс-чейн)"
    
    print_step "Шаг 1: Имеем VAA из TON с комментарием"
    TON_VAA="AQAAAAABAPa2h0ZAxSFtBs/svhsgnSa89ISMqjvciKqcBgdYGCpheCh6TrUQNVrP+dq2ny/7+qtZeOUKCFiYfopSDKfGZCIBaOLvYgAAAAEAPkzwEB5sEMDFrW8RFyuIhyxElopxYP1GwJh0wwf5cnA6AAAAAAAAAAABMjY3WzgwMDFFMERCQUU0QUE5M0JBQzE0RDk0NkU4NzU4QTY1QjZBNEYxMzk2MkI1RTNGMjg3RkQyRDVCNzY5ODM1MEMyQUFfXSAtPiB7CiAgODhbNzM2NTYzNkY2RTY0MjA3MDZGNzM3NF0KfQ=="
    
    print_info "VAA готов к отправке на Ethereum"
    
    wait_for_enter
    
    print_step "Шаг 2: Парсим VAA и проверяем payload"
    cd /Users/marina/GolandProjects/wormhole/clients/js
    npx tsx src/main.ts parse "$TON_VAA" 2>/dev/null | grep -A 5 "type\|emitterChain\|payload" | head -10
    
    wait_for_enter
    
    print_step "Шаг 3: Отправляем VAA на Ethereum CommentIntegrator"
    echo "Команда:"
    echo "  worm submit <VAA> --chain Ethereum --network devnet --contract-address $ETH_INTEGRATOR"
    echo ""
    
    TX_HASH=$(npx tsx src/main.ts submit "$TON_VAA" \
        --chain Ethereum \
        --network devnet \
        --contract-address "$ETH_INTEGRATOR" 2>&1 | grep "Transaction sent:" | awk '{print $3}')
    
    print_success "VAA доставлен в Ethereum!"
    print_info "Transaction hash: $TX_HASH"
    
    wait_for_enter
    
    print_step "Шаг 4: Проверяем событие CommentReceived в Ethereum"
    source /Users/marina/.zshenv
    cast logs --address "$ETH_INTEGRATOR" \
        "CommentReceived(uint16,bytes32,address,string)" \
        --rpc-url "$ETH_RPC" | tail -15
    
    print_success "Событие зафиксировано! Комментарий из TON получен в Ethereum!"
    
    wait_for_enter
}

# Демо 3: Ethereum → TON
demo_eth_to_ton() {
    print_header "ДЕМО 3: Ethereum → TON (кросс-чейн)"
    
    print_step "Шаг 1: Отправляем комментарий из Ethereum контракта"
    
    print_info "Вызываем CommentIntegrator.sendComment()..."
    echo "  to: 0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0"
    echo "  comment: 'Hello TON from Ethereum!'"
    echo ""
    
    source /Users/marina/.zshenv
    
    # Получаем message fee
    FEE=$(cast call "$ETH_INTEGRATOR" "getMessageFee()(uint256)" --rpc-url "$ETH_RPC")
    print_info "Message fee: $FEE wei"
    
    wait_for_enter
    
    print_step "Шаг 2: Отправляем транзакцию"
    
    TX_HASH=$(cast send "$ETH_INTEGRATOR" \
        "sendComment(address,string,uint32,uint8)" \
        "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb0" \
        "Hello TON from Ethereum!" \
        0 \
        15 \
        --rpc-url "$ETH_RPC" \
        --private-key 0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
        --value "$FEE" \
        --json | jq -r '.transactionHash')
    
    print_success "Комментарий отправлен в Wormhole!"
    print_info "Transaction hash: $TX_HASH"
    
    wait_for_enter
    
    print_step "Шаг 3: Проверяем событие CommentSent"
    cast logs --address "$ETH_INTEGRATOR" \
        "CommentSent(address,address,string,uint64)" \
        --rpc-url "$ETH_RPC" | tail -10
    
    wait_for_enter
    
    print_step "Шаг 4: Получаем VAA от Guardians"
    echo "В реальном devnet нужно дождаться ~5 секунд и получить VAA через API..."
    echo "Для демо используем симуляцию:"
    echo ""
    print_info "VAA будет иметь формат EthComment payload"
    
    wait_for_enter
    
    print_step "Шаг 5: Отправляем VAA на TON"
    echo "Команда:"
    echo "  worm submit <VAA_FROM_ETH> --chain Ton --network devnet --contract-address $TON_INTEGRATOR"
    echo ""
    print_info "TON Integrator.RelayComment() получит VAA и доставит комментарий получателю"
    
    print_success "Полный цикл Ethereum → TON готов!"
    
    wait_for_enter
}

# Главное меню
show_menu() {
    clear
    print_header "🌉 WORMHOLE DEMO: TON ↔ ETHEREUM"
    
    echo "Выберите демо:"
    echo ""
    echo "  1) TON → TON (через Wormhole)"
    echo "  2) TON → Ethereum (кросс-чейн)"
    echo "  3) Ethereum → TON (кросс-чейн)"
    echo "  4) Полное демо (все 3 сценария)"
    echo "  5) Выход"
    echo ""
    echo -n "Ваш выбор: "
    read choice
    
    case $choice in
        1)
            demo_ton_to_ton
            ;;
        2)
            demo_ton_to_eth
            ;;
        3)
            demo_eth_to_ton
            ;;
        4)
            check_dependencies
            demo_ton_to_ton
            demo_ton_to_eth
            demo_eth_to_ton
            print_header "🎉 ВСЕ ДЕМО ЗАВЕРШЕНЫ!"
            ;;
        5)
            echo "До свидания!"
            exit 0
            ;;
        *)
            echo "Неверный выбор"
            sleep 1
            show_menu
            ;;
    esac
    
    echo ""
    echo -e "${YELLOW}Вернуться в меню? (y/n)${NC}"
    read back
    if [ "$back" = "y" ]; then
        show_menu
    fi
}

# Запуск
if [ "$1" = "--auto" ]; then
    # Автоматический режим для полного демо
    check_dependencies
    demo_ton_to_ton
    demo_ton_to_eth
    demo_eth_to_ton
else
    show_menu
fi



